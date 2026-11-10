"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CHIP,
  CommitButton,
  Empty,
  FOCUS,
  Field,
  ICON,
  INPUT,
  INPUT_SM,
  LINK,
  Line,
  MarketSelect,
  MobileTabs,
  Panel,
  ROW,
  SECONDARY,
  Stat,
  TD,
  Table,
  Toggle,
} from "../../../components/kit";
import { Shortcuts } from "../../../components/shortcuts";
import { ago, api, explorer, fundingPercent, percent, usd } from "../../../lib/client";
import { runs } from "../../../lib/index-math";
import { MARKETS } from "../../../lib/markets";
import {
  historyRows,
  liquidationPrice,
  maxOpen,
  notional,
  orderPlan,
  payoffLadder,
  positionAfter,
  tradeFee,
  type HistoryAction,
  type PositionMath,
} from "../../../lib/perp-math";
import { clockFormat, formatMtok, parseMtok, parseUsd, postsToPoints, stampFormat } from "../../../lib/price";
import type { PerpAccount, PerpEvent, PerpMarket, VenueStatus } from "../../../lib/types";
import { perpAccountSchema, perpHistorySchema, perpMarketSchema, statusSchema } from "../../../lib/wire";
import { useNear } from "../providers";
import { CandleChart, ChartCredit, INTERVALS, type Interval } from "../trade/chart";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const POLL_MS = 15_000;
const STALE_S = 600;
const MOVES = [-2000n, -1000n, -500n, 500n, 1000n, 2000n] as const;
const PRESETS = [25n, 50n, 75n, 100n] as const;

type Side = "long" | "short";
type Leg = { sizeDelta: bigint; margin: bigint };
type Notice = { tone: "up" | "down"; text: string; tx: string | null };
type Position = PerpAccount["positions"][number];
type Section = "chart" | "market" | "trade" | "positions";

const abs = (value: bigint) => (value < 0n ? -value : value);
const signed = (micro: bigint) => `${micro > 0n ? "+" : ""}${usd(micro)}`;

function sizeText(tokens: bigint): string {
  return formatMtok(tokens).replaceAll(",", "");
}

function describe(size: bigint): string {
  return size === 0n ? "None" : `${formatMtok(abs(size))} MTok ${size > 0n ? "long" : "short"}`;
}

const ACTIONS: Record<HistoryAction, string> = {
  opened: "Opened",
  increased: "Increased",
  reduced: "Reduced",
  flipped: "Flipped",
  closed: "Closed",
  margin: "Margin changed",
  liquidated: "Liquidated",
};

function math(position: Position): PositionMath {
  return {
    size: BigInt(position.size),
    margin: BigInt(position.margin_usd_micro),
    entryPrice: BigInt(position.entry_price_micro_per_mtok),
    fundingOwed: BigInt(position.funding_owed_usd_micro),
  };
}

