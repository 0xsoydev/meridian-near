"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMicroPerMtok, formatMtok, formatUsd, parseMtok, parseUsd } from "../../../lib/price";
import { orderPlan } from "../../../lib/perp-math";
import type { PerpAccount } from "../../../lib/types";
import { useNear } from "../providers";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const MODELS = ["glm-5.3-flash", "glm-5.3", "deepseek-v4.1-flash"];

type Market = {
  model: string;
  listed: boolean;
  price_micro_per_mtok: string;
  funding_rate_per_hour: string;
  long_oi: string;
  short_oi: string;
  updated_at: string;
  posts: { price_micro_per_mtok: string; at: number }[];
};

function Spark({ posts }: { posts: Market["posts"] }) {
  if (posts.length < 2) return <p className="text-sm text-[#777]">Waiting for the first index post.</p>;
  const values = posts.map((post) => Number(post.price_micro_per_mtok));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => `${(index / (values.length - 1)) * 100},${40 - ((value - min) / span) * 36}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 40" className="h-24 w-full" preserveAspectRatio="none">
      <polyline fill="none" stroke="#1743FF" strokeWidth="1" points={points} />
    </svg>
  );
}

export default function PerpsPage() {
  const { accountId, connect, send } = useNear();
  const [model, setModel] = useState(MODELS[0] ?? "");
  const [market, setMarket] = useState<Market | null>(null);
  const [account, setAccount] = useState<PerpAccount | null>(null);
  const [size, setSize] = useState("10");
  const [margin, setMargin] = useState("1");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const marketResponse = await fetch(`/api/v1/perps/market?model=${encodeURIComponent(model)}`);
    setMarket(marketResponse.ok ? ((await marketResponse.json()) as Market) : null);
    if (!accountId) {
      setAccount(null);
      return;
    }
    const accountResponse = await fetch(`/api/v1/perps/account?account=${encodeURIComponent(accountId)}`);
    setAccount(accountResponse.ok ? ((await accountResponse.json()) as PerpAccount) : null);
  }, [accountId, model]);

  useEffect(() => {
    void load();
  }, [load]);

  const sendLegs = async (marketModel: string, legs: { sizeDelta: bigint; margin: bigint }[]) => {
    if (!accountId) {
      await connect();
      return;
    }
    if (legs.length === 0) {
      setMessage("size is zero");
      return;
    }
    setBusy(true);
    const ok = await send(
      legs.map((leg) => ({
        receiverId: CORE,
        actions: [
          {
            type: "FunctionCall" as const,
            params: {
              methodName: "modify",
              args: { model: marketModel, size_delta: leg.sizeDelta.toString(), margin_delta: leg.margin.toString() },
              gas: "50000000000000",
              deposit: "1",
            },
          },
        ],
      })),
    );
    setBusy(false);
    setMessage(ok ? "signed" : "not signed");
    await load();
  };

  const open = (direction: 1n | -1n) => {
    const tokens = parseMtok(size);
    const micro = parseUsd(margin);
    if (tokens <= 0n || micro === null) {
      setMessage("invalid size or margin");
      return;
    }
    const held = account?.positions.find((position) => position.model === model);
    const current = held ? BigInt(held.size) : 0n;
    const price = market ? BigInt(market.price_micro_per_mtok) : 0n;
    const legs = orderPlan(current, tokens * direction, price, 5n).map((leg) =>
      leg.margin > 0n ? { ...leg, margin: micro } : leg,
    );
    void sendLegs(model, legs);
  };

  const adjustMargin = (marketModel: string, sign: 1n | -1n) => {
    const micro = parseUsd(margin);
    if (micro === null || micro === 0n) {
      setMessage("invalid margin");
      return;
    }
    void sendLegs(marketModel, [{ sizeDelta: 0n, margin: micro * sign }]);
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Perps</h1>
          <p className="text-[#555]">Cash-settled against the venue&apos;s $/MToken index.</p>
        </div>
        <select value={model} onChange={(event) => setModel(event.target.value)} className="h-10 rounded-[6px] border border-[#CECECE] px-3">
          {MODELS.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </header>

      <section className="grid gap-6 rounded-[8px] border border-[#CECECE] p-5 md:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-6 text-sm tabular-nums">
            <span>index {market ? formatMicroPerMtok(BigInt(market.price_micro_per_mtok)) : "—"}</span>
            <span className="text-[#777]">funding/h {market ? formatMicroPerMtok(BigInt(market.funding_rate_per_hour)) : "—"}</span>
            <span className="text-[#777]">
              OI {market ? formatMtok(BigInt(market.long_oi)) : "—"} L / {market ? formatMtok(BigInt(market.short_oi)) : "—"} S
            </span>
          </div>
          <Spark posts={market?.posts ?? []} />
        </div>
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            Size (MTok)
            <input value={size} onChange={(event) => setSize(event.target.value)} className="h-10 rounded-[6px] border border-[#CECECE] px-3 tabular-nums" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Margin (USDC)
            <input value={margin} onChange={(event) => setMargin(event.target.value)} className="h-10 rounded-[6px] border border-[#CECECE] px-3 tabular-nums" />
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={busy} onClick={() => open(1n)} className="h-10 flex-1 rounded-[6px] bg-black font-semibold text-white disabled:bg-[#D4D4D4]">
              Long
            </button>
            <button type="button" disabled={busy} onClick={() => open(-1n)} className="h-10 flex-1 rounded-[6px] border border-[#CECECE] font-semibold">
              Short
            </button>
          </div>
          {message && <p className="text-sm text-[#555]">{message}</p>}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Positions</h2>
        {!accountId && (
          <button type="button" onClick={() => void connect()} className="h-10 w-fit rounded-[6px] bg-black px-4 font-semibold text-white">
            Connect a wallet
          </button>
        )}
        {accountId && account && account.positions.length === 0 && <p className="text-[#555]">No positions.</p>}
        {(account?.positions ?? []).map((position) => (
          <article key={position.model} className="grid gap-2 rounded-[8px] border border-[#CECECE] p-4 text-sm tabular-nums md:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1">
              <p className="font-semibold">{position.model}</p>
              <p className="text-[#555]">
                size {formatMtok(BigInt(position.size))} MTok · equity {formatUsd(BigInt(position.equity_usd_micro))} · liq{" "}
                {formatMicroPerMtok(BigInt(position.liquidation_price_micro_per_mtok))}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => adjustMargin(position.model, 1n)}
                className="h-9 rounded-[6px] border border-[#CECECE] px-3 font-semibold"
              >
                Add margin
              </button>
              <button
                type="button"
                onClick={() => adjustMargin(position.model, -1n)}
                className="h-9 rounded-[6px] border border-[#CECECE] px-3 font-semibold"
              >
                Remove margin
              </button>
              <button
                type="button"
                onClick={() => void sendLegs(position.model, [{ sizeDelta: -BigInt(position.size), margin: 0n }])}
                className="h-9 rounded-[6px] border border-[#CECECE] px-3 font-semibold"
              >
                Close
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
