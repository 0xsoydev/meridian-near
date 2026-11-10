"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api, usd } from "../../lib/client";
import { modelsSchema, statusSchema } from "../../lib/wire";
import { FOCUS } from "../kit";
import { CtaLink } from "./cta";
import { DEMO_HREF, DEMO_MODEL } from "./shared";

type Market = {
  model: string;
  list: bigint;
  ask: bigint | null;
  index: bigint | null;
  available: bigint;
};
type Venue = { markets: Market[] };
type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; venue: Venue };

const FRESH_MS = 30_000;
let cache: { at: number; promise: Promise<State> } | null = null;

function load(): Promise<State> {
  if (cache && Date.now() - cache.at < FRESH_MS) return cache.promise;
  const promise = Promise.all([api("/api/v1/models", modelsSchema), api("/api/v1/status", statusSchema)]).then(
    ([models, status]): State => {
      if (!models.ok) return { kind: "error", message: models.message };
      if (!status.ok) return { kind: "error", message: status.message };
      const perps = new Map(status.data.markets.map((market) => [market.model, market.index_micro_per_mtok]));
      const markets = models.data.data
        .map((row) => {
          const index = perps.get(row.id) ?? row.index_micro_per_mtok;
          return {
            model: row.id,
            list: BigInt(row.reference_blended_micro_per_mtok),
            ask: row.best_ask_micro_per_mtok === null ? null : BigInt(row.best_ask_micro_per_mtok),
            index: index === null ? null : BigInt(index),
            available: BigInt(row.available_tokens),
          };
        })
        .filter((market) => market.ask !== null || market.index !== null)
        .sort((a, b) => (b.available > a.available ? 1 : b.available < a.available ? -1 : a.model.localeCompare(b.model)));
      return {
        kind: "ready",
        venue: { markets },
      };
    },
  );
  cache = { at: Date.now(), promise };
  return promise;
}

function useVenue() {
  const [state, setState] = useState<State>({ kind: "loading" });
  useEffect(() => {
    let alive = true;
    void load().then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, []);
  return {
    state,
    retry() {
      cache = null;
      setState({ kind: "loading" });
      void load().then(setState);
    },
  };
}

function under(list: bigint, price: bigint): number {
  return list > 0n && price < list ? Number(((list - price) * 100n) / list) : 0;
}

export function useTradeHref(): string {
  const { state } = useVenue();
  if (state.kind !== "ready") return DEMO_HREF;
  const { markets } = state.venue;
  if (markets.some((market) => market.model === DEMO_MODEL && market.ask !== null)) return DEMO_HREF;
  const live = markets.find((market) => market.ask !== null);
  return live ? `/trade?model=${encodeURIComponent(live.model)}` : DEMO_HREF;
}

export function TradeCta({ className = "" }: { className?: string }) {
  return (
    <CtaLink href={useTradeHref()} className={className}>
      Enter the market
    </CtaLink>
  );
}

export function LiveLine({ className = "" }: { className?: string }) {
  const { state } = useVenue();
  const top = state.kind === "ready" ? state.venue.markets[0] : undefined;
  const price = top ? (top.ask ?? top.index) : null;
  const off = top && price !== null ? under(top.list, price) : 0;
  return (
    <p className={`min-h-6 text-[14px] leading-[22px] text-muted ${className}`}>
      {top && price !== null ? (
        <Link
          href={`/trade?model=${encodeURIComponent(top.model)}`}
          className={`inline-flex items-center gap-2 underline decoration-transparent underline-offset-[5px] transition-[text-decoration-color,color] duration-200 ease-brand hover:text-ink hover:decoration-accent lg:bg-white/90 lg:px-3 lg:py-1 ${FOCUS}`}
        >
          <span aria-hidden className="size-1.5 rounded-full bg-up" />
          <span>
            Live: <span className="text-ink">{top.model}</span> {top.ask !== null ? "asks" : "trades at"}{" "}
            <span className="tabular-nums text-ink">{usd(price)}</span> per MTok
            {off > 0 ? `, ${off}% under list` : ""}
          </span>
        </Link>
      ) : null}
    </p>
  );
}
