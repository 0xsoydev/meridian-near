"use client";

import { useState } from "react";
import { Skeleton, Toggle } from "../../../components/kit";
import { percent } from "../../../lib/client";
import { clockFormat, formatMicroPerMtok, formatMtok } from "../../../lib/price";
import type { Book } from "../../../lib/types";

const LEVELS = 12;

type Level = { price: bigint; size: bigint; total: bigint };

function ladder(entries: ReadonlyArray<{ price: bigint; size: bigint }>, side: "ask" | "bid"): Level[] {
  const merged = new Map<bigint, bigint>();
  for (const entry of entries) merged.set(entry.price, (merged.get(entry.price) ?? 0n) + entry.size);
  const sorted = [...merged].sort(([a], [b]) => (a === b ? 0 : (a < b) === (side === "ask") ? -1 : 1)).slice(0, LEVELS);
  let total = 0n;
  return sorted.map(([price, size]) => {
    total += size;
    return { price, size, total };
  });
}

function Columns({ labels }: { labels: readonly [string, string, string] }) {
  return (
    <div className="grid h-7 shrink-0 grid-cols-3 items-center px-4 text-[12px] text-muted">
      <span>{labels[0]}</span>
      <span className="text-right">{labels[1]}</span>
      <span className="text-right">{labels[2]}</span>
    </div>
  );
}

function Row({ level, side, deepest, onPrice }: { level: Level; side: "ask" | "bid"; deepest: bigint; onPrice: (price: bigint) => void }) {
  const width = deepest === 0n ? 0 : Number((level.total * 1000n) / deepest) / 10;
  const price = formatMicroPerMtok(level.price);
  return (
    <button
      type="button"
      onClick={() => onPrice(level.price)}
      className="relative grid h-6 w-full shrink-0 grid-cols-3 items-center px-4 text-[12px] tabular-nums transition-colors duration-150 ease-brand hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <span className="sr-only">Use as the limit price: </span>
      <span
        aria-hidden
        className={`absolute inset-y-px left-0 ${side === "ask" ? "bg-down-tint/12" : "bg-up-tint/12"}`}
        style={{ width: `${width}%` }}
      />
      <span className={`relative text-left ${side === "ask" ? "text-down" : "text-up"}`}>{price}</span>
      <span className="relative text-right text-ink">{formatMtok(level.size)}</span>
      <span className="relative text-right text-ink">{formatMtok(level.total)}</span>
    </button>
  );
}

function Missing({ children }: { children: string }) {
  return <p className="flex h-6 shrink-0 items-center px-4 text-[12px] text-muted">{children}</p>;
}

export function OrderBook({ book, onPrice }: { book: Book | null; onPrice: (price: bigint) => void }) {
  const [view, setView] = useState<"book" | "trades">("book");
  const asks = ladder(
    (book?.asks ?? []).map((ask) => ({ price: BigInt(ask.price_micro_per_mtok), size: BigInt(ask.tokens_left) })),
    "ask",
  );
  const bids = ladder((book?.bids ?? []).map((bid) => ({ price: BigInt(bid.price_micro_per_mtok), size: BigInt(bid.tokens) })), "bid");
  const askDepth = asks.at(-1)?.total ?? 0n;
  const bidDepth = bids.at(-1)?.total ?? 0n;
  const deepest = askDepth > bidDepth ? askDepth : bidDepth;
  const bestAsk = asks[0]?.price ?? null;
  const bestBid = bids[0]?.price ?? null;
  const spread = bestAsk !== null && bestBid !== null ? bestAsk - bestBid : null;
  const fills = book?.fills ?? [];

  return (
    <section aria-label="Order book" className="flex h-full min-h-0 flex-col">
      <div className="flex h-10 shrink-0 items-center border-b border-line px-4">
        <Toggle
          label="Book view"
          value={view}
          onChange={setView}
          items={[
            { value: "book", label: "Order book" },
            { value: "trades", label: "Trades" },
          ]}
        />
      </div>
      {book === null ? (
        <div className="flex flex-col gap-2 p-4">
          {Array.from({ length: 10 }, (_, index) => (
            <Skeleton key={index} className="h-4" />
          ))}
        </div>
      ) : view === "book" ? (
        <>
          <Columns labels={["Price", "Size (MTok)", "Total (MTok)"]} />
          <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden">
            {asks.length === 0 ? (
              <Missing>No asks</Missing>
            ) : (
              asks
                .toReversed()
                .map((level) => <Row key={`ask-${level.price}`} level={level} side="ask" deepest={deepest} onPrice={onPrice} />)
            )}
          </div>
          <div className="grid h-7 shrink-0 grid-cols-3 items-center border-y border-line px-4 text-[12px] tabular-nums">
            <span className="text-muted">Spread</span>
            <span className="text-right text-ink">{spread === null ? "None" : formatMicroPerMtok(spread)}</span>
            <span className="text-right text-ink">{spread === null || bestAsk === null ? "" : percent(spread, bestAsk)}</span>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {bids.length === 0 ? (
              <Missing>No bids</Missing>
            ) : (
              bids.map((level) => <Row key={`bid-${level.price}`} level={level} side="bid" deepest={deepest} onPrice={onPrice} />)
            )}
          </div>
        </>
      ) : (
        <>
          <Columns labels={["Price", "Size (MTok)", "Time (UTC)"]} />
          {fills.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12px] text-muted">No trades yet.</p>
          ) : (
            <ol
              tabIndex={0}
              aria-label="Recent trades"
              className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
            >
              {fills.map((fill, index) => {
                const price = BigInt(fill.price_micro_per_mtok);
                const older = fills[index + 1];
                const before = older ? BigInt(older.price_micro_per_mtok) : price;
                const tone = price > before ? "text-up" : price < before ? "text-down" : "text-ink";
                return (
                  <li
                    key={`${fill.listing_id}-${fill.created_at}-${index}`}
                    className="grid h-6 grid-cols-3 items-center px-4 text-[12px] tabular-nums"
                  >
                    <span className={tone}>{formatMicroPerMtok(price)}</span>
                    <span className="text-right text-ink">{formatMtok(BigInt(fill.tokens))}</span>
                    <span className="text-right text-muted">{clockFormat.format(new Date(fill.created_at))}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
