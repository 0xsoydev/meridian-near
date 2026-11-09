use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::json_types::{I128, U128};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::store::{IterableMap, LookupMap, LookupSet};
use near_sdk::{
    env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError, PromiseOrValue,
};

pub const MIN_FUND: u128 = 100_000;
pub const MM_BPS: u128 = 500;
pub const FEE_BPS: u128 = 10;
pub const LIQ_BPS: u128 = 50;
pub const MAX_STALENESS: u64 = 600;
pub const MAX_MOVE_BPS: u128 = 1_000;
pub const MIN_POST_GAP: u64 = 60;
pub const HISTORY: u64 = 120;
pub const FT_GAS: Gas = Gas::from_tgas(30);
pub const CALLBACK_GAS: Gas = Gas::from_tgas(10);

const ONE: i128 = 1_000_000;
const FUNDING_SCALE: i128 = 1_000_000_000_000_000_000_000_000;

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Default)]
pub struct Cap {
    pub per_day: u128,
    pub day: u64,
    pub used: u128,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Default)]
pub struct Market {
    pub max_leverage: u32,
    pub max_oi: u128,
    pub funding_k: i128,
    pub long_oi: u128,
    pub short_oi: u128,
    pub cum_funding: i128,
    pub last_accrual: u64,
    pub price: u128,
    pub updated_at: u64,
    pub post_count: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Default)]
pub struct Position {
    pub size: i128,
    pub margin: u128,
    pub entry_price: u128,
    pub entry_cum_funding: i128,
}

