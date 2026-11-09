"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMicroPerMtok, formatMtok, parseMtok, parseUsd } from "../../../lib/price";
import type { Book } from "../../../lib/types";

const MODELS = ["glm-5.3-flash", "glm-5.3", "deepseek-v4.1-flash"];

export default function TradePage() {
  const [model, setModel] = useState(MODELS[0] ?? "");
  const [key, setKey] = useState("");
  const [book, setBook] = useState<Book | null>(null);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [size, setSize] = useState("1");
  const [limit, setLimit] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setKey(localStorage.getItem("meridian_key") ?? "");
  }, []);

  const load = useCallback(async () => {
    const response = await fetch(`/api/v1/book?model=${encodeURIComponent(model)}`);
    setBook(response.ok ? ((await response.json()) as Book) : null);
  }, [model]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const tokens = parseMtok(size);
    if (tokens <= 0n) {
      setMessage("invalid size");
      return;
    }
    if (!key.startsWith("rk_")) {
      setMessage("paste an rk_ key");
      return;
    }
    localStorage.setItem("meridian_key", key);
    const limitPrice = limit.trim() === "" ? null : parseUsd(limit);
    if (limit.trim() !== "" && limitPrice === null) {
      setMessage("invalid limit");
      return;
    }
    setBusy(true);
    const response = await fetch(`/api/v1/${side === "buy" ? "trades" : "sells"}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        tokens: tokens.toString(),
        ...(limitPrice === null ? {} : { limit_price_micro_per_mtok: limitPrice.toString() }),
      }),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setBusy(false);
    setMessage(response.ok ? `${side === "buy" ? "bought" : "sold"} ${size} MTok` : (body.error?.message ?? "failed"));
    await load();
  };

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">MTokens</h1>
          <p className="text-[#555]">Buy capacity ahead, or sell what you won&apos;t use.</p>
        </div>
        <select value={model} onChange={(event) => setModel(event.target.value)} className="h-10 rounded-[6px] border border-[#CECECE] px-3">
          {MODELS.map((entry) => (
            <option key={entry} value={entry}>
              {entry}
            </option>
          ))}
        </select>
      </header>

      <div className="grid gap-6 md:grid-cols-[1fr_320px]">
        <section className="rounded-[8px] border border-[#CECECE]">
          <div className="border-b border-[#CECECE] px-4 py-3 text-sm font-semibold">Asks</div>
          <div className="divide-y divide-[#EEEEEE]">
            {(book?.asks ?? []).length === 0 && <p className="px-4 py-6 text-sm text-[#777]">No asks yet. Be the first seller.</p>}
            {(book?.asks ?? []).map((ask) => (
              <div key={`${ask.listing_id}-${ask.offer_id ?? "listing"}`} className="flex items-center justify-between px-4 py-2 text-sm tabular-nums">
                <span>{formatMicroPerMtok(BigInt(ask.price_micro_per_mtok))}</span>
                <span>{formatMtok(BigInt(ask.tokens_left))} MTok</span>
                <span className="text-[#777]">{ask.rail}{ask.kind === "resale" ? " · resale" : ""}</span>
              </div>
            ))}
          </div>
          <div className="border-y border-[#CECECE] px-4 py-3 text-sm font-semibold">Bids</div>
          <div className="divide-y divide-[#EEEEEE]">
            {(book?.bids ?? []).length === 0 && <p className="px-4 py-6 text-sm text-[#777]">No bids.</p>}
            {(book?.bids ?? []).map((bid) => (
              <div key={`${bid.price_micro_per_mtok}-${bid.tokens}`} className="flex items-center justify-between px-4 py-2 text-sm tabular-nums">
                <span>{formatMicroPerMtok(BigInt(bid.price_micro_per_mtok))}</span>
                <span>{formatMtok(BigInt(bid.tokens))} MTok</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3 rounded-[8px] border border-[#CECECE] p-4">
          <div className="flex gap-2">
            <button type="button" onClick={() => setSide("buy")} className={`h-9 flex-1 rounded-[6px] font-semibold ${side === "buy" ? "bg-black text-white" : "border border-[#CECECE]"}`}>
              Buy
            </button>
            <button type="button" onClick={() => setSide("sell")} className={`h-9 flex-1 rounded-[6px] font-semibold ${side === "sell" ? "bg-black text-white" : "border border-[#CECECE]"}`}>
              Sell
            </button>
          </div>
          <label className="flex flex-col gap-1 text-sm">
            Router key
            <input value={key} onChange={(event) => setKey(event.target.value)} placeholder="rk_…" className="h-10 rounded-[6px] border border-[#CECECE] px-3 font-mono text-xs" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Size (MTok)
            <input value={size} onChange={(event) => setSize(event.target.value)} className="h-10 rounded-[6px] border border-[#CECECE] px-3 tabular-nums" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Limit (USD/MTok, blank for market)
            <input value={limit} onChange={(event) => setLimit(event.target.value)} className="h-10 rounded-[6px] border border-[#CECECE] px-3 tabular-nums" />
          </label>
          <button type="button" disabled={busy} onClick={() => void submit()} className="h-10 rounded-[6px] bg-black font-semibold text-white disabled:bg-[#D4D4D4]">
            {side === "buy" ? "Buy" : "Sell"} {size} MTok
          </button>
          {message && <p className="text-sm text-[#555]">{message}</p>}
          <p className="text-xs text-[#777]">A buy charges your float; the router pulls from your wallet when it runs low.</p>
        </section>
      </div>
    </main>
  );
}
