"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CommitButton,
  Empty,
  FOCUS,
  Field,
  ICON,
  INPUT,
  INPUT_SM,
  Line,
  MarketSelect,
  Panel,
  ROW,
  SECONDARY,
  Stat,
  TD,
  Table,
  Toggle,
} from "../../../components/kit";
import { ago, api, fundingPercent, percent, usd } from "../../../lib/client";
import { MARKETS } from "../../../lib/markets";
import { liquidationPrice, maxOpen, notional, orderPlan, positionAfter, tradeFee } from "../../../lib/perp-math";
import { clockFormat, formatMtok, parseMtok, parseUsd, postsToPoints } from "../../../lib/price";
import type { PerpAccount, VenueStatus } from "../../../lib/types";
import { useNear } from "../providers";
import { CandleChart, INTERVALS, type Interval } from "../trade/chart";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const POLL_MS = 15_000;
const STALE_S = 600;

type Market = {
  model: string;
  listed: boolean;
  price_micro_per_mtok: string;
  updated_at: string;
  long_oi: string;
  short_oi: string;
  funding_rate_per_hour: string;
  max_leverage: string;
  posts: { price_micro_per_mtok: string; at: number }[];
};
type Side = "long" | "short";
type Leg = { sizeDelta: bigint; margin: bigint };
type Notice = { tone: "up" | "down"; text: string };
type Position = PerpAccount["positions"][number];

const abs = (value: bigint) => (value < 0n ? -value : value);
const signed = (micro: bigint) => `${micro > 0n ? "+" : ""}${usd(micro)}`;

function sizeText(tokens: bigint): string {
  return formatMtok(tokens).replaceAll(",", "");
}

function describe(size: bigint): string {
  return size === 0n ? "None" : `${formatMtok(abs(size))} MTok ${size > 0n ? "long" : "short"}`;
}