#[derive(BorshSerialize, BorshDeserialize, Clone, Copy, Default)]
pub struct Post {
    pub price: u128,
    pub at: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct Rollup {
    pub minute: u64,
    pub fills: u32,
    pub mixed_tokens: u128,
    pub charge: u128,
    pub vwap: u128,
    pub root: String,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct CapView {
    pub per_day: U128,
    pub used_today: U128,
    pub left: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct TreasuryView {
    pub treasury: U128,
    pub vault: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct MarketView {
    pub listed: bool,
    pub price: U128,
    pub updated_at: u64,
    pub long_oi: U128,
    pub short_oi: U128,
    pub funding_rate: I128,
    pub max_leverage: u32,
    pub max_oi: U128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct PositionView {
    pub size: I128,
    pub margin: U128,
    pub entry_price: U128,
    pub equity: I128,
    pub funding_owed: I128,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct PostView {
    pub price: U128,
    pub at: u64,
}

#[derive(Serialize)]
#[serde(crate = "near_sdk::serde")]
pub struct RollupView {
    pub minute: u64,
    pub fills: u32,
    pub mixed_tokens: U128,
    pub charge: U128,
    pub vwap: U128,
    pub root: String,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct CapMsg {
    pub key: String,
    pub per_day: U128,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde", rename_all = "snake_case")]
pub enum FundMsg {
    Fund { to: Option<AccountId>, cap: Option<CapMsg> },
    FundVault,
}

#[derive(Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct RollupInput {
    pub model: String,
    pub minute: u64,
    pub fills: u32,
    pub mixed_tokens: U128,
    pub charge: U128,
    pub vwap: U128,
    pub usage_root: String,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Core {
    owner: AccountId,
    ops: AccountId,
    usdc: AccountId,
    wallets: LookupMap<AccountId, u128>,
    caps: LookupMap<(AccountId, String), Cap>,
    treasury: u128,
    vault: u128,
    paid: LookupSet<String>,
    markets: LookupMap<String, Market>,
    positions: IterableMap<(AccountId, String), Position>,
    posts: LookupMap<(String, u8), Post>,
    rollups: LookupMap<(String, u8), Rollup>,
}

#[near]
impl Core {
    #[init]
    pub fn new(owner: AccountId, ops: AccountId, usdc: AccountId) -> Self {
        Self {
            owner,
            ops,
            usdc,
            wallets: LookupMap::new(b"w"),
            caps: LookupMap::new(b"c"),
            treasury: 0,
            vault: 0,
            paid: LookupSet::new(b"p"),
            markets: LookupMap::new(b"m"),
            positions: IterableMap::new(b"o"),
            posts: LookupMap::new(b"i"),
            rollups: LookupMap::new(b"r"),
        }
    }

    pub fn ft_on_transfer(&mut self, sender_id: AccountId, amount: U128, msg: String) -> PromiseOrValue<U128> {
        require!(env::predecessor_account_id() == self.usdc, "only USDC");
        let amount = amount.0;
        if amount < MIN_FUND {
            return PromiseOrValue::Value(U128(amount));
        }
        let Ok(action) = near_sdk::serde_json::from_str::<FundMsg>(&msg) else {
            return PromiseOrValue::Value(U128(amount));
        };
        match action {
            FundMsg::FundVault => {
                require!(sender_id == self.owner, "owner only");
                self.vault += amount;
                emit("vault_funded", near_sdk::serde_json::json!({ "amount": amount.to_string() }));
            }
            FundMsg::Fund { to, cap } => {
                let to = to.unwrap_or_else(|| sender_id.clone());
                if let Some(cap) = cap {
                    require!(to == sender_id, "a cap only on your own wallet");
                    self.store_cap(&sender_id, cap.key, cap.per_day.0);
                }
                self.credit(&to, amount);
                emit(
                    "fund",
                    near_sdk::serde_json::json!({ "account": to, "amount": amount.to_string() }),
                );
            }
        }
        PromiseOrValue::Value(U128(0))
    }

    #[payable]
    pub fn withdraw(&mut self, amount: U128, to: Option<AccountId>) -> Promise {
        near_sdk::assert_one_yocto();
        let caller = env::predecessor_account_id();
        let amount = amount.0;
        let balance = self.wallet_of(&caller);
        require!(balance >= amount, "wallet is short");
        self.wallets.insert(caller.clone(), balance - amount);
        let receiver = to.unwrap_or_else(|| caller.clone());
        emit(
            "withdraw",
            near_sdk::serde_json::json!({
                "account": caller,
                "to": receiver,
                "amount": amount.to_string(),
            }),
        );
        ext_ft::ext(self.usdc.clone())
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .with_static_gas(FT_GAS)
            .ft_transfer(receiver, U128(amount), None)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(CALLBACK_GAS)
                    .on_withdraw(caller, U128(amount)),
            )
    }

    #[private]
    pub fn on_withdraw(
        &mut self,
        account: AccountId,
        amount: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) {
        if result.is_err() {
            self.credit(&account, amount.0);
        }
    }

    #[payable]
    pub fn set_cap(&mut self, key: String, per_day: U128) {
        near_sdk::assert_one_yocto();
        let owner = env::predecessor_account_id();
        self.store_cap(&owner, key, per_day.0);
    }

    pub fn pull(&mut self, owner: AccountId, key: String, amount: U128) -> U128 {
        self.assert_ops();
        let amount = amount.0;
        let today = day();
        let mut cap = self.caps.get(&(owner.clone(), key.clone())).copied().unwrap_or_default();
        if cap.day != today {
            cap.day = today;
            cap.used = 0;
        }
        let left = cap.per_day.saturating_sub(cap.used);
        require!(amount <= left, "past today's limit");
        let balance = self.wallet_of(&owner);
        require!(balance >= amount, "wallet is short");
        self.wallets.insert(owner.clone(), balance - amount);
        self.treasury += amount;
        cap.used += amount;
        self.caps.insert((owner.clone(), key.clone()), cap);
        emit(
            "pull",
            near_sdk::serde_json::json!({
                "owner": owner,
                "key": key,
                "amount": amount.to_string(),
                "left": (cap.per_day - cap.used).to_string(),
            }),
        );
        U128(cap.per_day - cap.used)
    }

    pub fn payout(&mut self, to: AccountId, amount: U128, id: String) {
        require!(
            env::predecessor_account_id() == self.ops || env::predecessor_account_id() == self.owner,
            "ops or owner"
        );
        let amount = amount.0;
        require!(!self.paid.contains(&id), "already paid");
        require!(self.treasury >= amount, "treasury is short");
        self.treasury -= amount;
        self.paid.insert(id.clone());
        self.credit(&to, amount);
        emit(
            "payout",
            near_sdk::serde_json::json!({ "account": to, "amount": amount.to_string(), "id": id }),
        );
    }

    pub fn list_market(&mut self, model: String, max_leverage: u32, max_oi: U128, funding_k: I128) {
        self.assert_owner();
        require!(max_leverage > 0, "max leverage must be positive");
        require!(max_oi.0 > 0, "max open interest must be positive");
        let market = Market {
            max_leverage,
            max_oi: max_oi.0,
            funding_k: funding_k.0,
            last_accrual: env::block_timestamp() / 1_000_000_000,
            ..Default::default()
        };
        self.markets.insert(model.clone(), market);
        emit(
            "market_listed",
            near_sdk::serde_json::json!({
                "model": model,
                "max_leverage": max_leverage,
                "max_oi": max_oi.0.to_string(),
                "funding_k": funding_k.0.to_string(),
            }),
        );
    }

    pub fn post(&mut self, model: String, price: U128) {
        self.assert_ops();
        let price = price.0;
        require!(price > 0, "ZeroPrice");
        let mut market = self.market_or_panic(&model);
        let now = env::block_timestamp() / 1_000_000_000;
        if market.updated_at > 0 {
            require!(now >= market.updated_at + MIN_POST_GAP, "one post a minute");
            let diff = price.abs_diff(market.price);
            require!(diff * 10_000 <= market.price * MAX_MOVE_BPS, "PriceMoveTooLarge");
        }
        market.price = price;
        market.updated_at = now;
        market.post_count += 1;
        let slot = (market.post_count % HISTORY) as u8;
        self.posts.insert((model.clone(), slot), Post { price, at: now });
        self.markets.insert(model.clone(), market);
        emit(
            "index_posted",
            near_sdk::serde_json::json!({
                "model": model,
                "price": price.to_string(),
                "at": now,
            }),
        );
    }

    pub fn log_rollups(&mut self, rollups: Vec<RollupInput>) {
        self.assert_ops();
        for entry in rollups {
            let slot = (entry.minute % HISTORY) as u8;
            self.rollups.insert(
                (entry.model.clone(), slot),
                Rollup {
                    minute: entry.minute,
                    fills: entry.fills,
                    mixed_tokens: entry.mixed_tokens.0,
                    charge: entry.charge.0,
                    vwap: entry.vwap.0,
                    root: entry.usage_root.clone(),
                },
            );
            emit(
                "rollup",
                near_sdk::serde_json::json!({
                    "model": entry.model,
                    "minute": entry.minute,
                    "fills": entry.fills,
                    "mixed_tokens": entry.mixed_tokens.0.to_string(),
                    "charge": entry.charge.0.to_string(),
                    "vwap": entry.vwap.0.to_string(),
                    "usage_root": entry.usage_root,
                }),
            );
        }
    }

    #[payable]
    pub fn modify(&mut self, model: String, size_delta: I128, margin_delta: I128) -> PositionView {
        near_sdk::assert_one_yocto();
        let caller = env::predecessor_account_id();
        let size_delta = size_delta.0;
        let margin_delta = margin_delta.0;
        let mut market = self.market_or_panic(&model);
        let price = self.fresh_price(&market);
        accrue(&mut market, price);

        let key = (caller.clone(), model.clone());
        let mut position = self.positions.get(&key).copied().unwrap_or_default();
        let old_size = position.size;
        let new_size = old_size.checked_add(size_delta).expect("size overflow");
        require!(
            !((old_size > 0 && new_size < 0) || (old_size < 0 && new_size > 0)),
            "FlipNotAllowed"
        );

        let owed = funding_owed(old_size, market.cum_funding, position.entry_cum_funding);
        let mut margin = position.margin as i128 - owed;
        let mut vault_balance = self.vault as i128 + owed;
        let old_abs = old_size.unsigned_abs();
        let new_abs = new_size.unsigned_abs();

        if new_abs > old_abs {
            let added = new_abs - old_abs;
            position.entry_price = (old_abs * position.entry_price + added * price) / new_abs;
        } else if new_abs < old_abs {
            let realized = pnl(old_size - new_size, position.entry_price, price);
            margin += realized;
            vault_balance -= realized;
        }
        position.entry_cum_funding = market.cum_funding;

        let fee = fee_for(size_delta, price);
        margin = margin - fee as i128 + margin_delta;

        if old_size > 0 || new_size > 0 {
            market.long_oi = market.long_oi + new_abs - old_abs;
        } else {
            market.short_oi = market.short_oi + new_abs - old_abs;
        }
        if new_abs > old_abs {
            let side = if new_size > 0 { market.long_oi } else { market.short_oi };
            require!(side <= market.max_oi, "OiCapExceeded");
        }

        let mut payout = 0u128;
        let mut final_margin = 0u128;
        if new_size == 0 {
            if margin < 0 {
                require!(margin_delta >= 0, "InsufficientMargin");
                vault_balance += margin;
            } else {
                payout = margin as u128;
            }
            self.positions.remove(&key);
        } else {
            require!(margin >= 0, "InsufficientMargin");
            position.size = new_size;
            position.margin = margin as u128;
            final_margin = position.margin;
            let equity = margin + pnl(new_size, position.entry_price, price);
            if (new_abs > old_abs || margin_delta < 0)
                && equity * market.max_leverage as i128 < notional(new_size, price) as i128
            {
                panic!("InsufficientMargin");
            }
            self.positions.insert(key.clone(), position);
        }

        require!(vault_balance >= 0, "VaultInsufficient");
        self.vault = vault_balance as u128;

        if margin_delta > 0 {
            self.debit(&caller, margin_delta as u128);
        } else if margin_delta < 0 {
            self.credit(&caller, (-margin_delta) as u128);
        }
        if payout > 0 {
            self.credit(&caller, payout);
        }
        self.treasury += fee;
        self.markets.insert(model.clone(), market);

        emit(
            "position_modified",
            near_sdk::serde_json::json!({
                "account": caller,
                "model": model,
                "size": new_size.to_string(),
                "margin": final_margin.to_string(),
                "price": price.to_string(),
                "fee": fee.to_string(),
            }),
        );
        self.position_view(&caller, &model)
    }

    pub fn liquidate(&mut self, account: AccountId, model: String) {
        let mut market = self.market_or_panic(&model);
        let price = self.fresh_price(&market);
        accrue(&mut market, price);

        let key = (account.clone(), model.clone());
        let position = self.positions.get(&key).copied().unwrap_or_default();
        require!(position.size != 0, "NotLiquidatable");
        let equity = equity_at(&position, price, market.cum_funding);
        let size_notional = notional(position.size, price);
        require!(equity * 10_000 < (size_notional * MM_BPS) as i128, "NotLiquidatable");

        let reward = equity.max(0).min((size_notional * LIQ_BPS / 10_000) as i128) as u128;
        let mut vault_balance = self.vault as i128 + position.margin as i128 - reward as i128;
        require!(vault_balance >= 0, "VaultInsufficient");
        self.vault = vault_balance as u128;

        if position.size > 0 {
            market.long_oi -= position.size as u128;
        } else {
            market.short_oi -= position.size.unsigned_abs();
        }
        self.positions.remove(&key);
        self.markets.insert(model.clone(), market);

        if reward > 0 {
            self.credit(&env::predecessor_account_id(), reward);
        }
        emit(
            "liquidated",
            near_sdk::serde_json::json!({
                "account": account,
                "model": model,
                "liquidator": env::predecessor_account_id(),
                "reward": reward.to_string(),
            }),
        );
    }

    pub fn wallet(&self, account: AccountId) -> U128 {
        U128(self.wallet_of(&account))
    }

    pub fn cap(&self, owner: AccountId, key: String) -> CapView {
        let cap = self.caps.get(&(owner, key)).copied().unwrap_or_default();
        let used = if cap.day == day() { cap.used } else { 0 };
        CapView {
            per_day: U128(cap.per_day),
            used_today: U128(used),
            left: U128(cap.per_day.saturating_sub(used)),
        }
    }

    pub fn treasury(&self) -> TreasuryView {
        TreasuryView {
            treasury: U128(self.treasury),
            vault: U128(self.vault),
        }
    }

    pub fn market(&self, model: String) -> MarketView {
        let market = self.markets.get(&model).copied().unwrap_or_default();
        let listed = market.max_oi > 0;
        MarketView {
            listed,
            price: U128(market.price),
            updated_at: market.updated_at,
            long_oi: U128(market.long_oi),
            short_oi: U128(market.short_oi),
            funding_rate: I128(rate(&market)),
            max_leverage: market.max_leverage,
            max_oi: U128(market.max_oi),
        }
    }

    pub fn position(&self, account: AccountId, model: String) -> PositionView {
        self.position_view(&account, &model)
    }

    pub fn equity(&self, account: AccountId, model: String) -> I128 {
        let market = self.markets.get(&model).copied().unwrap_or_default();
        let position = self
            .positions
            .get(&(account, model))
            .copied()
            .unwrap_or_default();
        I128(equity_at(&position, market.price, cum_funding_at(&market, market.price)))
    }

    pub fn can_liquidate(&self, account: AccountId, model: String) -> bool {
        let market = self.markets.get(&model).copied().unwrap_or_default();
        if market.updated_at == 0 {
            return false;
        }
        let position = self
            .positions
            .get(&(account, model))
            .copied()
            .unwrap_or_default();
        is_liquidatable(
            &position,
            market.price,
            cum_funding_at(&market, market.price),
        )
    }

    pub fn liquidatable(&self, from: u32, limit: u32) -> Vec<(AccountId, String)> {
        let mut out = Vec::new();
        for ((account, model), position) in self
            .positions
            .iter()
            .skip(from as usize)
            .take(limit as usize)
        {
            let market = self.markets.get(model).copied().unwrap_or_default();
            if market.updated_at == 0 {
                continue;
            }
            if is_liquidatable(position, market.price, cum_funding_at(&market, market.price)) {
                out.push((account.clone(), model.clone()));
            }
        }
        out
    }

    pub fn posts(&self, model: String) -> Vec<PostView> {
        let mut out = Vec::new();
        for slot in 0..HISTORY as u8 {
            if let Some(post) = self.posts.get(&(model.clone(), slot)) {
                out.push(PostView {
                    price: U128(post.price),
                    at: post.at,
                });
            }
        }
        out.sort_by_key(|entry| entry.at);
        out
    }

    pub fn rollups(&self, model: String, since_minute: u64) -> Vec<RollupView> {
        let mut out = Vec::new();
        for slot in 0..HISTORY as u8 {
            if let Some(rollup) = self.rollups.get(&(model.clone(), slot)) {
                if rollup.minute < since_minute {
                    continue;
                }
                out.push(RollupView {
                    minute: rollup.minute,
                    fills: rollup.fills,
                    mixed_tokens: U128(rollup.mixed_tokens),
                    charge: U128(rollup.charge),
                    vwap: U128(rollup.vwap),
                    root: rollup.root.clone(),
                });
            }
        }
        out.sort_by_key(|entry| entry.minute);
        out
    }
}

impl Core {
    fn wallet_of(&self, account: &AccountId) -> u128 {
        self.wallets.get(account).copied().unwrap_or(0)
    }

    fn credit(&mut self, account: &AccountId, amount: u128) {
        let balance = self.wallet_of(account);
        self.wallets.insert(account.clone(), balance + amount);
    }

    fn debit(&mut self, account: &AccountId, amount: u128) {
        let balance = self.wallet_of(account);
        require!(balance >= amount, "wallet is short");
        self.wallets.insert(account.clone(), balance - amount);
    }

    fn store_cap(&mut self, owner: &AccountId, key: String, per_day: u128) {
        self.caps.insert(
            (owner.clone(), key.clone()),
            Cap {
                per_day,
                day: day(),
                used: 0,
            },
        );
        emit(
            "cap_set",
            near_sdk::serde_json::json!({
                "owner": owner,
                "key": key,
                "per_day": per_day.to_string(),
            }),
        );
    }

    fn market_or_panic(&self, model: &str) -> Market {
        let market = self.markets.get(&model.to_string()).copied().unwrap_or_default();
        require!(market.max_oi > 0, "MarketUnknown");
        market
    }

    fn fresh_price(&self, market: &Market) -> u128 {
        require!(market.updated_at > 0, "StalePrice");
        require!(
            env::block_timestamp() / 1_000_000_000 <= market.updated_at + MAX_STALENESS,
            "StalePrice"
        );
        market.price
    }

    fn assert_ops(&self) {
        require!(env::predecessor_account_id() == self.ops, "ops only");
    }

    fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "owner only");
    }

    fn position_view(&self, account: &AccountId, model: &str) -> PositionView {
        let market = self.markets.get(&model.to_string()).copied().unwrap_or_default();
        let position = self
            .positions
            .get(&(account.clone(), model.to_string()))
            .copied()
            .unwrap_or_default();
        let cum = cum_funding_at(&market, market.price);
        let owed = funding_owed(position.size, cum, position.entry_cum_funding);
        PositionView {
            size: I128(position.size),
            margin: U128(position.margin),
            entry_price: U128(position.entry_price),
            equity: I128(equity_at(&position, market.price, cum)),
            funding_owed: I128(owed),
        }
    }
}

fn day() -> u64 {
    env::block_timestamp() / 86_400_000_000_000
}

fn now_seconds() -> u64 {
    env::block_timestamp() / 1_000_000_000
}

fn pnl(size: i128, entry_price: u128, price: u128) -> i128 {
    size * (price as i128 - entry_price as i128) / ONE
}

fn notional(size: i128, price: u128) -> u128 {
    size.unsigned_abs() * price / ONE as u128
}

fn funding_owed(size: i128, cum: i128, entry_cum: i128) -> i128 {
    size * (cum - entry_cum) / FUNDING_SCALE
}

fn rate(market: &Market) -> i128 {
    let total = (market.long_oi + market.short_oi).max(ONE as u128) as i128;
    market.funding_k * (market.long_oi as i128 - market.short_oi as i128) / total
}

fn cum_funding_at(market: &Market, price: u128) -> i128 {
    let elapsed = now_seconds().saturating_sub(market.last_accrual) as i128;
    market.cum_funding + rate(market) * elapsed * price as i128
}

fn accrue(market: &mut Market, price: u128) {
    market.cum_funding = cum_funding_at(market, price);
    market.last_accrual = now_seconds();
}

fn fee_for(size_delta: i128, price: u128) -> u128 {
    let notional = size_delta.unsigned_abs() * price;
    (notional * FEE_BPS + 9_999_999_999) / 10_000_000_000
}

fn equity_at(position: &Position, price: u128, cum: i128) -> i128 {
    position.margin as i128 + pnl(position.size, position.entry_price, price)
        - funding_owed(position.size, cum, position.entry_cum_funding)
}

fn is_liquidatable(position: &Position, price: u128, cum: i128) -> bool {
    if position.size == 0 {
        return false;
    }
    equity_at(position, price, cum) * 10_000 < (notional(position.size, price) * MM_BPS) as i128
}

fn emit(event: &str, data: near_sdk::serde_json::Value) {
    let log = near_sdk::serde_json::json!({
        "standard": "meridian",
        "version": "1.0.0",
        "event": event,
        "data": data,
    });
    env::log_str(&format!("EVENT_JSON:{log}"));
}

#[near_sdk::ext_contract(ext_ft)]
pub trait Ft {
    fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>);
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    fn core() -> Core {
        testing_env!(context(accounts(0)).build());
        Core::new(accounts(0), accounts(1), accounts(2))
    }

    fn fund(core: &mut Core, sender: AccountId, amount: u128, msg: &str) -> u128 {
        testing_env!(context(accounts(2)).build());
        match core.ft_on_transfer(sender, U128(amount), msg.to_string()) {
            PromiseOrValue::Value(unused) => unused.0,
            PromiseOrValue::Promise(_) => panic!("ft_on_transfer returned a promise"),
        }
    }

    fn list_and_post(core: &mut Core, price: u128) {
        let mut owner = context(accounts(0));
        owner.block_timestamp(1_000_000_000);
        testing_env!(owner.build());
        core.list_market("glm".to_string(), 5, U128(1_000_000_000_000), I128(0));
        let mut ops = context(accounts(1));
        ops.block_timestamp(1_000_000_000);
        testing_env!(ops.build());
        core.post("glm".to_string(), U128(price));
    }

    #[test]
    fn fund_credits_the_wallet() {
        let mut core = core();
        let unused = fund(&mut core, accounts(0), 1_000_000, r#"{"fund":{}}"#);
        assert_eq!(unused, 0);
        testing_env!(context(accounts(0)).build());
        assert_eq!(core.wallet(accounts(0)).0, 1_000_000);
    }

    #[test]
    fn a_third_party_fund_cannot_set_a_cap() {
        let mut core = core();
        let msg = format!(
            r#"{{"fund":{{"to":"{}","cap":{{"key":"k","per_day":"1000000"}}}}}}"#,
            accounts(3)
        );
        let unused = fund(&mut core, accounts(0), 1_000_000, &msg);
        assert_eq!(unused, 1_000_000);
        testing_env!(context(accounts(0)).build());
        assert_eq!(core.wallet(accounts(3)).0, 0);
    }

    #[test]
    fn a_fund_with_a_cap_sets_the_limit() {
        let mut core = core();
        let msg = r#"{"fund":{"cap":{"key":"k","per_day":"500000"}}}"#;
        fund(&mut core, accounts(0), 1_000_000, msg);
        testing_env!(context(accounts(0)).build());
        let cap = core.cap(accounts(0), "k".to_string());
        assert_eq!(cap.per_day.0, 500_000);
        assert_eq!(cap.left.0, 500_000);
    }

    #[test]
    fn pull_moves_money_inside_the_limit() {
        let mut core = core();
        let msg = r#"{"fund":{"cap":{"key":"k","per_day":"500000"}}}"#;
        fund(&mut core, accounts(0), 1_000_000, msg);
        testing_env!(context(accounts(1)).build());
        let left = core.pull(accounts(0), "k".to_string(), U128(300_000));
        assert_eq!(left.0, 200_000);
        assert_eq!(core.treasury().treasury.0, 300_000);
        testing_env!(context(accounts(0)).build());
        assert_eq!(core.wallet(accounts(0)).0, 700_000);
    }

    #[test]
    #[should_panic(expected = "past today's limit")]
    fn pull_past_the_limit_panics() {
        let mut core = core();
        let msg = r#"{"fund":{"cap":{"key":"k","per_day":"500000"}}}"#;
        fund(&mut core, accounts(0), 1_000_000, msg);
        testing_env!(context(accounts(1)).build());
        core.pull(accounts(0), "k".to_string(), U128(500_001));
    }

    #[test]
    fn the_limit_rolls_over_at_utc_midnight() {
        let mut core = core();
        let mut builder = context(accounts(2));
        builder.block_timestamp(86_400_000_000_000);
        testing_env!(builder.build());
        let msg = r#"{"fund":{"cap":{"key":"k","per_day":"500000"}}}"#;
        core.ft_on_transfer(accounts(0), U128(1_000_000), msg.to_string());

        testing_env!(context(accounts(1)).build());
        core.pull(accounts(0), "k".to_string(), U128(500_000));

        let mut tomorrow = context(accounts(1));
        tomorrow.block_timestamp(2 * 86_400_000_000_000);
        testing_env!(tomorrow.build());
        let left = core.pull(accounts(0), "k".to_string(), U128(500_000));
        assert_eq!(left.0, 0);
    }

    #[test]
    fn a_payout_id_pays_once() {
        let mut core = core();
        let msg = r#"{"fund":{"cap":{"key":"k","per_day":"500000"}}}"#;
        fund(&mut core, accounts(0), 1_000_000, msg);
        testing_env!(context(accounts(1)).build());
        core.pull(accounts(0), "k".to_string(), U128(400_000));
        core.payout(accounts(3), U128(100_000), "p1".to_string());
        testing_env!(context(accounts(3)).build());
        assert_eq!(core.wallet(accounts(3)).0, 100_000);

        testing_env!(context(accounts(1)).build());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            core.payout(accounts(3), U128(100_000), "p1".to_string());
        }));
        assert!(result.is_err());
    }

    #[test]
    fn withdraw_debits_the_wallet() {
        let mut core = core();
        fund(&mut core, accounts(0), 1_000_000, r#"{"fund":{}}"#);
        let mut builder = context(accounts(0));
        builder.attached_deposit(NearToken::from_yoctonear(1));
        testing_env!(builder.build());
        let _ = core.withdraw(U128(400_000), None);
        assert_eq!(core.wallet(accounts(0)).0, 600_000);
    }

    #[test]
    fn modify_opens_and_closes_a_long() {
        let mut core = core();
        fund(&mut core, accounts(0), 1_000_000, r#"{"fund":{}}"#);
        list_and_post(&mut core, 200_000);

        let mut builder = context(accounts(0));
        builder.attached_deposit(NearToken::from_yoctonear(1));
        testing_env!(builder.build());
        let opened = core.modify("glm".to_string(), I128(1_000_000), I128(200_000));
        assert_eq!(opened.size.0, 1_000_000);
        assert_eq!(core.wallet(accounts(0)).0, 800_000);

        let mut builder = context(accounts(0));
        builder.attached_deposit(NearToken::from_yoctonear(1));
        testing_env!(builder.build());
        let closed = core.modify("glm".to_string(), I128(-1_000_000), I128(0));
        assert_eq!(closed.size.0, 0);
        assert_eq!(core.wallet(accounts(0)).0, 999_600);
    }

    #[test]
    fn a_stale_index_blocks_a_trade() {
        let mut core = core();
        fund(&mut core, accounts(0), 1_000_000, r#"{"fund":{}}"#);
        list_and_post(&mut core, 200_000);

        let mut later = context(accounts(0));
        later
            .block_timestamp(602 * 1_000_000_000)
            .attached_deposit(NearToken::from_yoctonear(1));
        testing_env!(later.build());
        let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            core.modify("glm".to_string(), I128(1_000_000), I128(200_000));
        }));
        assert!(result.is_err());
    }

    #[test]
    fn rollups_come_back_in_minute_order() {
        let mut core = core();
        testing_env!(context(accounts(1)).build());
        let entries = vec![
            RollupInput {
                model: "glm".to_string(),
                minute: 120,
                fills: 2,
                mixed_tokens: U128(10),
                charge: U128(20),
                vwap: U128(30),
                usage_root: "a".repeat(64),
            },
            RollupInput {
                model: "glm".to_string(),
                minute: 118,
                fills: 1,
                mixed_tokens: U128(5),
                charge: U128(6),
                vwap: U128(7),
                usage_root: "b".repeat(64),
            },
        ];
        core.log_rollups(entries);
        testing_env!(context(accounts(0)).build());
        let seen = core.rollups("glm".to_string(), 0);
        assert_eq!(seen.len(), 2);
        assert_eq!(seen[0].minute, 118);
        assert_eq!(seen[1].minute, 120);
    }
}
