"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CommitButton,
  Empty,
  FOCUS,
  Field,
  INPUT,
  INPUT_SM,
  LINK,
  Line,
  MarketSelect,
  ROW,
  SECONDARY,
  Stat,
  TD,
  Table,
  Toggle,
} from "../../../components/kit";
import { KEY_STORAGE, api, percent, railName, shortKey, usd } from "../../../lib/client";
import { MARKETS } from "../../../lib/markets";
import {
  charge,
  fillsToPoints,
  formatMicroPerMtok,
  formatMtok,
  parseMtok,
  parseUsd,
  previewFill,
  sellerEarning,
  stampFormat,
} from "../../../lib/price";
import type {
  Bid,
  BlockedAction,
  Book,
  Holding,
  KeyFill,
  Me,
  ModelRow,
  Offer,
  SellResult,
  TradeResult,
  VenueStatus,
} from "../../../lib/types";
import { CandleChart, INTERVALS, type Interval } from "./chart";
import { OrderBook } from "./order-book";

const TAKE_BPS = 1000n;
const BOOK_MS = 5_000;
const ACCOUNT_MS = 15_000;
const STATUS_MS = 30_000;

type Side = "buy" | "sell";
type Mode = "market" | "limit";
type Tab = "balances" | "holdings" | "orders" | "history";
type Account = { me: Me; holdings: Holding[]; bids: Bid[]; offers: Offer[]; fills: KeyFill[] };
type Notice = { tone: "up" | "down"; text: string; fix: { url: string; label: string } | null };
type Problem = { field: "size" | "limit" | "key"; text: string };
type Level = { price_micro_per_mtok: string; tokens_left: string };
type Order = { id: string; kind: "bid" | "offer"; model: string; price: bigint; tokens: bigint; value: bigint; at: string };

const smaller = (a: bigint, b: bigint) => (a < b ? a : b);
const sum = (values: ReadonlyArray<string>) => values.reduce((total, value) => total + BigInt(value), 0n);

function byPrice(ascending: boolean) {
  return (a: Level, b: Level) => {
    const x = BigInt(a.price_micro_per_mtok);
    const y = BigInt(b.price_micro_per_mtok);
    return x === y ? 0 : (x < y) === ascending ? -1 : 1;
  };
}

function sizeText(tokens: bigint): string {
  return formatMtok(tokens).replaceAll(",", "");
}

function maxBuy(levels: ReadonlyArray<Level>, budget: bigint | null, limit: bigint | null): bigint {
  let left = budget;
  let total = 0n;
  for (const level of levels) {
    const price = BigInt(level.price_micro_per_mtok);
    const depth = BigInt(level.tokens_left);
    if (left === null) {
      total += depth;
      continue;
    }
    const take = smaller(depth, (left * 1_000_000n) / price);
    total += take;
    left -= charge(take, price);
    if (take < depth) return total;
  }
  return left !== null && limit !== null && limit > 0n ? total + (left * 1_000_000n) / limit : total;
}

function remedy(result: { status: number; action: BlockedAction | null }): Notice["fix"] {
  return result.action ? { url: result.action.url, label: result.status === 403 ? "Raise today's limit" : "Fund your wallet" } : null;
}

function Ticker({ value }: { value: string }) {
  const first = useRef(value);
  return (
    <span key={value} className={value === first.current ? undefined : "motion-safe:animate-flash"}>
      {value}
    </span>
  );
}

