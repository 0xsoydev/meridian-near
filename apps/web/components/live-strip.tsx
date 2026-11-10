"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ago, api, usd } from "../lib/client";
import { formatMtok } from "../lib/price";
import type { VenueStatus } from "../lib/types";
import { statusSchema } from "../lib/wire";

const POLL_MS = 30_000;
const STALE_S = 600;

export function LiveStrip() {
  const pathname = usePathname();
  const [status, setStatus] = useState<VenueStatus | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      void api("/api/v1/status", statusSchema).then((result) => {
        if (!alive) return;
        setStatus(result.ok ? result.data : null);
        setDown(!result.ok);
      });
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const lastPost = status?.keeper_last_post_s ?? null;
  const keeperUp = lastPost !== null && lastPost <= STALE_S;
  const exchange = pathname.startsWith("/trade") || pathname.startsWith("/perps");

  return (
    <aside
      aria-label="Venue status"
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white px-4 lg:block lg:px-6 ${exchange ? "hidden" : "block"}`}
    >
      <div className="flex h-9 items-center gap-x-6 overflow-hidden whitespace-nowrap text-[12px] tabular-nums text-muted">
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
          <span key={market.model} className={market.open ? "" : "hidden lg:inline"}>
            {market.model}{" "}
            <span className={market.open ? "text-ink" : ""}>
              {market.index_micro_per_mtok ? usd(BigInt(market.index_micro_per_mtok)) : "no index"}
            </span>
            {market.open ? "" : ", paused"}
          </span>
        ))}
        {status ? (
          <span className="hidden lg:inline">
            {status.venue.fills_24h} fills and {formatMtok(BigInt(status.venue.volume_24h_tokens))} MTok in 24 h
          </span>
        ) : null}
        {status ? <span className="hidden lg:inline">{status.venue.open_asks} open asks</span> : null}
        {status ? (
          <span className="hidden lg:inline">
            Payouts {status.payouts.pending} pending, {status.payouts.executed} paid
          </span>
        ) : null}
      </div>
    </aside>
  );
}