export default function PerpsPage() {
  const { accountId, connect, send } = useNear();
  const [model, setModel] = useState("");
  const [market, setMarket] = useState<PerpMarket | null>(null);
  const [status, setStatus] = useState<VenueStatus | null>(null);
  const [account, setAccount] = useState<PerpAccount | null>(null);
  const [history, setHistory] = useState<PerpEvent[] | null>(null);
  const [bucket, setBucket] = useState<Interval>("300");
  const [side, setSide] = useState<Side>("long");
  const [size, setSize] = useState("10");
  const [leverage, setLeverage] = useState(3);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<Section>("chart");
  const [view, setView] = useState<"positions" | "history">("positions");
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const current = useRef("");
  const sizeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const known = MARKETS.find((entry) => entry === params.get("model"));
    if (known) setModel(known);
    const preset = params.get("side");
    if (preset === "long" || preset === "short") setSide(preset);
    const presetSize = params.get("size");
    if (presetSize && parseMtok(presetSize) > 0n) setSize(presetSize);
    const presetLeverage = Number(params.get("leverage"));
    if (Number.isInteger(presetLeverage) && presetLeverage >= 1) setLeverage(presetLeverage);
    if (preset || presetSize || params.get("leverage")) setPanel("trade");
    const readStatus = () =>
      void api("/api/v1/status", statusSchema).then((result) => {
        if (!result.ok) return;
        setStatus(result.data);
        setModel((chosen) => chosen || (result.data.markets.find((entry) => entry.open)?.model ?? MARKETS[0]));
      });
    readStatus();
    const id = window.setInterval(readStatus, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const readMarket = useCallback(() => {
    const wanted = current.current;
    if (!wanted) return;
    void api(`/api/v1/perps/market?model=${encodeURIComponent(wanted)}`, perpMarketSchema).then((result) => {
      if (result.ok && result.data.model === current.current) setMarket(result.data);
      setNow(Math.floor(Date.now() / 1000));
    });
  }, []);

  useEffect(() => {
    if (!model) return;
    current.current = model;
    setMarket(null);
    window.history.replaceState(null, "", `?model=${encodeURIComponent(model)}`);
    readMarket();
    const id = window.setInterval(readMarket, POLL_MS);
    return () => window.clearInterval(id);
  }, [model, readMarket]);

  const readAccount = useCallback(async () => {
    if (!accountId) {
      setAccount(null);
      setHistory(null);
      return;
    }
    const [positions, events] = await Promise.all([
      api(`/api/v1/perps/account?account=${encodeURIComponent(accountId)}`, perpAccountSchema),
      api(`/api/v1/perps/history?account=${encodeURIComponent(accountId)}`, perpHistorySchema),
    ]);
    setAccount(positions.ok ? positions.data : null);
    setHistory(events.ok ? events.data.data : []);
  }, [accountId]);

  useEffect(() => {
    void readAccount();
    if (!accountId) return;
    const id = window.setInterval(() => void readAccount(), POLL_MS);
    return () => window.clearInterval(id);
  }, [accountId, readAccount]);

  const price = market ? BigInt(market.price_micro_per_mtok) : 0n;
  const maxLeverage = market ? Math.max(1, Number(market.max_leverage)) : 5;
  const chosen = Math.min(leverage, maxLeverage);
  const updated = market ? Number(market.updated_at) : 0;
  const age = updated > 0 ? now - updated : null;
  const paused =
    market === null
      ? null
      : !market.listed
        ? "This market isn't listed yet."
        : age === null
          ? "Opens once the keeper posts this model's first index."
          : age > STALE_S
            ? "Paused while the index is more than 10 minutes old."
            : null;
  const open = market !== null && paused === null;
  const longOi = market ? BigInt(market.long_oi) : 0n;
  const shortOi = market ? BigInt(market.short_oi) : 0n;
  const maxOi = market ? BigInt(market.max_oi) : 0n;
  const totalOi = longOi + shortOi;
  const funding = market ? BigInt(market.funding_rate_per_hour) : 0n;
  const points = useMemo(() => postsToPoints(market?.posts ?? []), [market]);
  const postRuns = useMemo(() => runs(market?.posts ?? []).toReversed(), [market]);
  const rows = useMemo(() => historyRows(history ?? []), [history]);

  const position = account?.positions.find((entry) => entry.model === model) ?? null;
  const held = position ? BigInt(position.size) : 0n;
  const wallet = account ? BigInt(account.wallet_usd_micro) : null;
  const tokens = parseMtok(size);
  const delta = side === "long" ? tokens : -tokens;
  const legs: Leg[] = price > 0n ? orderPlan(held, delta, price, BigInt(chosen)) : [];
  const margin = legs.reduce((total, leg) => total + leg.margin, 0n);
  const fees = legs.reduce((total, leg) => total + tradeFee(leg.sizeDelta, price), 0n);
  const after = positionAfter(position ? math(position) : null, legs, price);
  const liquidation = after ? liquidationPrice(after) : null;
  const ladderFor = tokens > 0n ? after : position ? math(position) : null;
  const ladder = ladderFor && price > 0n ? payoffLadder(ladderFor, price, MOVES) : [];
  const ladderLiquidation = ladderFor ? liquidationPrice(ladderFor) : 0n;
  const opposite = held !== 0n && held > 0n !== (side === "long");
  const max = wallet !== null && price > 0n ? maxOpen(wallet, price, BigInt(chosen)) + (opposite ? abs(held) : 0n) : 0n;
  const share = max > 0n ? Number((tokens * 100n) / max > 100n ? 100n : (tokens * 100n) / max) : 0;
  const sizeFill: CSSProperties & Record<"--fill", string> = { "--fill": `${share}%` };
  const leverageFill: CSSProperties & Record<"--fill", string> = {
    "--fill": `${maxLeverage > 1 ? ((chosen - 1) / (maxLeverage - 1)) * 100 : 100}%`,
  };
  const marks = new Map((status?.markets ?? []).map((entry) => [entry.model, entry.index_micro_per_mtok]));
  const leverages = Array.from({ length: Math.min(maxLeverage, 5) }, (_, step) => (maxLeverage <= 5 ? step + 1 : [1, 2, 3, 5, maxLeverage][step] ?? 1));

  const sendLegs = async (target: string, plan: ReadonlyArray<Leg>, done: string) => {
    if (!accountId) {
      await connect();
      return;
    }
    setBusy(true);
    setNotice(null);
    const hashes = await send(
      plan.map((leg) => ({
        receiverId: CORE,
        actions: [
          {
            type: "FunctionCall" as const,
            params: {
              methodName: "modify",
              args: { model: target, size_delta: leg.sizeDelta.toString(), margin_delta: leg.margin.toString() },
              gas: "50000000000000",
              deposit: "1",
            },
          },
        ],
      })),
    );
    if (hashes && hashes.length > 0) {
      const recorded = await api("/api/v1/perps/history", perpHistorySchema, {
        method: "POST",
        body: JSON.stringify({ account: accountId, tx_hashes: hashes.slice(0, 4) }),
      });
      if (recorded.ok) setHistory(recorded.data.data);
    }
    setBusy(false);
    setNotice(
      hashes
        ? { tone: "up", text: done, tx: hashes.at(-1) ?? null }
        : { tone: "down", text: "The wallet didn't sign the order, or it failed on chain. Nothing changed.", tx: null },
    );
    await readAccount();
    readMarket();
  };

  const submit = async () => {
    if (!accountId) {
      await connect();
      return;
    }
    if (!open) return;
    if (tokens <= 0n) {
      setProblem("Enter a size above 0 MTok.");
      sizeRef.current?.focus();
      return;
    }
    if (wallet !== null && margin > wallet) {
      setProblem(`This needs ${usd(margin)} of margin. Your wallet has ${usd(wallet)}.`);
      sizeRef.current?.focus();
      return;
    }
    setProblem(null);
    await sendLegs(model, legs, after ? `Your ${model} position is now ${describe(after.size)}.` : `Closed your ${model} position.`);
  };

  const adjust = (entry: Position, sign: 1n | -1n) => {
    const amount = parseUsd(edits[entry.model] ?? "");
    if (amount === null || amount === 0n) {
      setNotice({ tone: "down", text: "Enter a margin amount in USDC, like 1.00.", tx: null });
      return;
    }
    void sendLegs(entry.model, [{ sizeDelta: 0n, margin: amount * sign }], `${sign > 0n ? "Added" : "Removed"} ${usd(amount)} of margin on ${entry.model}.`);
  };

  const close = (entry: Position) =>
    void sendLegs(entry.model, [{ sizeDelta: -BigInt(entry.size), margin: 0n }], `Closed your ${entry.model} position.`);

  const nudge = (step: number) => setLeverage((value) => Math.min(maxLeverage, Math.max(1, Math.min(value, maxLeverage) + step)));

  const shortcuts = [
    { keys: "B", label: "Long", run: () => setSide("long") },
    { keys: "S", label: "Short", run: () => setSide("short") },
    { keys: "[", label: "Less leverage", run: () => nudge(-1) },
    { keys: "]", label: "More leverage", run: () => nudge(1) },
    {
      keys: "/",
      label: "Jump to size",
      run: () => {
        setPanel("trade");
        sizeRef.current?.focus();
      },
    },
  ];

  const marginControls = (entry: Position) => (
    <div className="flex items-center gap-1.5">
      <input
        value={edits[entry.model] ?? ""}
        onChange={(event) => setEdits((all) => ({ ...all, [entry.model]: event.target.value }))}
        placeholder="1.00"
        inputMode="decimal"
        aria-label={`Margin amount for ${entry.model}, in USDC`}
        className={`${INPUT_SM} w-20`}
      />
      <button type="button" disabled={busy} onClick={() => adjust(entry, 1n)} aria-label={`Add margin to ${entry.model}`} className={ICON}>
        <Plus aria-hidden className="size-4" />
      </button>
      <button type="button" disabled={busy} onClick={() => adjust(entry, -1n)} aria-label={`Remove margin from ${entry.model}`} className={ICON}>
        <Minus aria-hidden className="size-4" />
      </button>
    </div>
  );

  return (
    <div className="flex flex-col pb-[52px] lg:pb-0">
      <h1 className="sr-only">Perps on {model || "the index"}</h1>
      <div className="flex flex-col gap-3 border-b border-line px-4 py-3 lg:h-16 lg:flex-row lg:items-center lg:gap-10 lg:px-6 lg:py-0">
        <MarketSelect value={model} onChange={(next) => setModel(next)} groups={[{ label: "Perps", models: MARKETS }]} />
        <dl className="grid min-w-0 grid-cols-3 gap-x-4 gap-y-2 lg:flex lg:gap-8 lg:overflow-x-auto">
          <Stat label="Index">{price > 0n ? usd(price) : "Not posted"}</Stat>
          <Stat label="Funding (1h)" tone={funding > 0n ? "down" : funding < 0n ? "up" : undefined}>
            {fundingPercent(funding)}
          </Stat>
          <Stat label="Open interest">{formatMtok(totalOi)} MTok</Stat>
          <Stat label="Max leverage">{maxLeverage}x</Stat>
          <Stat label="Index updated">{age === null ? "Never" : ago(age)}</Stat>
          <Stat label="Trading" tone={open ? "up" : "down"}>
            {open ? "Open" : "Paused"}
          </Stat>
        </dl>
        <div className="ml-auto hidden lg:block">
          <Shortcuts items={shortcuts} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:h-[max(600px,calc(100svh_-_260px))] lg:grid-cols-[minmax(0,1fr)_256px_280px] xl:grid-cols-[minmax(0,1fr)_300px_300px]">
        <section
          aria-label="Index chart"
          className={`${panel === "chart" ? "flex" : "hidden"} h-[calc(100svh-17rem)] min-h-[360px] flex-col lg:flex lg:h-auto lg:min-h-0 lg:border-r lg:border-line`}
        >
          <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
            <Toggle label="Candle interval" value={bucket} onChange={setBucket} items={INTERVALS} />
            <div className="flex items-center gap-4">
              <span className="hidden whitespace-nowrap text-[12px] text-muted xl:inline">Index, USD per MTok</span>
              <ChartCredit />
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <CandleChart points={points} bucket={Number(bucket)} empty="No index posts yet. The keeper posts once this model trades." />
          </div>
        </section>

        <div className={`${panel === "market" ? "flex" : "hidden"} min-h-0 flex-col lg:flex lg:border-r lg:border-line`}>
          <Panel inset title={tokens > 0n ? "If the index moves" : "Your position if it moves"} className="shrink-0">
            {ladder.length === 0 ? (
              <p className="px-4 py-4 text-[12px] leading-[18px] text-muted">
                Enter a size to see what the position is worth at other index prices, and where it liquidates.
              </p>
            ) : (
              <table className="w-full border-collapse text-[12px] tabular-nums">
                <thead>
                  <tr>
                    <th scope="col" className="h-7 px-4 text-left font-normal text-muted">
                      Index
                    </th>
                    <th scope="col" className="h-7 text-right font-normal text-muted">
                      PnL
                    </th>
                    <th scope="col" className="h-7 px-4 text-right font-normal text-muted">
                      Equity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ladder.map((step) => (
                    <tr key={step.move.toString()} className="h-6">
                      <td className="px-4 text-ink">
                        {usd(step.price)} <span className="text-muted">{`${step.move > 0n ? "+" : ""}${Number(step.move) / 100}%`}</span>
                      </td>
                      <td className={`text-right ${step.pnl > 0n ? "text-up" : step.pnl < 0n ? "text-down" : "text-ink"}`}>{signed(step.pnl)}</td>
                      <td className={`px-4 text-right ${step.liquidated ? "text-down" : "text-ink"}`}>{step.liquidated ? "Liquidated" : usd(step.equity)}</td>
                    </tr>
                  ))}
                  <tr className="h-7 border-t border-line">
                    <td className="px-4 text-muted" colSpan={2}>
                      Liquidates at
                    </td>
                    <td className="px-4 text-right text-down">{ladderLiquidation === 0n ? "Never" : usd(ladderLiquidation)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </Panel>
          <Panel inset title="Open interest" className="shrink-0 border-t border-line" bodyClassName="flex flex-col gap-2.5 p-4">
            {totalOi > 0n ? (
              <div className="flex h-1.5 w-full bg-hover" aria-hidden>
                <span className="h-full bg-up-tint" style={{ width: `${Number((longOi * 1000n) / totalOi) / 10}%` }} />
                <span className="h-full bg-down-tint" style={{ width: `${Number((shortOi * 1000n) / totalOi) / 10}%` }} />
              </div>
            ) : null}
            <dl className="flex flex-col gap-1.5">
              <Line label="Long" tone="up">
                {formatMtok(longOi)} MTok
              </Line>
              <Line label="Short" tone="down">
                {formatMtok(shortOi)} MTok
              </Line>
              <Line label="Cap per side">{maxOi > 0n ? `${formatMtok(maxOi)} MTok` : "None"}</Line>
              <Line label="Funding">{funding > 0n ? "Longs pay shorts" : funding < 0n ? "Shorts pay longs" : "Nobody pays, sides are even"}</Line>
            </dl>
          </Panel>
          <Panel inset title="Index posts" className="min-h-[200px] border-t border-line lg:min-h-0 lg:flex-1" bodyClassName="flex flex-col">
            {postRuns.length === 0 ? (
              <p className="px-4 py-4 text-[12px] text-muted">No posts yet.</p>
            ) : (
              <ol
                tabIndex={0}
                aria-label="Index posts, newest first"
                className="min-h-0 flex-1 overflow-y-auto py-1 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                {postRuns.map((run, position) => {
                  const older = postRuns[position + 1];
                  const move = older ? run.price - older.price : 0n;
                  return (
                    <li key={`${run.from}-${run.to}`} className="flex min-h-6 items-baseline justify-between gap-3 px-4 py-0.5 text-[12px] tabular-nums">
                      <span className="text-ink">
                        {usd(run.price)}{" "}
                        <span className={move > 0n ? "text-up" : move < 0n ? "text-down" : "text-muted"}>
                          {older ? `${move > 0n ? "+" : ""}${percent(move, older.price)}` : "first"}
                        </span>
                      </span>
                      <span className="text-right text-muted">
                        {run.count > 1
                          ? `${clockFormat.format(new Date(run.from * 1000)).slice(0, 5)} to ${clockFormat.format(new Date(run.to * 1000)).slice(0, 5)}, ${run.count} posts`
                          : clockFormat.format(new Date(run.from * 1000))}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>

        <section aria-label="Order ticket" className={`${panel === "trade" ? "flex" : "hidden"} min-h-0 flex-col lg:flex`}>
          <div className="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line px-4">
            <h2 className="text-[13px] text-ink">
              <span aria-hidden>[ </span>Market order<span aria-hidden> ]</span>
            </h2>
            <span className="text-[12px] text-muted">Fills at the index</span>
          </div>
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 *:shrink-0"
          >
            <Toggle
              big
              label="Side"
              value={side}
              onChange={(next) => {
                setSide(next);
                setProblem(null);
              }}
              items={[
                { value: "long", label: "Long", tone: "up", hotkey: "B" },
                { value: "short", label: "Short", tone: "down", hotkey: "S" },
              ]}
            />
            {accountId ? (
              <dl className="flex flex-col gap-1.5">
                <Line label="Wallet">{wallet === null ? "Reading" : usd(wallet)}</Line>
                <Line label="Position">{describe(held)}</Line>
              </dl>
            ) : null}
            <Field label="Size (MTok)" alert={problem !== null} note={problem ?? undefined}>
              <input
                ref={sizeRef}
                value={size}
                onChange={(event) => setSize(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={problem !== null}
                aria-keyshortcuts="/"
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
                aria-label="Size as a share of the most your wallet can open"
                onChange={(event) => setSize(sizeText((max * BigInt(event.target.value)) / 100n))}
                style={sizeFill}
                className={`range h-5 min-w-0 flex-1 ${FOCUS}`}
              />
              <span className="w-10 text-right text-[12px] tabular-nums text-muted">{share}%</span>
            </div>
            <div role="group" aria-label="Size presets" className="flex gap-1.5">
              {PRESETS.map((part) => (
                <button key={part.toString()} type="button" disabled={max === 0n} onClick={() => setSize(sizeText((max * part) / 100n))} className={CHIP}>
                  {part === 100n ? "Max" : `${part}%`}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between text-[13px]">
                <label htmlFor="leverage" className="text-muted">
                  Leverage
                </label>
                <span className="tabular-nums text-ink">{chosen}x</span>
              </div>
              <input
                id="leverage"
                type="range"
                min={1}
                max={maxLeverage}
                step={1}
                value={chosen}
                aria-keyshortcuts="[ ]"
                onChange={(event) => setLeverage(Number(event.target.value))}
                style={leverageFill}
                className={`range h-5 w-full ${FOCUS}`}
              />
              <div role="group" aria-label="Leverage presets" className="flex gap-1.5">
                {leverages.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={value === chosen}
                    onClick={() => setLeverage(value)}
                    className={CHIP}
                  >
                    {value}x
                  </button>
                ))}
              </div>
            </div>
            <dl className="flex flex-col gap-1.5 border-t border-line pt-3">
              <Line label="Entry price">{price > 0n ? usd(price) : "No index"}</Line>
              <Line label="Notional">{usd(notional(delta, price))}</Line>
              <Line label="Margin">{usd(margin)}</Line>
              <Line label="Fee (0.1%)">{usd(fees)}</Line>
              <Line label="Liquidation price">{liquidation === null || liquidation === 0n ? "None" : usd(liquidation)}</Line>
              <Line label="Position after">{after ? describe(after.size) : "None"}</Line>
            </dl>
            {paused ? <p className="text-[12px] leading-[18px] text-down">{paused}</p> : null}
            <CommitButton
              type="submit"
              tone={!accountId ? "ink" : side === "long" ? "up" : "down"}
              disabled={busy || (accountId !== null && !open)}
              aria-busy={busy}
              className="mt-2 w-full"
            >
              {busy ? "Waiting for the wallet" : accountId ? `${side === "long" ? "Long" : "Short"} ${sizeText(tokens)} MTok` : "Connect wallet to trade"}
            </CommitButton>
            {notice ? (
              <p role="status" className={`text-[13px] leading-[20px] ${notice.tone === "up" ? "text-up" : "text-down"}`}>
                {notice.text}{" "}
                {notice.tx ? (
                  <a href={explorer("txns", notice.tx)} target="_blank" rel="noreferrer" className={LINK}>
                    View transaction
                  </a>
                ) : null}
              </p>
            ) : null}
            <p className="text-[12px] leading-[18px] text-muted">Settles in USDC against the index. Margin moves from your wallet into the position.</p>
          </form>
        </section>
      </div>

      <section aria-label="Positions and history" className={`${panel === "positions" ? "block" : "hidden"} border-t border-line lg:block`}>
        <div className="flex h-10 items-center border-b border-line px-4">
          <Toggle
            label="Account view"
            value={view}
            onChange={setView}
            items={[
              { value: "positions", label: `Positions (${account?.positions.length ?? 0})` },
              { value: "history", label: "History" },
            ]}
          />
        </div>
        {!accountId ? (
          <Empty
            action={
              <button type="button" onClick={() => void connect()} className={SECONDARY}>
                Connect wallet
              </button>
            }
          >
            Connect your NEAR wallet to see positions and trade.
          </Empty>
        ) : view === "history" ? (
          history === null ? (
            <Empty>Reading your history.</Empty>
          ) : rows.length === 0 ? (
            <Empty>No trades recorded yet. Orders you place here show up with their transaction.</Empty>
          ) : (
            <Table
              minWidth={860}
              columns={[
                { label: "Time (UTC)" },
                { label: "Market" },
                { label: "Action" },
                { label: "Change (MTok)", end: true },
                { label: "Position after", end: true },
                { label: "Price", end: true },
                { label: "Fee", end: true },
                { label: "Transaction" },
              ]}
            >
              {rows.map((item) => (
                <tr key={`${item.event.tx_hash}-${item.event.kind}`} className={ROW}>
                  <td className={`${TD} text-muted`}>{stampFormat.format(new Date(item.event.at))}</td>
                  <td className={TD}>{item.event.model}</td>
                  <td className={`${TD} ${item.action === "liquidated" ? "text-down" : ""}`}>{ACTIONS[item.action]}</td>
                  <td className={`${TD} text-right ${item.change > 0n ? "text-up" : item.change < 0n ? "text-down" : "text-muted"}`}>
                    {item.change === 0n ? "0" : `${item.change > 0n ? "+" : "-"}${formatMtok(abs(item.change))}`}
                  </td>
                  <td className={`${TD} text-right`}>{describe(BigInt(item.event.size))}</td>
                  <td className={`${TD} text-right`}>{item.event.price_micro_per_mtok === "0" ? "Unknown" : usd(BigInt(item.event.price_micro_per_mtok))}</td>
                  <td className={`${TD} text-right`}>{usd(BigInt(item.event.fee_usd_micro))}</td>
                  <td className={TD}>
                    <a href={explorer("txns", item.event.tx_hash)} target="_blank" rel="noreferrer" className={`${LINK} font-mono text-[12px]`}>
                      {item.event.tx_hash.slice(0, 8)}
                    </a>
                  </td>
                </tr>
              ))}
            </Table>
          )
        ) : !account || account.positions.length === 0 ? (
          <Empty>No open positions. Long if you think inference gets dearer, short if you think it gets cheaper.</Empty>
        ) : (
          <>
            <div className="lg:hidden">
              {account.positions.map((entry) => {
                const amount = BigInt(entry.size);
                const posted = entry.model === model ? price : BigInt(marks.get(entry.model) ?? "0");
                const pnl = BigInt(entry.equity_usd_micro) - BigInt(entry.margin_usd_micro) + BigInt(entry.funding_owed_usd_micro);
                const liq = BigInt(entry.liquidation_price_micro_per_mtok);
                return (
                  <article key={entry.model} className="flex flex-col gap-3 border-b border-line px-4 py-4">
                    <h3 className="text-[15px] text-ink">
                      {entry.model} <span className={amount > 0n ? "text-up" : "text-down"}>{describe(amount)}</span>
                    </h3>
                    <dl className="flex flex-col gap-1.5">
                      <Line label="Entry">{usd(BigInt(entry.entry_price_micro_per_mtok))}</Line>
                      <Line label="Index">{posted > 0n ? usd(posted) : "None"}</Line>
                      <Line label="Margin">{usd(BigInt(entry.margin_usd_micro))}</Line>
                      <Line label="PnL" tone={pnl > 0n ? "up" : pnl < 0n ? "down" : undefined}>
                        {signed(pnl)} ({percent(pnl, BigInt(entry.margin_usd_micro))})
                      </Line>
                      <Line label="Liquidation price">{liq === 0n ? "None" : usd(liq)}</Line>
                    </dl>
                    <div className="flex items-center justify-between gap-2">
                      {marginControls(entry)}
                      <button type="button" disabled={busy} onClick={() => close(entry)} className={SECONDARY}>
                        Close
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
            <div className="hidden lg:block">
              <Table
                minWidth={1080}
                columns={[
                  { label: "Market" },
                  { label: "Size (MTok)", end: true },
                  { label: "Entry", end: true },
                  { label: "Index", end: true },
                  { label: "Margin", end: true },
                  { label: "PnL (ROE)", end: true },
                  { label: "Liq. price", end: true },
                  { label: "Funding owed", end: true },
                  { label: "Adjust margin" },
                  { label: "" },
                ]}
              >
                {account.positions.map((entry) => {
                  const amount = BigInt(entry.size);
                  const posted = entry.model === model ? price : BigInt(marks.get(entry.model) ?? "0");
                  const pnl = BigInt(entry.equity_usd_micro) - BigInt(entry.margin_usd_micro) + BigInt(entry.funding_owed_usd_micro);
                  const liq = BigInt(entry.liquidation_price_micro_per_mtok);
                  return (
                    <tr key={entry.model} className={ROW}>
                      <td className={TD}>
                        {entry.model} <span className={amount > 0n ? "text-up" : "text-down"}>{amount > 0n ? "Long" : "Short"}</span>
                      </td>
                      <td className={`${TD} text-right`}>{formatMtok(abs(amount))}</td>
                      <td className={`${TD} text-right`}>{usd(BigInt(entry.entry_price_micro_per_mtok))}</td>
                      <td className={`${TD} text-right`}>{posted > 0n ? usd(posted) : "None"}</td>
                      <td className={`${TD} text-right`}>{usd(BigInt(entry.margin_usd_micro))}</td>
                      <td className={`${TD} text-right ${pnl > 0n ? "text-up" : pnl < 0n ? "text-down" : ""}`}>
                        {signed(pnl)} ({percent(pnl, BigInt(entry.margin_usd_micro))})
                      </td>
                      <td className={`${TD} text-right`}>{liq === 0n ? "None" : usd(liq)}</td>
                      <td className={`${TD} text-right`}>{usd(BigInt(entry.funding_owed_usd_micro))}</td>
                      <td className={TD}>{marginControls(entry)}</td>
                      <td className={`${TD} text-right`}>
                        <button type="button" disabled={busy} onClick={() => close(entry)} className={SECONDARY}>
                          Close
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </Table>
            </div>
          </>
        )}
      </section>

      <MobileTabs
        value={panel}
        onChange={setPanel}
        items={[
          { value: "chart", label: "Chart" },
          { value: "market", label: "Market" },
          { value: "trade", label: "Trade" },
          { value: "positions", label: "Positions" },
        ]}
      />
    </div>
  );
}
