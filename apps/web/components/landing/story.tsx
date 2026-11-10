"use client";

import { LayoutGroup, MotionConfig, motion } from "motion/react";
import { useRef } from "react";
import { usd } from "../../lib/client";
import { charge, sellerEarning } from "../../lib/price";
import { NumberTicker } from "../ui/number-ticker";
import { Actor, Connector, PlayButton, Slot, Stage, Steps, Swatch, Tile, type TileKind, useSequence } from "./blueprint";
import { H2, LEDE, WRAP } from "./shared";

const MTOK = 1_000_000n;
const TAKE_BPS = 1000n;
const LIST = 400_000n;
const CAPACITY = 24;
const USED = 9;
const ROWS = [
  { price: 220_000n, ids: [18, 19, 20, 21, 22, 23] },
  { price: 200_000n, ids: [13, 14, 15, 16, 17] },
  { price: 180_000n, ids: [9, 10, 11, 12] },
] as const;
const BOUGHT_UNDER = 200_000n;
const BOUGHT = ROWS.filter((row) => row.price <= BOUGHT_UNDER).flatMap((row) => row.ids.map(() => row.price));
const SPENT = BOUGHT.reduce((sum, price) => sum + charge(MTOK, price), 0n);
const EARNED = sellerEarning(SPENT, TAKE_BPS);
const KEPT = SPENT - EARNED;
const COINS = 10;
const LEGEND: ReadonlyArray<readonly [TileKind, string]> = [
  ["used", "Used by the seller"],
  ["spare", "Spare"],
  ["listed", "On the book"],
  ["bought", "Bought"],
];
const HOLDS = [2200, 2600, 3000, 0] as const;

const STEPS = [
  { title: "A key with room to spare", body: "You already pay for an API key. Whatever you don't use sits idle.", frame: 0 },
  { title: "Listed under list price", body: "The spare goes on the book as MTokens, a million tokens each, at or under the provider's price.", frame: 1 },
  { title: "Agents buy the cheapest", body: "An agent's requests take the lowest asks first, paid in USDC from its owner's NEAR wallet.", frame: 2 },
  { title: "Sellers paid daily", body: "The seller gets 90% of every charge in a daily payout. Meridian keeps 10%.", frame: 3 },
];

type Place = "seller" | "agent" | bigint;

function rowOf(id: number) {
  return ROWS.find((row) => (row.ids as readonly number[]).includes(id));
}

function where(id: number, step: number): { place: Place; kind: TileKind } {
  if (id < USED) return { place: "seller", kind: "used" };
  if (step === 0) return { place: "seller", kind: "spare" };
  const row = rowOf(id);
  if (!row) return { place: "seller", kind: "spare" };
  if (step >= 2 && row.price <= BOUGHT_UNDER) return { place: "agent", kind: "bought" };
  return { place: row.price, kind: "listed" };
}

const dollars = (micro: bigint) => Number(micro) / 1e6;

