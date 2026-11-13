"use client";

import { ArrowLeftRight, ChartCandlestick, ListOrdered, Wallet } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CommitButton,
  Empty,
  FOCUS,
  LINK,
  Line,
  MarketSelect,
  MobileTabs,
  NIL,
  Pair,
  ROW,
  SECONDARY,
  SMALL,
  Segmented,
  Stat,
  TD,
  Table,
  Toggle,
} from "../../../components/kit";
import { Shortcuts } from "../../../components/shortcuts";
import { Amount, Portion } from "../../../components/ticket";
import { KEY_STORAGE, amount, api, percent, places, price, railName, shortKey, tick, usd } from "../../../lib/client";
import { MARKETS } from "../../../lib/markets";
import { charge, dayChange, fillsToPoints, formatMtok, parseMtok, parseUsd, sellerEarning, stampFormat } from "../../../lib/price";
import { quoteTicket, type Level } from "../../../lib/ticket";
import type { Bid, BlockedAction, Book, Holding, KeyFill, Me, ModelRow, Offer, VenueStatus } from "../../../lib/types";
import {
  anything,
  bidsSchema,
  bookSchema,
  createKeySchema,
  fillsSchema,
  holdingsSchema,
  meSchema,
  modelsSchema,
  offersSchema,
  sellResultSchema,
  statusSchema,
  tradeResultSchema,
  walletSchema,
} from "../../../lib/wire";
import { useNear } from "../providers";
import { CandleChart, ChartCredit, INTERVALS, type Interval, type Level as ChartLevel } from "./chart";
import { OrderBook } from "./order-book";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const TAKE_BPS = 1000n;
const BOOK_MS = 5_000;
const ACCOUNT_MS = 15_000;
const STATUS_MS = 30_000;

type Side = "buy" | "sell";
type Mode = "market" | "limit";
type Panel = "chart" | "book" | "trade" | "account";
type View = "balances" | "holdings" | "orders" | "history";
type Account = { me: Me; holdings: Holding[]; bids: Bid[]; offers: Offer[]; fills: KeyFill[] };
type Notice = { tone: "up" | "down"; text: string; fix: { url: string; label: string } | null };
type Problem = { field: "size" | "limit" | "key" | "daily"; text: string };
type Order = { id: string; kind: "bid" | "offer"; model: string; price: bigint; tokens: bigint; value: bigint; at: string };

const sum = (values: ReadonlyArray<string>) => values.reduce((total, value) => total + BigInt(value), 0n);
const smaller = (a: bigint, b: bigint) => (a < b ? a : b);

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

function Balance({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line px-4 py-3 first:border-t-0">
      <div className="flex items-baseline justify-between gap-4 text-[14px]">
        <dt className="text-ink">{label}</dt>
        <dd className="tabular-nums text-ink">{value}</dd>
      </div>
      <p className="text-[13px] leading-[19px] text-muted">{note}</p>
    </div>
  );
}

