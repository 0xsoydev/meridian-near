"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ago, api, railName, usd } from "../../lib/client";
import { formatMtok } from "../../lib/price";
import { modelsSchema, statusSchema } from "../../lib/wire";
import { FOCUS, LINK, ROW, SECONDARY, Skeleton, TD, TH } from "../kit";
import { CtaLink } from "./cta";
import { DEMO_HREF, DEMO_MODEL, H2, LEDE, WRAP } from "./shared";

type Market = {
  model: string;
  rails: string[];
  tee: boolean;
  list: bigint;
  ask: bigint | null;
  index: bigint | null;
  available: bigint;
};
type Venue = { markets: Market[]; fills: number; volume: bigint; asks: number; keeperAge: number | null };
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
            rails: row.rails.filter((rail) => rail !== "stub"),
            tee: row.verifiability === "tee",
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
        venue: {
          markets,
          fills: status.data.venue.fills_24h,
          volume: BigInt(status.data.venue.volume_24h_tokens),
          asks: status.data.venue.open_asks,
          keeperAge: status.data.keeper_last_post_s,
        },
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

const COLUMNS = [
  { label: "Model", className: "text-left" },
  { label: "Rails", className: "hidden text-left lg:table-cell" },
  { label: "List price", className: "hidden text-right sm:table-cell" },
  { label: "Best ask", className: "text-right" },
  { label: "Index", className: "hidden text-right md:table-cell" },
  { label: "Under list", className: "text-right" },
  { label: "Available", className: "hidden text-right md:table-cell" },
] as const;

export function Markets() {
  const { state, retry } = useVenue();
  const venue = state.kind === "ready" ? state.venue : null;

  return (
    <section aria-labelledby="markets-title" className="border-t border-line bg-wash py-16 lg:py-24">
      <div className={WRAP}>
        <div className="flex flex-col gap-5">
          <h2 id="markets-title" className={H2}>
            The book right now
          </h2>
          <p className={LEDE}>Live asks and index prices on this venue, next to what each model costs at list price.</p>
        </div>

        <div className="mt-12 overflow-x-auto border border-line bg-white px-2 lg:mt-16 lg:px-4" aria-live="polite" aria-busy={state.kind === "loading"}>
          {state.kind === "error" ? (
            <div className="flex flex-col items-start gap-4 py-10 text-[14px] text-muted">
              <p>{state.message}</p>
              <button type="button" onClick={retry} className={SECONDARY}>
                Retry
              </button>
            </div>
          ) : venue && venue.markets.length === 0 ? (
            <div className="flex flex-col items-start gap-4 py-10 text-[14px] text-muted">
              <p className="max-w-[48ch] text-pretty">No open asks yet. The first seller to list spare capacity sets the price.</p>
              <Link href="/sell" className={SECONDARY}>
                List capacity
              </Link>
            </div>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  {COLUMNS.map((column) => (
                    <th key={column.label} scope="col" className={`${TH} ${column.className}`}>
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {venue
                  ? venue.markets.slice(0, 6).map((market) => {
                      const price = market.ask ?? market.index;
                      const off = price !== null ? under(market.list, price) : 0;
                      return (
                        <tr key={market.model} className={ROW}>
                          <td className={TD}>
                            <span className="flex items-center gap-2">
                              <Link href={`/trade?model=${encodeURIComponent(market.model)}`} className={LINK}>
                                {market.model}
                              </Link>
                              {market.tee ? (
                                <span title="Answers carry NEAR AI TEE signatures" className="border border-line px-1.5 text-[12px] leading-[18px] text-muted">
                                  TEE
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className={`${TD} hidden whitespace-normal text-muted lg:table-cell`}>{market.rails.map(railName).join(", ")}</td>
                          <td className={`${TD} hidden text-right text-muted sm:table-cell`}>{usd(market.list)}</td>
                          <td className={`${TD} text-right`}>{market.ask !== null ? usd(market.ask) : <span className="text-muted">none</span>}</td>
                          <td className={`${TD} hidden text-right md:table-cell`}>
                            {market.index !== null ? usd(market.index) : <span className="text-muted">none</span>}
                          </td>
                          <td className={`${TD} text-right`}>
                            <span className="inline-flex items-center justify-end gap-2.5">
                              <span aria-hidden className="relative hidden h-1 w-16 bg-hover sm:block">
                                <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${off}%` }} />
                              </span>
                              {off}%
                            </span>
                          </td>
                          <td className={`${TD} hidden text-right md:table-cell`}>{formatMtok(market.available)} MTok</td>
                        </tr>
                      );
                    })
                  : [0, 1, 2].map((row) => (
                      <tr key={row} className="border-t border-line">
                        {COLUMNS.map((column) => (
                          <td key={column.label} className={`${TD} ${column.className}`}>
                            <Skeleton className={`h-3 ${column.label === "Model" ? "w-28" : "ml-auto w-12"}`} />
                          </td>
                        ))}
                      </tr>
                    ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-5 flex flex-col gap-4 text-[13px] leading-[20px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="min-h-5 tabular-nums">
            {venue
              ? `${venue.fills} fills and ${formatMtok(venue.volume)} MTok in the last 24 h, ${venue.asks} open ${venue.asks === 1 ? "ask" : "asks"}${
                  venue.keeperAge !== null ? `. Index posted ${ago(venue.keeperAge)}` : ""
                }.`
              : null}
          </p>
          <Link href="/trade" className={`${LINK} w-fit text-[14px] text-ink`}>
            Open the trading desk
          </Link>
        </div>
      </div>
    </section>
  );
}