export default function PerpsPage() {
  const { accountId, connect, send } = useNear();
  const [model, setModel] = useState("");
  const [market, setMarket] = useState<Market | null>(null);
  const [status, setStatus] = useState<VenueStatus | null>(null);
  const [account, setAccount] = useState<PerpAccount | null>(null);
  const [bucket, setBucket] = useState<Interval>("300");
  const [side, setSide] = useState<Side>("long");
  const [size, setSize] = useState("10");
  const [leverage, setLeverage] = useState(3);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const current = useRef("");
  const sizeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const known = MARKETS.find((entry) => entry === params.get("model"));
    if (known) setModel(known);
    if (params.get("side") === "short") setSide("short");
    const readStatus = () =>
      void api<VenueStatus>("/api/v1/status").then((result) => {
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
    void api<Market>(`/api/v1/perps/market?model=${encodeURIComponent(wanted)}`).then((result) => {
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
      return;
    }
    const result = await api<PerpAccount>(`/api/v1/perps/account?account=${encodeURIComponent(accountId)}`);
    setAccount(result.ok ? result.data : null);
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
  const totalOi = longOi + shortOi;
  const funding = market ? BigInt(market.funding_rate_per_hour) : 0n;
  const points = useMemo(() => postsToPoints(market?.posts ?? []), [market]);
  const posts = useMemo(() => (market?.posts ?? []).toReversed(), [market]);

  const position = account?.positions.find((entry) => entry.model === model) ?? null;
  const held = position ? BigInt(position.size) : 0n;
  const wallet = account ? BigInt(account.wallet_usd_micro) : null;
  const tokens = parseMtok(size);
  const delta = side === "long" ? tokens : -tokens;
  const legs: Leg[] = price > 0n ? orderPlan(held, delta, price, BigInt(chosen)) : [];
  const margin = legs.reduce((total, leg) => total + leg.margin, 0n);
  const fees = legs.reduce((total, leg) => total + tradeFee(leg.sizeDelta, price), 0n);
  const after = positionAfter(
    position
      ? {
          size: held,
          margin: BigInt(position.margin_usd_micro),
          entryPrice: BigInt(position.entry_price_micro_per_mtok),
          fundingOwed: BigInt(position.funding_owed_usd_micro),
        }
      : null,
    legs,
    price,
  );
  const liquidation = after ? liquidationPrice(after) : null;
  const opposite = held !== 0n && (held > 0n) !== (side === "long");
  const max = wallet !== null && price > 0n ? maxOpen(wallet, price, BigInt(chosen)) + (opposite ? abs(held) : 0n) : 0n;
  const share = max > 0n ? Number((tokens * 100n) / max > 100n ? 100n : (tokens * 100n) / max) : 0;
  const sizeFill: CSSProperties & Record<"--fill", string> = { "--fill": `${share}%` };
  const leverageFill: CSSProperties & Record<"--fill", string> = {
    "--fill": `${maxLeverage > 1 ? ((chosen - 1) / (maxLeverage - 1)) * 100 : 100}%`,
  };
  const marks = new Map((status?.markets ?? []).map((entry) => [entry.model, entry.index_micro_per_mtok]));

  const sendLegs = async (target: string, plan: ReadonlyArray<Leg>, done: string) => {
    if (!accountId) {
      await connect();
      return;
    }
    setBusy(true);
    setNotice(null);
    const ok = await send(
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
    setBusy(false);
    setNotice(
      ok
        ? { tone: "up", text: done }
        : { tone: "down", text: "The wallet didn't sign the order, or it failed on chain. Check your wallet's activity." },
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
    await sendLegs(
      model,
      legs,
      after ? `Your ${model} position is now ${describe(after.size)}.` : `Closed your ${model} position.`,
    );
  };

  const adjust = (entry: Position, sign: 1n | -1n) => {
    const amount = parseUsd(edits[entry.model] ?? "");
    if (amount === null || amount === 0n) {
      setNotice({ tone: "down", text: "Enter a margin amount in USDC, like 1.00." });
      return;
    }
    void sendLegs(
      entry.model,
      [{ sizeDelta: 0n, margin: amount * sign }],
      `${sign > 0n ? "Added" : "Removed"} ${usd(amount)} of margin on ${entry.model}.`,
    );
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-4 py-3 lg:h-16 lg:flex-row lg:items-center lg:gap-10 lg:px-6 lg:py-0">
        <MarketSelect value={model} onChange={(next) => setModel(next)} groups={[{ label: "Perps", models: MARKETS }]} />
        <dl className="flex min-w-0 gap-8 overflow-x-auto pb-1 lg:pb-0">
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
      </div>

      <div className="grid grid-cols-1 lg:h-[max(560px,calc(100svh_-_260px))] lg:grid-cols-[minmax(0,1fr)_256px_280px] xl:grid-cols-[minmax(0,1fr)_280px_300px]">
        <section aria-label="Index chart" className="flex min-h-0 flex-col border-b border-line lg:border-b-0 lg:border-r">
          <div className="flex h-10 shrink-0 items-center justify-between gap-4 border-b border-line px-4">
            <Toggle label="Candle interval" value={bucket} onChange={setBucket} items={INTERVALS} />
            <span className="text-[12px] text-muted">Index, USD per MTok</span>
          </div>
          <div className="h-[320px] min-h-0 lg:h-auto lg:flex-1">
            <CandleChart points={points} bucket={Number(bucket)} empty="No index posts yet. The keeper posts once this model trades." />
          </div>
        </section>

        <div className="order-3 flex min-h-0 flex-col border-b border-line lg:order-2 lg:border-b-0 lg:border-r">
          <Panel inset title="Open interest" className="shrink-0" bodyClassName="flex flex-col gap-3 p-4">
            <div className="flex h-2 w-full bg-hover" aria-hidden>
              {totalOi > 0n ? (
                <>
                  <span className="h-full bg-up-tint" style={{ width: `${Number((longOi * 1000n) / totalOi) / 10}%` }} />
                  <span className="h-full bg-down-tint" style={{ width: `${Number((shortOi * 1000n) / totalOi) / 10}%` }} />
                </>
              ) : null}
            </div>
            <dl className="flex flex-col gap-1.5">
              <Line label="Long" tone="up">
                {formatMtok(longOi)} MTok
              </Line>
              <Line label="Short" tone="down">
                {formatMtok(shortOi)} MTok
              </Line>
              <Line label="Paid by">{funding > 0n ? "Longs, to shorts" : funding < 0n ? "Shorts, to longs" : "Nobody, interest is even"}</Line>
            </dl>
          </Panel>
          <Panel inset title="Index posts" className="h-[360px] border-t border-line lg:h-auto lg:flex-1" bodyClassName="flex flex-col">
            <div className="grid h-7 shrink-0 grid-cols-3 items-center px-4 text-[12px] text-muted">
              <span>Price</span>
              <span className="text-right">Change</span>
              <span className="text-right">Time (UTC)</span>
            </div>
            {posts.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-muted">No posts yet.</p>
            ) : (
              <ol className="min-h-0 flex-1 overflow-y-auto">
                {posts.map((post, index) => {
                  const value = BigInt(post.price_micro_per_mtok);
                  const older = posts[index + 1];
                  const move = older ? value - BigInt(older.price_micro_per_mtok) : 0n;
                  return (
                    <li key={post.at} className="grid h-6 grid-cols-3 items-center px-4 text-[12px] tabular-nums">
                      <span className="text-ink">{usd(value)}</span>
                      <span className={`text-right ${move > 0n ? "text-up" : move < 0n ? "text-down" : "text-muted"}`}>
                        {older ? `${move > 0n ? "+" : ""}${percent(move, BigInt(older.price_micro_per_mtok))}` : "First"}
                      </span>
                      <span className="text-right text-muted">{clockFormat.format(new Date(post.at * 1000))}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        </div>

        <section aria-label="Order ticket" className="order-2 flex min-h-0 flex-col border-b border-line lg:order-3 lg:border-b-0">
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
            className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
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
                { value: "long", label: "Long", tone: "up" },
                { value: "short", label: "Short", tone: "down" },
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
                onChange={(event) => setLeverage(Number(event.target.value))}
                style={leverageFill}
                className={`range h-5 w-full ${FOCUS}`}
              />
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
              tone={side === "long" ? "up" : "down"}
              disabled={busy || (accountId !== null && !open)}
              aria-busy={busy}
              className="mt-1 w-full"
            >
              {busy
                ? "Waiting for the wallet"
                : accountId
                  ? `${side === "long" ? "Long" : "Short"} ${sizeText(tokens)} MTok`
                  : "Connect wallet to trade"}
            </CommitButton>
            {notice ? (
              <p role="status" className={`text-[13px] leading-[20px] ${notice.tone === "up" ? "text-up" : "text-down"}`}>
                {notice.text}
              </p>
            ) : null}
            <p className="text-[12px] leading-[18px] text-muted">
              Settles in USDC against the index. Margin moves from your wallet into the position.
            </p>
          </form>
        </section>
      </div>

      <section aria-label="Positions" className="border-t border-line">
        <div className="flex h-10 items-center border-b border-line px-4">
          <h2 className="text-[13px] text-ink underline decoration-accent underline-offset-[6px]">
            Positions ({account?.positions.length ?? 0})
          </h2>
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
        ) : !account || account.positions.length === 0 ? (
          <Empty>No open positions. Long if you think inference gets dearer, short if you think it gets cheaper.</Empty>
        ) : (
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
                  <td className={TD}>
                    <div className="flex items-center gap-1.5">
                      <input
                        value={edits[entry.model] ?? ""}
                        onChange={(event) => setEdits((all) => ({ ...all, [entry.model]: event.target.value }))}
                        placeholder="1.00"
                        inputMode="decimal"
                        aria-label={`Margin amount for ${entry.model}, in USDC`}
                        className={`${INPUT_SM} w-20`}
                      />
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => adjust(entry, 1n)}
                        aria-label={`Add margin to ${entry.model}`}
                        className={ICON}
                      >
                        <Plus aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => adjust(entry, -1n)}
                        aria-label={`Remove margin from ${entry.model}`}
                        className={ICON}
                      >
                        <Minus aria-hidden className="size-4" />
                      </button>
                    </div>
                  </td>
                  <td className={`${TD} text-right`}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void sendLegs(entry.model, [{ sizeDelta: -amount, margin: 0n }], `Closed your ${entry.model} position.`)
                      }
                      className={SECONDARY}
                    >
                      Close
                    </button>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </section>
    </div>
  );
}
