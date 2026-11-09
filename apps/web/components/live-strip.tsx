"use client";

import { useEffect, useState } from "react";
import { z } from "zod";
import { ago } from "../lib/client";
import { formatMicroPerMtok, formatMtok } from "../lib/price";

const POLL_MS = 30_000;
const STALE_S = 600;

const statusSchema = z.object({
  keeper_last_post_s: z.number().nullable(),
  markets: z.array(z.object({ model: z.string(), index_micro_per_mtok: z.string().nullable(), open: z.boolean() })),
  payouts: z.object({ pending: z.number(), executed: z.number() }),
  venue: z.object({ fills_24h: z.number(), volume_24h_tokens: z.string(), open_asks: z.number() }),
});

export function LiveStrip() {
  const [status, setStatus] = useState<z.infer<typeof statusSchema> | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/v1/status", { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((body: unknown) => {
          if (!alive) return;
          const parsed = statusSchema.safeParse(body);
          setStatus(parsed.success ? parsed.data : null);
          setDown(!parsed.success);
        })
        .catch(() => {
          if (alive) setDown(true);
        });
    void load();
    const id = window.setInterval(() => void load(), POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const lastPost = status?.keeper_last_post_s ?? null;
  const keeperUp = lastPost !== null && lastPost <= STALE_S;

  return (
    <div className="flex h-9 items-center gap-x-6 overflow-x-auto whitespace-nowrap text-[12px] tabular-nums text-muted">
      <span className="flex items-center gap-1.5 text-ink">
        <span aria-hidden className={`size-[7px] rounded-full ${keeperUp ? "bg-up" : "bg-down"}`} />
        {status === null
          ? down
            ? "Venue status unavailable"
            : "Reading the venue"
          : keeperUp && lastPost !== null
            ? `Keeper posted ${ago(lastPost)}`
            : "Keeper quiet, no fresh index"}
      </span>
      {status?.markets.map((market) => (
        <span key={market.model}>
          {market.model}{" "}
          <span className={market.open ? "text-ink" : ""}>
            {market.index_micro_per_mtok ? formatMicroPerMtok(BigInt(market.index_micro_per_mtok)) : "no index"}
          </span>
          {market.open ? "" : ", paused"}
        </span>
      ))}
      {status ? (
        <span>
          {status.venue.fills_24h} fills and {formatMtok(BigInt(status.venue.volume_24h_tokens))} MTok in 24 h
        </span>
      ) : null}
      {status ? <span>{status.venue.open_asks} open asks</span> : null}
      {status ? (
        <span>
          Payouts {status.payouts.pending} pending, {status.payouts.executed} paid
        </span>
      ) : null}
    </div>
  );
}