export default function TradePage() {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [status, setStatus] = useState<VenueStatus | null>(null);
  const [model, setModel] = useState("");
  const [book, setBook] = useState<Book | null>(null);
  const [bucket, setBucket] = useState<Interval>("300");
  const [key, setKey] = useState("");
  const [draftKey, setDraftKey] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [side, setSide] = useState<Side>("buy");
  const [mode, setMode] = useState<Mode>("market");
  const [size, setSize] = useState("1");
  const [limit, setLimit] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("balances");
  const current = useRef("");
  const sizeRef = useRef<HTMLInputElement | null>(null);
  const limitRef = useRef<HTMLInputElement | null>(null);
  const keyRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("model");
    if (wanted) setModel(wanted);
    setKey(localStorage.getItem(KEY_STORAGE) ?? "");
    void api<{ data: ModelRow[] }>("/api/v1/models").then((result) => {
      if (!result.ok) return;
      setModels(result.data.data);
      if (!wanted) setModel(result.data.data.find((row) => row.available_tokens !== "0")?.id ?? MARKETS[0]);
    });
    const readStatus = () =>
      void api<VenueStatus>("/api/v1/status").then((result) => {
        if (result.ok) setStatus(result.data);
      });
    readStatus();
    const id = window.setInterval(readStatus, STATUS_MS);
    return () => window.clearInterval(id);
  }, []);

  const readBook = useCallback(() => {
    const wanted = current.current;
    if (!wanted) return;
    void api<Book>(`/api/v1/book?model=${encodeURIComponent(wanted)}`).then((result) => {
      if (result.ok && result.data.model === current.current) setBook(result.data);
    });
  }, []);

  useEffect(() => {
    if (!model) return;
    current.current = model;
    setBook(null);
    window.history.replaceState(null, "", `?model=${encodeURIComponent(model)}`);
    readBook();
    const id = window.setInterval(readBook, BOOK_MS);
    return () => window.clearInterval(id);
  }, [model, readBook]);

  const readAccount = useCallback(async () => {
    if (!key) {
      setAccount(null);
      setAccountError(null);
      return;
    }
    const [me, holdings, bids, offers, fills] = await Promise.all([
      api<Me>("/api/v1/me", { key }),
      api<{ data: Holding[] }>("/api/v1/holdings", { key }),
      api<{ data: Bid[] }>("/api/v1/bids", { key }),
      api<{ data: Offer[] }>("/api/v1/offers", { key }),
      api<{ data: KeyFill[] }>("/api/v1/fills", { key }),
    ]);
    if (!me.ok) {
      setAccount(null);
      setAccountError(me.status === 401 ? "This key isn't recognised. Change it, or create one on the Wallet page." : me.message);
      return;
    }
    setAccountError(null);
    setAccount({
      me: me.data,
      holdings: holdings.ok ? holdings.data.data : [],
      bids: bids.ok ? bids.data.data : [],
      offers: offers.ok ? offers.data.data : [],
      fills: fills.ok ? fills.data.data : [],
    });
  }, [key]);

  useEffect(() => {
    void readAccount();
    if (!key) return;
    const id = window.setInterval(() => void readAccount(), ACCOUNT_MS);
    return () => window.clearInterval(id);
  }, [key, readAccount]);

  const row = models.find((entry) => entry.id === model) ?? null;
  const listPrice = row ? BigInt(row.reference_blended_micro_per_mtok) : null;
  const ceiling = row ? BigInt(row.list_ceiling_micro_per_mtok) : null;
  const perp = MARKETS.find((market) => market === model);
  const index = status?.markets.find((market) => market.model === model)?.index_micro_per_mtok ?? null;
  const asks = useMemo(
    () =>
      (book?.asks ?? [])
        .map((ask) => ({ price_micro_per_mtok: ask.price_micro_per_mtok, tokens_left: ask.tokens_left }))
        .sort(byPrice(true)),
    [book],
  );
  const bids = useMemo(
    () => (book?.bids ?? []).map((bid) => ({ price_micro_per_mtok: bid.price_micro_per_mtok, tokens_left: bid.tokens })).sort(byPrice(false)),
    [book],
  );
  const points = useMemo(() => fillsToPoints(book?.fills ?? []), [book]);
  const groups = useMemo(() => {
    const listed = models.filter((entry) => entry.available_tokens !== "0").map((entry) => entry.id).sort();
    const rest = models.filter((entry) => entry.available_tokens === "0").map((entry) => entry.id).sort();
    if (model && !listed.includes(model) && !rest.includes(model)) rest.unshift(model);
    return [
      { label: "Listed", models: listed },
      { label: "No asks yet", models: rest },
    ];
  }, [models, model]);

  const bestAsk = asks[0] ? BigInt(asks[0].price_micro_per_mtok) : null;
  const bestBid = bids[0] ? BigInt(bids[0].price_micro_per_mtok) : null;
  const depth = sum(asks.map((ask) => ask.tokens_left));
  const sellers = [...new Set((book?.asks ?? []).map((ask) => railName(ask.rail)))];
  const lastFill = book?.fills[0] ? BigInt(book.fills[0].price_micro_per_mtok) : null;
  const held = sum((account?.holdings ?? []).filter((holding) => holding.model === model).map((holding) => holding.tokens));
  const budget = account
    ? BigInt(account.me.float_usd_micro) + smaller(BigInt(account.me.cap.left_usd_micro), BigInt(account.me.wallet_usd_micro))
    : null;

  const tokens = parseMtok(size);
  const limitPrice = mode === "limit" ? parseUsd(limit) : null;
  const levels = side === "buy" ? asks : bids;
  const reachable =
    mode === "market"
      ? levels
      : limitPrice === null
        ? []
        : levels.filter((level) => {
            const price = BigInt(level.price_micro_per_mtok);
            return side === "buy" ? price <= limitPrice : price >= limitPrice;
          });
  const preview = previewFill(reachable, tokens, TAKE_BPS);
  const resting = mode === "limit" && limitPrice !== null ? tokens - preview.fillable : 0n;
  const restingValue = resting > 0n && limitPrice !== null ? charge(resting, limitPrice) : 0n;
  const max = side === "buy" ? maxBuy(reachable, budget, mode === "limit" ? limitPrice : null) : held;
  const share = max > 0n ? Number(smaller(100n, (tokens * 100n) / max)) : 0;
  const fill: CSSProperties & Record<"--fill", string> = { "--fill": `${share}%` };
  const holdings = account?.holdings ?? [];
  const orders: Order[] = [
    ...(account?.bids ?? []).map((bid) => ({
      id: bid.bid_id,
      kind: "bid" as const,
      model: bid.model,
      price: BigInt(bid.price_micro_per_mtok),
      tokens: BigInt(bid.tokens),
      value: BigInt(bid.hold_usd_micro),
      at: bid.created_at,
    })),
    ...(account?.offers ?? []).map((offer) => ({
      id: offer.offer_id,
      kind: "offer" as const,
      model: offer.model,
      price: BigInt(offer.price_micro_per_mtok),
      tokens: BigInt(offer.tokens),
      value: charge(BigInt(offer.tokens), BigInt(offer.price_micro_per_mtok)),
      at: offer.created_at,
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const pick = (next: string) => {
    setModel(next);
    setLimit("");
    setProblem(null);
    setNotice(null);
  };

  const chooseMode = (next: Mode) => {
    setMode(next);
    setProblem(null);
    const anchor = side === "buy" ? (bestAsk ?? bestBid) : (bestBid ?? bestAsk);
    if (next === "limit" && limit === "" && anchor !== null) setLimit(formatMicroPerMtok(anchor));
  };

  const chooseSide = (next: Side) => {
    setSide(next);
    setProblem(null);
    setNotice(null);
  };

  const flag = (field: Problem["field"], text: string) => {
    setProblem({ field, text });
    (field === "size" ? sizeRef : field === "limit" ? limitRef : keyRef).current?.focus();
  };

  const saveKey = () => {
    const next = draftKey.trim();
    if (!next.startsWith("rk_")) {
      flag("key", "A router key starts with rk_.");
      return;
    }
    localStorage.setItem(KEY_STORAGE, next);
    setKey(next);
    setDraftKey("");
    setProblem(null);
  };

  const forgetKey = () => {
    localStorage.removeItem(KEY_STORAGE);
    setKey("");
    setAccount(null);
    setAccountError(null);
    setNotice(null);
  };

  const submit = async () => {
    setNotice(null);
    if (!key) return flag("key", "Paste a router key first.");
    if (tokens <= 0n) return flag("size", "Enter a size above 0 MTok.");
    if (mode === "limit" && (limitPrice === null || limitPrice <= 0n)) return flag("limit", "Enter a price in USD per MTok, like 0.18.");
    if (mode === "limit" && limitPrice !== null && ceiling !== null && limitPrice > ceiling) {
      return flag("limit", `The limit can't sit above the ${usd(ceiling)} list price.`);
    }
    if (side === "sell" && tokens > held) {
      return flag("size", held === 0n ? `You hold no ${model} MTok to sell.` : `You hold ${formatMtok(held)} MTok of ${model}.`);
    }
    if (mode === "market" && preview.fillable === 0n) {
      return flag("size", side === "buy" ? "No asks to buy from. Switch to Limit to rest a bid." : "No bids to sell into. Switch to Limit to rest an offer.");
    }
    if (side === "buy" && budget !== null && preview.cost + restingValue > budget) {
      return flag("size", `This needs ${usd(preview.cost + restingValue)}. You can spend ${usd(budget)} today.`);
    }
    setProblem(null);
    setBusy(true);
    const body = JSON.stringify({
      model,
      tokens: tokens.toString(),
      ...(mode === "limit" && limitPrice !== null ? { limit_price_micro_per_mtok: limitPrice.toString() } : {}),
    });
    if (side === "buy") {
      const result = await api<TradeResult>("/api/v1/trades", { method: "POST", key, body });
      if (result.ok) {
        const bought = sum(result.data.fills.map((item) => item.tokens));
        const paid = sum(result.data.fills.map((item) => item.charge_usd_micro));
        const bid = result.data.bid;
        setNotice({
          tone: "up",
          text: [
            bought > 0n ? `Bought ${formatMtok(bought)} MTok for ${usd(paid)}.` : "",
            bid ? `A bid for ${formatMtok(BigInt(bid.tokens))} MTok rests at ${usd(BigInt(bid.price_micro_per_mtok))}.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          fix: null,
        });
      } else {
        setNotice({ tone: "down", text: result.message, fix: remedy(result) });
      }
    } else {
      const result = await api<SellResult>("/api/v1/sells", { method: "POST", key, body });
      if (result.ok) {
        const sold = sum(result.data.fills.map((item) => item.tokens));
        const gross = sum(result.data.fills.map((item) => item.charge_usd_micro));
        const offered = sum(result.data.offers.map((offer) => offer.tokens));
        setNotice({
          tone: "up",
          text: [
            sold > 0n ? `Sold ${formatMtok(sold)} MTok for ${usd(sellerEarning(gross, TAKE_BPS))} after the fee.` : "",
            offered > 0n && limitPrice !== null ? `${formatMtok(offered)} MTok rests as an offer at ${usd(limitPrice)}.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          fix: null,
        });
      } else {
        setNotice({ tone: "down", text: result.message, fix: remedy(result) });
      }
    }
    setBusy(false);
    readBook();
    await readAccount();
  };

  const cancel = async (order: Order) => {
    setCancelling(order.id);
    const result = await api<null>(`/api/v1/${order.kind === "bid" ? "bids" : "offers"}/${order.id}`, { method: "DELETE", key });
    setCancelling(null);
    setNotice(
      result.ok
        ? { tone: "up", text: `Cancelled the ${order.kind} for ${formatMtok(order.tokens)} MTok at ${usd(order.price)}.`, fix: null }
        : { tone: "down", text: result.message, fix: null },
    );
    readBook();
    await readAccount();
  };

  const sellHolding = (holding: Holding) => {
    pick(holding.model);
    setSide("sell");
    setMode("market");
    setSize(sizeText(BigInt(holding.tokens)));
    sizeRef.current?.focus();
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 lg:h-16 lg:flex-row lg:items-center lg:gap-10 lg:px-6 lg:py-0">
        <MarketSelect value={model} onChange={pick} groups={groups} />
        <dl className="flex min-w-0 gap-8 overflow-x-auto pb-1 lg:pb-0">
          <Stat label="Best ask">
            <Ticker value={bestAsk === null ? "None" : usd(bestAsk)} />
          </Stat>
          <Stat label="Best bid">
            <Ticker value={bestBid === null ? "None" : usd(bestBid)} />
          </Stat>
          {perp ? (
            <Stat label="Index">
              <Ticker value={index === null ? "Not posted" : usd(BigInt(index))} />
            </Stat>
          ) : null}
          <Stat label="List price">{listPrice === null ? "Unknown" : usd(listPrice)}</Stat>
          <Stat label="Vs list" tone={bestAsk !== null && listPrice !== null && bestAsk < listPrice ? "up" : undefined}>
            {bestAsk === null || listPrice === null || listPrice === 0n ? "No asks" : percent(bestAsk - listPrice, listPrice)}
          </Stat>
          <Stat label="Available">{formatMtok(depth)} MTok</Stat>
          <Stat label="Sold by">{sellers.length > 0 ? sellers.join(", ") : "No sellers yet"}</Stat>
          {row?.verifiability === "tee" ? <Stat label="Proofs">TEE attested</Stat> : null}
        </dl>
      </div>

      <div className="grid grid-cols-1 lg:h-[max(560px,calc(100svh_-_260px))] lg:grid-cols-[minmax(0,1fr)_256px_280px] xl:grid-cols-[minmax(0,1fr)_280px_300px]">
        <section aria-label="Price chart" className="flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
          <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
            <Toggle label="Candle interval" value={bucket} onChange={setBucket} items={INTERVALS} />
            {lastFill !== null ? (
              <span className="text-[12px] tabular-nums text-muted">
                Last fill <span className="text-ink">{usd(lastFill)}</span>
              </span>
            ) : null}
          </div>
          <div className="h-[320px] min-h-0 lg:h-auto lg:flex-1">
            <CandleChart points={points} bucket={Number(bucket)} empty="No fills yet. The first trade prints here." />
          </div>
        </section>

        <div className="order-3 h-[460px] min-h-0 border-b border-line lg:order-2 lg:h-auto lg:border-b-0 lg:border-r">
          <OrderBook
            book={book}
            onPrice={(price) => {
              setMode("limit");
              setLimit(formatMicroPerMtok(price));
              setProblem(null);
            }}
          />
        </div>

        <section aria-label="Order ticket" className="order-2 flex min-h-0 flex-col border-b border-line lg:order-3 lg:border-b-0">
          <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
            <Toggle
              label="Order type"
              value={mode}
              onChange={chooseMode}
              items={[
                { value: "market", label: "Market" },
                { value: "limit", label: "Limit" },
              ]}
            />
            {key ? (
              <button
                type="button"
                onClick={forgetKey}
                className={`group flex h-8 items-center gap-1.5 text-[12px] text-muted transition-colors duration-150 ease-brand hover:text-ink ${FOCUS}`}
              >
                <span className="tabular-nums">{shortKey(key)}</span>
                <span className="underline decoration-line underline-offset-[4px] transition-[text-decoration-color] duration-150 ease-brand group-hover:decoration-accent">
                  Change
                </span>
              </button>
            ) : null}
          </div>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
          >
            <Toggle
              big
              label="Side"
              value={side}
              onChange={chooseSide}
              items={[
                { value: "buy", label: "Buy", tone: "up" },
                { value: "sell", label: "Sell", tone: "down" },
              ]}
            />
            {key ? (
              accountError ? (
                <p className="text-[12px] leading-[18px] text-down">{accountError}</p>
              ) : (
                <dl className="flex flex-col gap-1.5">
                  {side === "buy" ? (
                    <Line label="Spendable today">{budget === null ? "Reading" : usd(budget)}</Line>
                  ) : (
                    <Line label="Best bid">{bestBid === null ? "None" : usd(bestBid)}</Line>
                  )}
                  <Line label="Holding">{account ? `${formatMtok(held)} MTok` : "Reading"}</Line>
                </dl>
              )
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="flex items-end gap-2">
                  <Field label="Router key" className="min-w-0 flex-1">
                    <input
                      ref={keyRef}
                      type="password"
                      value={draftKey}
                      onChange={(event) => setDraftKey(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter") return;
                        event.preventDefault();
                        saveKey();
                      }}
                      placeholder="rk_"
                      autoComplete="off"
                      spellCheck={false}
                      aria-invalid={problem?.field === "key"}
                      className={INPUT_SM}
                    />
                  </Field>
                  <button type="button" onClick={saveKey} className={SECONDARY}>
                    Use key
                  </button>
                </div>
                <p className={`text-[12px] leading-[18px] ${problem?.field === "key" ? "text-down" : "text-muted"}`}>
                  {problem?.field === "key" ? `${problem.text} ` : ""}
                  Create one on the{" "}
                  <Link href="/keys" className={LINK}>
                    Wallet
                  </Link>{" "}
                  page.
                </p>
              </div>
            )}
            {mode === "limit" ? (
              <Field
                label="Limit price (USD per MTok)"
                alert={problem?.field === "limit"}
                note={problem?.field === "limit" ? problem.text : ceiling !== null ? `Ceiling ${usd(ceiling)}, the highest list price` : undefined}
              >
                <input
                  ref={limitRef}
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  aria-invalid={problem?.field === "limit"}
                  className={INPUT}
                />
              </Field>
            ) : null}
            <Field label="Size (MTok)" alert={problem?.field === "size"} note={problem?.field === "size" ? problem.text : undefined}>
              <input
                ref={sizeRef}
                value={size}
                onChange={(event) => setSize(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={problem?.field === "size"}
                className={INPUT}
              />
            </Field>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={share}
                disabled={max === 0n}
                aria-label="Size as a share of the most you can trade"
                onChange={(event) => setSize(sizeText((max * BigInt(event.target.value)) / 100n))}
                style={fill}
                className={`range h-5 min-w-0 flex-1 ${FOCUS}`}
              />
              <span className="w-10 text-right text-[12px] tabular-nums text-muted">{share}%</span>
            </div>
            <dl className="flex flex-col gap-1.5 border-t border-line pt-3">
              <Line label="Average price">{preview.fillable === 0n ? "None" : usd(preview.avg)}</Line>
              {mode === "limit" || preview.partial ? (
                <Line label={side === "buy" ? "Fills now" : "Sells now"}>{formatMtok(preview.fillable)} MTok</Line>
              ) : null}
              {resting > 0n && limitPrice !== null ? (
                <Line label={side === "buy" ? "Rests as a bid" : "Rests as an offer"}>
                  {formatMtok(resting)} MTok at {usd(limitPrice)}
                </Line>
              ) : null}
              {side === "buy" ? (
                <Line label="Total">{usd(preview.cost + restingValue)}</Line>
              ) : (
                <>
                  <Line label="Venue fee (10%)">{usd(preview.fee)}</Line>
                  <Line label="You receive">{usd(preview.net)}</Line>
                </>
              )}
            </dl>
            <CommitButton type="submit" tone={side === "buy" ? "up" : "down"} disabled={busy} aria-busy={busy} className="mt-1 w-full">
              {busy
                ? side === "buy"
                  ? "Buying"
                  : "Selling"
                : key
                  ? `${side === "buy" ? "Buy" : "Sell"} ${sizeText(tokens)} MTok`
                  : `Add a key to ${side}`}
            </CommitButton>
            {notice ? (
              <p role="status" className={`text-[13px] leading-[20px] ${notice.tone === "up" ? "text-up" : "text-down"}`}>
                {notice.text}{" "}
                {notice.fix ? (
                  <a href={notice.fix.url} className={LINK}>
                    {notice.fix.label}
                  </a>
                ) : null}
              </p>
            ) : null}
            <p className="text-[12px] leading-[18px] text-muted">
              {side === "buy"
                ? "Paid from the key's float first, then your wallet within today's limit."
                : "Proceeds go to the key's float, minus the 10% venue fee."}
            </p>
          </form>
        </section>
      </div>

      <section aria-label="Your account" className="border-t border-line">
        <div className="flex h-10 items-center overflow-x-auto border-b border-line px-4">
          <Toggle
            label="Account view"
            value={tab}
            onChange={setTab}
            items={[
              { value: "balances", label: "Balances" },
              { value: "holdings", label: `Holdings (${holdings.length})` },
              { value: "orders", label: `Open orders (${orders.length})` },
              { value: "history", label: "History" },
            ]}
          />
        </div>
        {!account ? (
          <Empty
            action={
              <Link href="/keys" className={SECONDARY}>
                Create a key
              </Link>
            }
          >
            {accountError ?? "Add a router key in the ticket to see your balances, holdings and orders here."}
          </Empty>
        ) : tab === "balances" ? (
          <Table columns={[{ label: "Balance" }, { label: "Amount", end: true }, { label: "How it is spent" }]}>
            <tr className={ROW}>
              <td className={TD}>Wallet</td>
              <td className={`${TD} text-right`}>{usd(BigInt(account.me.wallet_usd_micro))}</td>
              <td className={`${TD} text-muted`}>USDC on NEAR, pulled into keys within their daily limits</td>
            </tr>
            <tr className={ROW}>
              <td className={TD}>Key float</td>
              <td className={`${TD} text-right`}>{usd(BigInt(account.me.float_usd_micro))}</td>
              <td className={`${TD} text-muted`}>Held on this key and spent first</td>
            </tr>
            <tr className={ROW}>
              <td className={TD}>Today&apos;s limit</td>
              <td className={`${TD} text-right`}>
                {usd(BigInt(account.me.cap.left_usd_micro))} of {usd(BigInt(account.me.cap.per_day_usd_micro))}
              </td>
              <td className={`${TD} text-muted`}>Resets at 00:00 UTC</td>
            </tr>
            <tr className={ROW}>
              <td className={TD}>Prepaid capacity</td>
              <td className={`${TD} text-right`}>{formatMtok(BigInt(account.me.prepaid_tokens))} MTok</td>
              <td className={`${TD} text-muted`}>Across all models, spent before the float</td>
            </tr>
          </Table>
        ) : tab === "holdings" ? (
          holdings.length === 0 ? (
            <Empty>No MTokens held. Buy some to lock in today&apos;s price.</Empty>
          ) : (
            <Table
              columns={[{ label: "Model" }, { label: "Provider" }, { label: "Size (MTok)", end: true }, { label: "Expires (UTC)" }, { label: "" }]}
            >
              {holdings.map((holding) => (
                <tr key={holding.prepaid_id} className={ROW}>
                  <td className={TD}>{holding.model}</td>
                  <td className={TD}>{railName(holding.rail)}</td>
                  <td className={`${TD} text-right`}>{formatMtok(BigInt(holding.tokens))}</td>
                  <td className={`${TD} text-muted`}>{holding.expires_at ? stampFormat.format(new Date(holding.expires_at)) : "No expiry"}</td>
                  <td className={`${TD} text-right`}>
                    <button type="button" onClick={() => sellHolding(holding)} className={SECONDARY}>
                      Sell
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )
        ) : tab === "orders" ? (
          orders.length === 0 ? (
            <Empty>No open orders. A limit order that doesn&apos;t fill rests here.</Empty>
          ) : (
            <Table
              columns={[
                { label: "Placed (UTC)" },
                { label: "Model" },
                { label: "Side" },
                { label: "Price", end: true },
                { label: "Size (MTok)", end: true },
                { label: "Value", end: true },
                { label: "" },
              ]}
            >
              {orders.map((order) => (
                <tr key={order.id} className={ROW}>
                  <td className={`${TD} text-muted`}>{stampFormat.format(new Date(order.at))}</td>
                  <td className={TD}>{order.model}</td>
                  <td className={`${TD} ${order.kind === "bid" ? "text-up" : "text-down"}`}>{order.kind === "bid" ? "Bid" : "Offer"}</td>
                  <td className={`${TD} text-right`}>{usd(order.price)}</td>
                  <td className={`${TD} text-right`}>{formatMtok(order.tokens)}</td>
                  <td className={`${TD} text-right`}>{usd(order.value)}</td>
                  <td className={`${TD} text-right`}>
                    <button type="button" disabled={cancelling === order.id} onClick={() => void cancel(order)} className={SECONDARY}>
                      {cancelling === order.id ? "Cancelling" : "Cancel"}
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )
        ) : account.fills.length === 0 ? (
          <Empty>No trades on this key yet.</Empty>
        ) : (
          <Table
            columns={[
              { label: "Time (UTC)" },
              { label: "Model" },
              { label: "Side" },
              { label: "Price", end: true },
              { label: "Size (MTok)", end: true },
              { label: "Amount", end: true },
            ]}
          >
            {account.fills.map((item, position) => (
              <tr key={`${item.at}-${position}`} className={ROW}>
                <td className={`${TD} text-muted`}>{stampFormat.format(new Date(item.at))}</td>
                <td className={TD}>{item.model}</td>
                <td className={`${TD} ${item.side === "buy" ? "text-up" : "text-down"}`}>{item.side === "buy" ? "Buy" : "Sell"}</td>
                <td className={`${TD} text-right`}>{usd(BigInt(item.price_micro_per_mtok))}</td>
                <td className={`${TD} text-right`}>{formatMtok(BigInt(item.tokens))}</td>
                <td className={`${TD} text-right`}>{usd(BigInt(item.amount_usd_micro))}</td>
              </tr>
            ))}
          </Table>
        )}
      </section>
    </div>
  );
}