export default function TradePage() {
  const { accountId, connect, sign, send } = useNear();
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
  const [panel, setPanel] = useState<Panel>("chart");
  const [view, setView] = useState<View>("balances");
  const [pasting, setPasting] = useState(false);
  const [daily, setDaily] = useState("5");
  const [wallet, setWallet] = useState<bigint | null>(null);
  const current = useRef("");
  const sizeRef = useRef<HTMLInputElement | null>(null);
  const limitRef = useRef<HTMLInputElement | null>(null);
  const keyRef = useRef<HTMLInputElement | null>(null);
  const dailyRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wanted = params.get("model");
    if (wanted) setModel(wanted);
    const preset = params.get("side");
    if (preset === "buy" || preset === "sell") setSide(preset);
    const presetSize = params.get("size");
    if (presetSize && parseMtok(presetSize) > 0n) setSize(presetSize);
    const presetLimit = params.get("limit");
    if (presetLimit && parseUsd(presetLimit) !== null) {
      setMode("limit");
      setLimit(presetLimit);
    }
    if (preset || presetSize || presetLimit) setPanel("trade");
    setKey(localStorage.getItem(KEY_STORAGE) ?? "");
    void api("/api/v1/models", modelsSchema).then((result) => {
      if (!result.ok) return;
      setModels(result.data.data);
      if (!wanted) setModel(result.data.data.find((row) => row.available_tokens !== "0")?.id ?? MARKETS[0]);
    });
    const readStatus = () =>
      void api("/api/v1/status", statusSchema).then((result) => {
        if (result.ok) setStatus(result.data);
      });
    readStatus();
    const id = window.setInterval(readStatus, STATUS_MS);
    return () => window.clearInterval(id);
  }, []);

  const readBook = useCallback(() => {
    const wanted = current.current;
    if (!wanted) return;
    void api(`/api/v1/book?model=${encodeURIComponent(wanted)}`, bookSchema).then((result) => {
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
      api("/api/v1/me", meSchema, { key }),
      api("/api/v1/holdings", holdingsSchema, { key }),
      api("/api/v1/bids", bidsSchema, { key }),
      api("/api/v1/offers", offersSchema, { key }),
      api("/api/v1/fills", fillsSchema, { key }),
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
    if (!accountId || key) return;
    let live = true;
    void api(`/api/v1/wallet?account=${encodeURIComponent(accountId)}`, walletSchema).then((result) => {
      if (live) setWallet(result.ok ? BigInt(result.data.wallet_usd_micro) : null);
    });
    return () => {
      live = false;
    };
  }, [accountId, key]);

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
    () => (book?.asks ?? []).map((ask) => ({ price_micro_per_mtok: ask.price_micro_per_mtok, tokens_left: ask.tokens_left })).sort(byPrice(true)),
    [book],
  );
  const bids = useMemo(
    () => (book?.bids ?? []).map((bid) => ({ price_micro_per_mtok: bid.price_micro_per_mtok, tokens_left: bid.tokens })).sort(byPrice(false)),
    [book],
  );
  const points = useMemo(() => fillsToPoints(book?.fills ?? []), [book]);
  const change = dayChange(points, Date.now() / 1000);
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
  const digits = places(
    ...[...asks, ...bids].map((level) => BigInt(level.price_micro_per_mtok)),
    ...(listPrice === null ? [] : [listPrice]),
    ...(index === null ? [] : [BigInt(index)]),
    ...(lastFill === null ? [] : [lastFill]),
  );
  const at = (micro: bigint) => price(micro, digits);
  const apart = (a: bigint, b: bigint | null) => b === null || (a > b ? a - b : b - a) * 200n > a;
  const levels: ChartLevel[] = [
    ...(listPrice !== null && apart(listPrice, lastFill) ? [{ price: listPrice, title: "List", tone: "muted" as const }] : []),
    ...(perp && index !== null && apart(BigInt(index), listPrice) && apart(BigInt(index), lastFill) ? [{ price: BigInt(index), title: "Index", tone: "muted" as const }] : []),
  ];
  const held = sum((account?.holdings ?? []).filter((holding) => holding.model === model).map((holding) => holding.tokens));
  const budget = account
    ? BigInt(account.me.float_usd_micro) + smaller(BigInt(account.me.cap.left_usd_micro), BigInt(account.me.wallet_usd_micro))
    : key
      ? null
      : wallet;

  const tokens = parseMtok(size);
  const limitPrice = mode === "limit" ? parseUsd(limit) : null;
  const { preview, resting, restingValue, max } = quoteTicket({ side, mode, asks, bids, tokens, limit: limitPrice, budget, held, takeBps: TAKE_BPS });
  const share = max > 0n ? Number(smaller(100n, (tokens * 100n) / max)) : 0;
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
    if (next === "limit" && limit === "" && anchor !== null) setLimit(tick(anchor, digits));
  };

  const chooseSide = (next: Side) => {
    setSide(next);
    setProblem(null);
    setNotice(null);
  };

  const flag = (field: Problem["field"], text: string) => {
    setProblem({ field, text });
    setPanel("trade");
    ({ size: sizeRef, limit: limitRef, key: keyRef, daily: dailyRef })[field].current?.focus();
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

  const createKey = async () => {
    const perDay = parseUsd(daily);
    if (perDay === null || perDay === 0n) return flag("daily", "Enter how much it may spend per day, like 5.");
    setProblem(null);
    setBusy(true);
    const signed = await sign("create_key");
    if (!signed) {
      setBusy(false);
      setNotice({ tone: "down", text: "The wallet didn't sign, so no key was created.", fix: null });
      return;
    }
    const made = await api("/api/v1/keys", createKeySchema, { method: "POST", body: JSON.stringify(signed) });
    if (!made.ok) {
      setBusy(false);
      setNotice({ tone: "down", text: made.message, fix: null });
      return;
    }
    localStorage.setItem(KEY_STORAGE, made.data.key);
    setKey(made.data.key);
    const sent = await send([
      {
        receiverId: CORE,
        actions: [
          {
            type: "FunctionCall",
            params: { methodName: "set_cap", args: { key: made.data.key_id, per_day: perDay.toString() }, gas: "30000000000000", deposit: "1" },
          },
        ],
      },
    ]);
    setBusy(false);
    setNotice(
      "hashes" in sent
        ? { tone: "up", text: `Trading is set up. This browser can spend up to ${usd(perDay)} a day from your wallet.`, fix: null }
        : { tone: "down", text: "The router key is saved here, but its daily limit wasn't set, so it can't spend from your wallet yet.", fix: { url: "/wallet", label: "Set it on the Wallet page" } },
    );
  };

  const submit = async () => {
    setNotice(null);
    if (!key) {
      if (pasting) return saveKey();
      if (!accountId) return void (await connect());
      return createKey();
    }
    if (tokens <= 0n) return flag("size", "Enter a size above 0 MTok.");
    if (mode === "limit" && (limitPrice === null || limitPrice <= 0n)) return flag("limit", "Enter a price in USD per MTok, like 0.18.");
    if (mode === "limit" && limitPrice !== null && ceiling !== null && limitPrice > ceiling) {
      return flag("limit", `The limit can't sit above the ${at(ceiling)} list price.`);
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
      const result = await api("/api/v1/trades", tradeResultSchema, { method: "POST", key, body });
      if (result.ok) {
        const bought = sum(result.data.fills.map((item) => item.tokens));
        const paid = sum(result.data.fills.map((item) => item.charge_usd_micro));
        const bid = result.data.bid;
        setNotice({
          tone: "up",
          text: [
            bought > 0n ? `Bought ${formatMtok(bought)} MTok for ${usd(paid)}.` : "",
            bid ? `A bid for ${formatMtok(BigInt(bid.tokens))} MTok rests at ${price(BigInt(bid.price_micro_per_mtok))}.` : "",
          ]
            .filter(Boolean)
            .join(" "),
          fix: null,
        });
      } else {
        setNotice({ tone: "down", text: result.message, fix: remedy(result) });
      }
    } else {
      const result = await api("/api/v1/sells", sellResultSchema, { method: "POST", key, body });
      if (result.ok) {
        const sold = sum(result.data.fills.map((item) => item.tokens));
        const gross = sum(result.data.fills.map((item) => item.charge_usd_micro));
        const offered = sum(result.data.offers.map((offer) => offer.tokens));
        setNotice({
          tone: "up",
          text: [
            sold > 0n ? `Sold ${formatMtok(sold)} MTok for ${usd(sellerEarning(gross, TAKE_BPS))} after the fee.` : "",
            offered > 0n && limitPrice !== null ? `${formatMtok(offered)} MTok rests as an offer at ${at(limitPrice)}.` : "",
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
    const result = await api(`/api/v1/${order.kind === "bid" ? "bids" : "offers"}/${order.id}`, anything, { method: "DELETE", key });
    setCancelling(null);
    setNotice(
      result.ok
        ? { tone: "up", text: `Cancelled the ${order.kind} for ${formatMtok(order.tokens)} MTok at ${price(order.price)}.`, fix: null }
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
    setPanel("trade");
    sizeRef.current?.focus();
  };

  const shortcuts = [
    { keys: "B", label: "Buy", run: () => chooseSide("buy") },
    { keys: "S", label: "Sell", run: () => chooseSide("sell") },
    { keys: "M", label: "Market order", run: () => chooseMode("market") },
    { keys: "L", label: "Limit order", run: () => chooseMode("limit") },
    {
      keys: "/",
      label: "Jump to size",
      run: () => {
        setPanel("trade");
        sizeRef.current?.focus();
      },
    },
  ];

  const summary = (
    <dl className="flex flex-col gap-1.5">
      {preview.fillable > 0n || mode === "market" ? (
        <Line label="Average price">{preview.fillable === 0n ? NIL : at(preview.avg)}</Line>
      ) : null}
      {mode === "limit" || preview.partial ? (
        <Line label={side === "buy" ? "Fills now" : "Sells now"}>{formatMtok(preview.fillable)} MTok</Line>
      ) : null}
      {resting > 0n && limitPrice !== null ? (
        <Line label={side === "buy" ? "Rests as a bid" : "Rests as an offer"}>
          {formatMtok(resting)} MTok at {at(limitPrice)}
        </Line>
      ) : null}
      {side === "buy" ? (
        <>
          <Line label="Fee">{amount(0n)}</Line>
          <Line label="You pay">{amount(preview.cost + restingValue)}</Line>
        </>
      ) : (
        <>
          <Line label="Fee (10%)">{amount(preview.fee + restingValue - sellerEarning(restingValue, TAKE_BPS))}</Line>
          {resting > 0n ? (
            <>
              <Line label="You receive now">{amount(preview.net)}</Line>
              <Line label="When the offer fills">{amount(sellerEarning(restingValue, TAKE_BPS))}</Line>
            </>
          ) : (
            <Line label="You receive">{amount(preview.net)}</Line>
          )}
        </>
      )}
    </dl>
  );

  return (
    <div className="flex flex-col pb-[52px] lg:pb-0">
      <h1 className="sr-only">Trade {model || "MTokens"}</h1>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:h-16 lg:flex-row lg:items-center lg:gap-10 lg:px-6 lg:py-0">
        <MarketSelect value={model} onChange={pick} groups={groups} />
        <dl className="grid min-w-0 grid-cols-3 gap-x-4 gap-y-2 lg:flex lg:gap-8 lg:overflow-x-auto">
          <Stat label="Best ask" big>
            <Ticker value={bestAsk === null ? NIL : at(bestAsk)} />
          </Stat>
          <Stat label="24h change" tone={change === null || change === 0 ? undefined : change > 0 ? "up" : "down"}>
            {change === null ? NIL : `${change > 0 ? "+" : ""}${change.toFixed(2)}%`}
          </Stat>
          <Stat label="Best bid">
            <Ticker value={bestBid === null ? NIL : at(bestBid)} />
          </Stat>
          {perp ? (
            <Stat label="Index" className="max-lg:hidden">
              <Ticker value={index === null ? "Not posted" : at(BigInt(index))} />
            </Stat>
          ) : null}
          <Stat label="List price">{listPrice === null ? NIL : at(listPrice)}</Stat>
          <Stat label="Vs list" tone={bestAsk !== null && listPrice !== null && bestAsk < listPrice ? "up" : undefined}>
            {bestAsk === null || listPrice === null || listPrice === 0n ? NIL : percent(bestAsk - listPrice, listPrice)}
          </Stat>
          <Stat label="Available">{formatMtok(depth)} MTok</Stat>
          <Stat label="Sold by" className="hidden lg:flex">
            {sellers.length > 0 ? sellers.join(", ") : "No sellers yet"}
          </Stat>
          {row?.verifiability === "tee" ? (
            <Stat label="Proofs" className="hidden lg:flex">
              TEE attested
            </Stat>
          ) : null}
        </dl>
        <div className="ml-auto hidden lg:block">
          <Shortcuts items={shortcuts} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:h-[max(640px,calc(100svh_-_157px))] lg:grid-cols-[minmax(0,1fr)_256px_280px] lg:grid-rows-[minmax(0,1fr)_240px] xl:grid-cols-[minmax(0,1fr)_280px_300px]">
        <section
          aria-label="Price chart"
          className={`${panel === "chart" ? "flex" : "hidden"} h-[calc(100svh-17rem)] min-h-[360px] flex-col lg:flex lg:h-auto lg:min-h-0 lg:border-r lg:border-line`}
        >
          <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
            <Toggle label="Candle interval" value={bucket} onChange={setBucket} items={INTERVALS} />
            <div className="flex items-center gap-4">
              {lastFill !== null ? (
                <span className="whitespace-nowrap text-[12px] tabular-nums text-muted">
                  Last fill <span className="text-ink">{at(lastFill)}</span>
                </span>
              ) : null}
              <ChartCredit />
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <CandleChart points={points} bucket={Number(bucket)} precision={digits} empty="No fills yet. The first trade prints here." levels={levels} />
          </div>
        </section>

        <div
          className={`${panel === "book" ? "block" : "hidden"} h-[calc(100svh-17rem)] min-h-[420px] lg:block lg:h-auto lg:min-h-0 lg:border-r lg:border-line`}
        >
          <OrderBook
            book={book}
            digits={digits}
            onPrice={(price) => {
              setMode("limit");
              setLimit(tick(price, digits));
              setProblem(null);
              setPanel("trade");
            }}
          />
        </div>

        <section aria-label="Order ticket" className={`${panel === "trade" ? "flex" : "hidden"} min-h-0 flex-col lg:col-[3] lg:row-[1/3] lg:flex`}>
          <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
            <Toggle
              label="Order type"
              value={mode}
              onChange={chooseMode}
              items={[
                { value: "market", label: "Market", hotkey: "M" },
                { value: "limit", label: "Limit", hotkey: "L" },
              ]}
            />
            {key ? (
              <button
                type="button"
                onClick={forgetKey}
                className={`group flex h-10 items-center gap-1.5 text-[12px] text-muted transition-colors duration-150 ease-brand hover:text-ink ${FOCUS}`}
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
            className="flex min-h-0 flex-1 flex-col lg:overflow-y-auto lg:[scrollbar-width:thin]"
          >
            <div className="flex flex-col gap-3 p-4 *:shrink-0">
              <Segmented
                label="Side"
                value={side}
                onChange={chooseSide}
                items={[
                  { value: "buy", label: "Buy", tone: "up", hotkey: "B" },
                  { value: "sell", label: "Sell", tone: "down", hotkey: "S" },
                ]}
              />
              {key ? (
                accountError ? (
                  <p className="text-[13px] leading-[19px] text-down">{accountError}</p>
                ) : (
                  <dl className="flex flex-col gap-1.5">
                    {side === "buy" ? (
                      <Line label="Available">{budget === null ? "Reading" : usd(budget)}</Line>
                    ) : (
                      <Line label="Best bid">{bestBid === null ? NIL : at(bestBid)}</Line>
                    )}
                    <Line label="Holding">{account ? `${formatMtok(held)} MTok` : "Reading"}</Line>
                  </dl>
                )
              ) : accountId ? (
                <dl className="flex flex-col gap-1.5">
                  <Line label="Wallet">{wallet === null ? "Reading" : usd(wallet)}</Line>
                </dl>
              ) : null}
              {mode === "limit" ? (
                <Amount
                  ref={limitRef}
                  label="Limit price"
                  unit="USD/MTok"
                  value={limit}
                  onChange={(event) => setLimit(event.target.value)}
                  inputMode="decimal"
                  autoComplete="off"
                  alert={problem?.field === "limit"}
                  note={problem?.field === "limit" ? problem.text : ceiling !== null ? `Ceiling ${at(ceiling)}, the highest list price` : undefined}
                />
              ) : null}
              <Amount
                ref={sizeRef}
                label="Size"
                unit="MTok"
                value={size}
                onChange={(event) => setSize(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                aria-keyshortcuts="/"
                alert={problem?.field === "size"}
                note={problem?.field === "size" ? problem.text : undefined}
              />
              {max > 0n && (key || accountId) ? (
                <Portion
                  value={share}
                  label={side === "buy" ? "Size as a share of what you can buy" : "Size as a share of what you hold"}
                  onChange={(percent) => setSize(sizeText((max * BigInt(percent)) / 100n))}
                />
              ) : null}
              <div className="border-t border-line pt-3 lg:hidden">{summary}</div>
              {key ? (
                <p className="text-[13px] leading-[19px] text-muted">
                  {side === "buy"
                    ? "Paid from the key's balance first, then your wallet within today's limit."
                    : "Proceeds go to the key's balance, minus the 10% venue fee."}
                </p>
              ) : null}
            </div>
            <div
              className={`z-10 flex flex-col gap-3 border-t border-line bg-white px-4 pb-6 pt-4 lg:bottom-0 lg:pb-4 lg:shadow-none ${key ? "sticky bottom-[52px] shadow-[0_-8px_16px_-8px_rgb(30_30_30/0.16)]" : "lg:sticky"}`}
            >
              <div className="hidden lg:block">{summary}</div>
              {key || !accountId || pasting ? null : (
                <div className="flex flex-col gap-3 border border-line p-3">
                  <div className="flex flex-col gap-1">
                    <p className="text-[13px] text-ink">Step 1 of 2: set up trading</p>
                    <p className="text-pretty text-[13px] leading-[19px] text-muted">
                      A router key for this browser. It pays from your wallet, never more than you allow in a day. Then place your order.
                    </p>
                  </div>
                  <Amount
                    ref={dailyRef}
                    label="Spend per day"
                    unit="USDC"
                    value={daily}
                    onChange={(event) => setDaily(event.target.value)}
                    inputMode="decimal"
                    autoComplete="off"
                    alert={problem?.field === "daily"}
                    note={problem?.field === "daily" ? problem.text : undefined}
                  />
                </div>
              )}
              {!key && pasting ? (
                <Amount
                  ref={keyRef}
                  label="Router key"
                  type="password"
                  value={draftKey}
                  onChange={(event) => setDraftKey(event.target.value)}
                  placeholder="rk_"
                  autoComplete="off"
                  spellCheck={false}
                  alert={problem?.field === "key"}
                  note={problem?.field === "key" ? problem.text : "A key from the Wallet page. It stays in this browser."}
                />
              ) : null}
              <CommitButton type="submit" tone={!key ? "ink" : side === "buy" ? "up" : "down"} disabled={busy} aria-busy={busy} className="w-full">
                {busy
                  ? key
                    ? side === "buy"
                      ? "Buying"
                      : "Selling"
                    : "Waiting for the wallet"
                  : key
                    ? `${side === "buy" ? "Buy" : "Sell"} ${sizeText(tokens)} MTok`
                    : pasting
                      ? "Use this key"
                      : accountId
                        ? "Create router key"
                        : "Connect wallet to trade"}
              </CommitButton>
              {!key ? (
                <button
                  type="button"
                  onClick={() => {
                    setPasting(!pasting);
                    setProblem(null);
                  }}
                  className={`${LINK} self-center text-[13px] text-ink`}
                >
                  {pasting ? (accountId ? "Set up with my wallet instead" : "Connect a wallet instead") : "Use a router key I already have"}
                </button>
              ) : null}
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
            </div>
          </form>
        </section>

        <section
          aria-label="Your account"
          className={`${panel === "account" ? "flex" : "hidden"} min-h-0 flex-col border-t border-line lg:col-[1/3] lg:row-[2] lg:flex lg:border-r`}
        >
        <div className="flex h-10 shrink-0 items-center justify-between gap-6 overflow-x-auto border-b border-line px-4">
          <Toggle
            label="Account view"
            value={view}
            onChange={setView}
            items={[
              { value: "balances", label: "Balances" },
              { value: "holdings", label: `Holdings (${holdings.length})` },
              { value: "orders", label: `Open orders (${orders.length})` },
              { value: "history", label: "History" },
            ]}
          />
          {account ? (
            <dl className="hidden items-baseline gap-6 text-[13px] tabular-nums xl:flex">
              <Pair label="Key balance">{usd(BigInt(account.me.float_usd_micro))}</Pair>
              <Pair label="Left today">{usd(BigInt(account.me.cap.left_usd_micro))}</Pair>
              <Pair label="Prepaid">{formatMtok(BigInt(account.me.prepaid_tokens))} MTok</Pair>
            </dl>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 lg:overflow-y-auto">
        {!account && !key && accountId ? (
          <dl>
            <Balance
              label="Wallet"
              value={wallet === null ? "Reading" : usd(wallet)}
              note="USDC on NEAR. Set up trading in the ticket to buy with it and see holdings and orders here."
            />
          </dl>
        ) : !account ? (
          <Empty
            action={
              key || accountId ? null : (
                <button type="button" onClick={() => void connect()} className={SECONDARY}>
                  Connect wallet
                </button>
              )
            }
          >
            {accountError ?? (key ? "Reading your account." : "Connect your wallet to see your balances, holdings and orders here.")}
          </Empty>
        ) : view === "balances" ? (
          <>
            <dl className="lg:hidden">
              <Balance label="Wallet" value={usd(BigInt(account.me.wallet_usd_micro))} note="USDC on NEAR, pulled into keys within their daily limits" />
              <Balance label="Key balance" value={usd(BigInt(account.me.float_usd_micro))} note="Held on this key and spent first" />
              <Balance
                label="Today's limit"
                value={`${usd(BigInt(account.me.cap.left_usd_micro))} of ${usd(BigInt(account.me.cap.per_day_usd_micro))}`}
                note="Resets at 00:00 UTC"
              />
              <Balance label="Prepaid capacity" value={`${formatMtok(BigInt(account.me.prepaid_tokens))} MTok`} note="Across all models, spent before the balance" />
            </dl>
            <div className="hidden lg:block">
              <Table columns={[{ label: "Balance" }, { label: "Amount", end: true }, { label: "How it is spent" }]}>
                <tr className={ROW}>
                  <td className={TD}>Wallet</td>
                  <td className={`${TD} text-right`}>{usd(BigInt(account.me.wallet_usd_micro))}</td>
                  <td className={`${TD} text-muted`}>USDC on NEAR, pulled into keys within their daily limits</td>
                </tr>
                <tr className={ROW}>
                  <td className={TD}>Key balance</td>
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
                  <td className={`${TD} text-muted`}>Across all models, spent before the balance</td>
                </tr>
              </Table>
            </div>
          </>
        ) : view === "holdings" ? (
          holdings.length === 0 ? (
            <Empty>No MTokens held. Buy some to lock in today&apos;s price.</Empty>
          ) : (
            <Table columns={[{ label: "Model" }, { label: "Provider" }, { label: "Size (MTok)", end: true }, { label: "Expires (UTC)" }, { label: "" }]}>
              {holdings.map((holding) => (
                <tr key={holding.prepaid_id} className={ROW}>
                  <td className={TD}>{holding.model}</td>
                  <td className={TD}>{railName(holding.rail)}</td>
                  <td className={`${TD} text-right`}>{formatMtok(BigInt(holding.tokens))}</td>
                  <td className={`${TD} text-muted`}>{holding.expires_at ? stampFormat.format(new Date(holding.expires_at)) : "No expiry"}</td>
                  <td className={`${TD} text-right`}>
                    <button type="button" onClick={() => sellHolding(holding)} className={SMALL}>
                      Sell
                    </button>
                  </td>
                </tr>
              ))}
            </Table>
          )
        ) : view === "orders" ? (
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
                  <td className={`${TD} text-right`}>{price(order.price)}</td>
                  <td className={`${TD} text-right`}>{formatMtok(order.tokens)}</td>
                  <td className={`${TD} text-right`}>{usd(order.value)}</td>
                  <td className={`${TD} text-right`}>
                    <button type="button" disabled={cancelling === order.id} onClick={() => void cancel(order)} className={SMALL}>
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
                <td className={`${TD} text-right`}>{price(BigInt(item.price_micro_per_mtok))}</td>
                <td className={`${TD} text-right`}>{formatMtok(BigInt(item.tokens))}</td>
                <td className={`${TD} text-right`}>{usd(BigInt(item.amount_usd_micro))}</td>
              </tr>
            ))}
          </Table>
        )}
        </div>
      </section>
      </div>

      <MobileTabs
        value={panel}
        onChange={setPanel}
        items={[
          { value: "chart", label: "Chart", icon: ChartCandlestick },
          { value: "book", label: "Book", icon: ListOrdered },
          { value: "trade", label: "Trade", icon: ArrowLeftRight },
          { value: "account", label: "Account", icon: Wallet },
        ]}
      />
    </div>
  );
}
