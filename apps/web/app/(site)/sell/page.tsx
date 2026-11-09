"use client";

import { useCallback, useEffect, useState } from "react";
import { formatUsd, parseUsd } from "../../../lib/price";
import type { SellerListings, SellerPayouts } from "../../../lib/types";
import { useNear } from "../providers";

const RAILS = ["openrouter", "commandcode", "zen", "opencode-go", "anthropic", "openai"];

export default function SellPage() {
  const { accountId, connect, sign } = useNear();
  const [rail, setRail] = useState(RAILS[0] ?? "");
  const [model, setModel] = useState("glm-5.3-flash");
  const [price, setPrice] = useState("0.17");
  const [capacity, setCapacity] = useState("20");
  const [apiKey, setApiKey] = useState("");
  const [listings, setListings] = useState<SellerListings["listings"]>([]);
  const [payouts, setPayouts] = useState<SellerPayouts | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    const [listed, paid] = await Promise.all([
      fetch(`/api/listings?seller=${encodeURIComponent(accountId)}`),
      fetch(`/api/v1/payouts?seller=${encodeURIComponent(accountId)}`),
    ]);
    if (listed.ok) setListings(((await listed.json()) as SellerListings).listings);
    if (paid.ok) setPayouts((await paid.json()) as SellerPayouts);
  }, [accountId]);

  useEffect(() => {
    void load();
  }, [load]);

  const list = async () => {
    const micro = parseUsd(price);
    if (micro === null) {
      setMessage("invalid price");
      return;
    }
    if (!apiKey.startsWith("sk-")) {
      setMessage("paste the provider API key");
      return;
    }
    setBusy(true);
    const envelope = await sign("list", {
      rail,
      model,
      capacity_mtok: capacity,
      price_micro_per_mtok: micro.toString(),
      client_nonce: crypto.randomUUID(),
    });
    if (!envelope) {
      setBusy(false);
      return;
    }
    const response = await fetch("/api/listings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ signed: envelope, credential: { kind: "key", key: apiKey } }),
    });
    const body = (await response.json()) as { error?: { message: string } };
    setBusy(false);
    setMessage(response.ok ? "listed" : (body.error?.message ?? "failed"));
    if (response.ok) {
      setApiKey("");
      await load();
    }
  };

  if (!accountId) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
        <h1 className="text-3xl font-semibold">Sell capacity</h1>
        <p className="text-[#555]">Connect a NEAR wallet to list a provider key.</p>
        <button type="button" onClick={() => void connect()} className="h-10 w-fit rounded-[6px] bg-black px-5 font-semibold text-white">
          Connect
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold">Sell capacity</h1>
        <p className="text-[#555]">Your key stays sealed on the server and is only opened for the request that spends it.</p>
      </header>

      <section className="grid gap-3 rounded-[8px] border border-[#CECECE] p-5 md:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm">
          Provider
          <select value={rail} onChange={(event) => setRail(event.target.value)} className="h-10 rounded-[6px] border border-[#CECECE] px-3">
            {RAILS.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Model
          <input value={model} onChange={(event) => setModel(event.target.value)} className="h-10 rounded-[6px] border border-[#CECECE] px-3" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Price (USD per MTok)
          <input value={price} onChange={(event) => setPrice(event.target.value)} className="h-10 rounded-[6px] border border-[#CECECE] px-3 tabular-nums" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Capacity (MTok)
          <input value={capacity} onChange={(event) => setCapacity(event.target.value)} className="h-10 rounded-[6px] border border-[#CECECE] px-3 tabular-nums" />
        </label>
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          Provider API key
          <input value={apiKey} onChange={(event) => setApiKey(event.target.value)} type="password" className="h-10 rounded-[6px] border border-[#CECECE] px-3 font-mono text-xs" />
        </label>
        <button type="button" disabled={busy} onClick={() => void list()} className="h-10 w-fit rounded-[6px] bg-black px-5 font-semibold text-white disabled:bg-[#D4D4D4] md:col-span-2">
          List
        </button>
        {message && <p className="text-sm text-[#555] md:col-span-2">{message}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Your listings</h2>
        {listings.length === 0 && <p className="text-[#555]">Nothing listed yet.</p>}
        {listings.map((listing) => (
          <article key={listing.listing_id} className="flex flex-wrap items-center justify-between gap-2 rounded-[8px] border border-[#CECECE] p-4 text-sm tabular-nums">
            <span className="font-semibold">{listing.model}</span>
            <span>{listing.rail}</span>
            <span>{formatUsd(BigInt(listing.price_micro_per_mtok))}</span>
            <span className="text-[#777]">
              {listing.used_tokens} of {listing.capacity_tokens} used
            </span>
            <span className="text-[#777]">{listing.status}</span>
          </article>
        ))}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Earnings</h2>
        <p className="text-[#555] tabular-nums">
          unpaid {payouts ? formatUsd(BigInt(payouts.unpaid_usd_micro)) : "—"} · {payouts?.network ?? ""}
        </p>
        {(payouts?.data ?? []).map((payout) => (
          <p key={`${payout.day}-${payout.tx_hash ?? "pending"}`} className="text-sm tabular-nums text-[#555]">
            {payout.day} · {formatUsd(BigInt(payout.amount_usd_micro))} · {payout.status}
          </p>
        ))}
      </section>
    </main>
  );
}