export function Story() {
  const ref = useRef<HTMLDivElement>(null);
  const seq = useSequence(ref, HOLDS);
  const step = seq.step;

  const tile = (id: number, place: Place, order: number) => {
    const at = where(id, step);
    return at.place === place ? <Tile key={id} id={`story-${id}`} kind={at.kind} delay={order * 0.045} /> : <Slot key={id} />;
  };

  return (
    <section aria-labelledby="story-title" className="border-t border-line py-16 sm:py-24 lg:py-32">
      <div className={WRAP}>
        <div className="flex flex-col gap-5">
          <h2 id="story-title" className={H2}>
            From an idle key to a paid answer
          </h2>
          <p className={LEDE}>
            Sellers list what their API keys won&apos;t use. Agents buy it a million tokens at a time. Both sides settle in USDC on NEAR.
          </p>
        </div>

        <MotionConfig reducedMotion="user">
          <div ref={ref} className="mt-12 lg:mt-16">
            <Stage>
              <ul aria-label="Legend" className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 pr-24 pt-10 text-[12px] leading-[18px] text-muted sm:px-6 sm:pr-28 lg:px-8 lg:pt-8">
                {LEGEND.map(([kind, label]) => (
                  <li key={kind} className="flex items-center gap-2">
                    <Swatch kind={kind} />
                    {label}
                  </li>
                ))}
                <li className="text-ink">One tile is one MToken, a million tokens</li>
              </ul>
              <LayoutGroup id="story">
                <div
                  aria-hidden
                  className="grid px-4 pb-4 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_104px_minmax(0,1.12fr)_104px_minmax(0,1fr)] lg:px-8 lg:pb-8 lg:pt-6"
                >
                  <Actor title="Seller's key" meta="NEAR AI" logo="/images/rails/near.svg">
                    <div className="grid w-fit grid-cols-8 gap-1">
                      {Array.from({ length: CAPACITY }, (_, id) => tile(id, "seller", 0))}
                    </div>
                    <p className="text-[13px] leading-[18px] text-muted">
                      <span className="tabular-nums text-ink">{USED}</span> of {CAPACITY} MTok used this month
                    </p>
                  </Actor>

                  <Connector label="lists the spare" />

                  <Actor title="glm-5.3 asks" meta="per MTok">
                    <div className="flex flex-col gap-2.5">
                      <div className="flex items-center gap-2 text-[12px] leading-[16px] text-accent">
                        <span className="shrink-0 tabular-nums">List price {usd(LIST)}</span>
                        <span className="h-0 flex-1 border-t border-dashed border-accent/70" />
                      </div>
                      <div className="flex flex-col gap-2 pt-1">
                        {ROWS.map((row) => {
                          const listed = step >= 1;
                          const filled = step >= 2 && row.price <= BOUGHT_UNDER;
                          return (
                            <div key={row.price.toString()} className="flex items-center gap-3">
                              <span
                                className={`w-12 shrink-0 text-[13px] tabular-nums transition-[color,opacity] duration-500 ease-brand ${
                                  filled ? "text-muted line-through" : "text-ink"
                                } ${listed ? "opacity-100" : "opacity-0"}`}
                              >
                                {usd(row.price)}
                              </span>
                              <div className="flex gap-1">{row.ids.map((id, order) => tile(id, row.price, order))}</div>
                              <span
                                className={`ml-auto text-[12px] text-muted transition-opacity duration-500 ease-brand ${filled ? "opacity-100" : "opacity-0"}`}
                              >
                                filled
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </Actor>

                  <Connector label="buys the cheapest" />

                  <Actor title="Agent" meta="claude-code" logo="/images/rails/claudecode.svg">
                    <div className="flex flex-col gap-1.5">
                      <p className="truncate font-mono text-[12px] leading-[18px] text-muted">&gt; refactor the payout job</p>
                      {[92, 74, 56].map((width, index) => (
                        <motion.span
                          key={width}
                          className="block h-1.5 origin-left bg-ink/80"
                          style={{ width: `${width}%` }}
                          initial={false}
                          animate={{ scaleX: step >= 2 ? 1 : 0 }}
                          transition={{ duration: 0.7, delay: step >= 2 ? 0.5 + index * 0.35 : 0, ease: [0.22, 1, 0.36, 1] }}
                        />
                      ))}
                    </div>
                    <div className="flex items-end justify-between gap-3">
                      <div className="grid w-fit grid-cols-5 gap-1">
                        {ROWS.filter((row) => row.price <= BOUGHT_UNDER)
                          .flatMap((row) => row.ids as readonly number[])
                          .map((id, order) => tile(id, "agent", order))}
                      </div>
                      <p className="text-right text-[13px] leading-[18px] text-muted">
                        <NumberTicker value={step >= 2 ? BOUGHT.length : 0} decimals={0} prefix="" className="text-ink" /> MTok
                        <br />
                        <NumberTicker value={step >= 2 ? dollars(SPENT) : 0} className="text-ink" />
                      </p>
                    </div>
                  </Actor>
                </div>

                <Rail step={step} />
              </LayoutGroup>
            </Stage>

            <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start">
              <Steps items={STEPS} active={step} seq={seq} progress grid="grid-cols-2 lg:grid-cols-4" className="flex-1" />
              <PlayButton seq={seq} className="mt-4 self-start lg:mt-5" />
            </div>
          </div>
        </MotionConfig>
      </div>
    </section>
  );
}

const NODES = [
  { label: "Seller's wallet", note: "gets", amount: EARNED, from: 3 },
  { label: "Meridian", note: "keeps", amount: KEPT, from: 3 },
  { label: "Owner's wallet", note: "pays", amount: SPENT, from: 2 },
] as const;
const COIN_GAP = 13;

function coinAt(coin: number, step: number): { x: string; offset: number; shown: boolean } {
  if (step < 2) return { x: "100%", offset: (coin - 4.5) * COIN_GAP, shown: false };
  if (step === 2) return { x: "50%", offset: (coin - 4.5) * COIN_GAP, shown: true };
  return coin === 0 ? { x: "50%", offset: 0, shown: true } : { x: "0%", offset: (coin - 5) * COIN_GAP, shown: true };
}

function Rail({ step }: { step: number }) {
  return (
    <div aria-hidden className="overflow-x-clip border-t border-line px-4 pb-6 pt-5 sm:px-6 lg:px-8">
      <p className="text-[12px] leading-[18px] text-muted">USDC on NEAR</p>
      <div className="relative mx-[18%] mt-5 h-6 sm:mx-[14%] lg:mx-[16.5%]">
        <span className="absolute inset-x-0 top-1/2 border-t border-dashed border-accent/60" />
        {[0, 50, 100].map((left) => (
          <span
            key={left}
            className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 border border-accent bg-white"
            style={{ left: `${left}%` }}
          />
        ))}
        {Array.from({ length: COINS }, (_, coin) => {
          const at = coinAt(coin, step);
          return (
            <motion.span
              key={coin}
              className="absolute inset-0"
              initial={false}
              animate={{ x: at.x, opacity: at.shown ? 1 : 0 }}
              transition={{
                x: { duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: at.shown ? 0.25 + (COINS - coin) * 0.07 : 0 },
                opacity: { duration: 0.3, delay: at.shown ? (COINS - coin) * 0.07 : 0 },
              }}
            >
              <motion.span
                className="absolute top-1/2 -ml-[5px] size-2.5 -translate-y-1/2 rounded-full bg-accent ring-2 ring-white"
                initial={false}
                animate={{ x: at.offset }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.25 + (COINS - coin) * 0.07 }}
              />
            </motion.span>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        {NODES.map((node) => {
          const shown = step >= node.from;
          return (
            <p key={node.label} className="flex flex-col text-[12px] leading-[18px] text-muted sm:text-[13px]">
              <span className="text-ink">{node.label}</span>
              <span className={`transition-opacity duration-500 ease-brand ${shown ? "opacity-100" : "opacity-0"}`}>
                {node.note} <NumberTicker value={shown ? dollars(node.amount) : 0} className="text-ink" />
              </span>
            </p>
          );
        })}
      </div>
    </div>
  );
}
