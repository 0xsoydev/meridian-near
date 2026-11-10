"use client";

import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRef } from "react";
import { usd } from "../../lib/client";
import { charge, sellerEarning } from "../../lib/price";
import { LINK } from "../kit";
import { NumberTicker } from "../ui/number-ticker";
import { Actor, PlayButton, Stage, Steps, useSequence } from "./blueprint";
import { H2, LEDE, WRAP } from "./shared";

const EASE = [0.22, 1, 0.36, 1] as const;
const MTOK = 1_000_000n;
const LIST = 400_000n;
const UNDERCUT = 170_000n;
const IDLE = 42;
const BOUGHT = 12;
const EARNED = sellerEarning(charge(BigInt(BOUGHT) * MTOK, UNDERCUT), 1000n);
const ASKS = [
  { id: "a1", price: 180_000n, size: 4 },
  { id: "a2", price: 200_000n, size: 5 },
  { id: "a3", price: 220_000n, size: 6 },
] as const;
const AHEAD = ASKS.reduce((sum, ask) => sum + ask.size, 0);
const HOLDS = [2400, 2600, 0] as const;
const PLACES = ["1st", "2nd", "3rd", "4th"];

const STEPS = [
  { title: "Start at the ceiling", frame: 0 },
  { title: "Undercut the book", frame: 1 },
  { title: "Fill first, get paid", frame: 2 },
];

const FACTS = [
  ["The list price is the ceiling", "Nothing sells above what the provider charges, so buyers always save."],
  ["Your key stays sealed", "Stored encrypted and opened only to serve a buyer's request."],
  ["Paid in USDC every day", "90% of every charge lands in your NEAR account. Meridian keeps 10%."],
] as const;

const dollars = (micro: bigint) => Number(micro) / 1e6;
const share = (micro: bigint) => `${(Number(micro) / Number(LIST)) * 100}%`;

export function Capacity() {
  const ref = useRef<HTMLDivElement>(null);
  const seq = useSequence(ref, HOLDS);
  const step = seq.step;
  const price = step >= 1 ? UNDERCUT : LIST;
  const first = step >= 1;
  const rows = [...ASKS.map((ask) => ({ ...ask, yours: false })), { id: "yours", price, size: IDLE, yours: true }].sort((a, b) =>
    a.price === b.price ? 0 : a.price < b.price ? -1 : 1,
  );

  return (
    <section aria-labelledby="capacity-title" className="border-t border-line bg-wash py-16 sm:py-24 lg:py-32">
      <div className={`${WRAP} grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16`}>
        <div className="flex flex-col gap-5">
          <h2 id="capacity-title" className={H2}>
            Capacity you won&apos;t use gets a price
          </h2>
          <p className={LEDE}>
            You set it, at or under the provider&apos;s list price. The lowest ask fills first, so your price decides your place in line.
          </p>
          <dl className="mt-6 flex flex-col gap-6">
            {FACTS.map(([term, detail]) => (
              <div key={term} className="flex flex-col gap-1">
                <dt className="text-[16px] leading-[24px] text-ink">{term}</dt>
                <dd className="max-w-[46ch] text-pretty text-[15px] leading-[23px] text-muted">{detail}</dd>
              </div>
            ))}
          </dl>
          <Link href="/sell" className={`${LINK} mt-4 w-fit text-[16px] text-ink`}>
            Sell spare capacity
          </Link>
        </div>

        <MotionConfig reducedMotion="user">
          <div ref={ref} className="flex min-w-0 flex-col">
            <p className="sr-only">
              A Command Code key with {IDLE} idle MTok of glm-5.3. Listed at the $0.40 list price it is fourth in line behind {AHEAD} MTok of
              cheaper asks. Priced at $0.17 it moves to the front, agents buy {BOUGHT} MTok, and the seller earns {usd(EARNED)} after the 10% fee.
            </p>
            <Stage className="flex flex-col gap-4 px-4 pb-6 pt-10 sm:px-6 lg:px-8 lg:pb-8 lg:pt-12">
              <div aria-hidden className="flex flex-col gap-4">
                <Actor title="Your Command Code key" meta="glm-5.3" logo="/images/rails/commandcode.svg">
                  <div className="flex items-end justify-between gap-4">
                    <p className="flex flex-col gap-0.5 text-[13px] leading-[18px] text-muted">
                      Price per MTok
                      <NumberTicker value={dollars(price)} className="text-[28px] leading-[34px] text-ink" />
                    </p>
                    <p className="pb-1 text-right text-[13px] leading-[18px] text-muted">
                      <span className="tabular-nums text-ink">{IDLE} MTok</span> idle
                    </p>
                  </div>
                  <PriceRail price={price} />
                </Actor>

                <Actor title="glm-5.3 asks" meta="lowest fills first">
                  <ol className="flex flex-col">
                    {rows.map((row, place) => (
                      <motion.li
                        key={row.id}
                        layout
                        transition={{ layout: { duration: 0.9, ease: EASE } }}
                        className={`relative -mt-px grid h-11 grid-cols-[64px_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden border px-3 text-[13px] tabular-nums first:mt-0 ${
                          row.yours ? "z-10 border-accent bg-accent/10" : "border-line bg-white"
                        }`}
                      >
                        <span className="text-ink">{usd(row.price)}</span>
                        <span className={`truncate ${row.yours ? "text-accent" : "text-muted"}`}>
                          {row.yours ? `Yours, ${PLACES[place]} in line` : "Another seller"}
                        </span>
                        <span className="text-right text-ink">
                          {row.yours && step >= 2 ? `${BOUGHT} of ${row.size} MTok bought` : `${row.size} MTok`}
                        </span>
                        {row.yours ? (
                          <motion.span
                            className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent"
                            initial={false}
                            animate={{ scaleX: step >= 2 ? BOUGHT / IDLE : 0 }}
                            transition={{ duration: 1.1, ease: EASE, delay: step >= 2 ? 0.3 : 0 }}
                          />
                        ) : null}
                      </motion.li>
                    ))}
                  </ol>
                  <dl className="grid grid-cols-3 gap-3 border-t border-line pt-4 text-[13px] leading-[18px]">
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted">Place in line</dt>
                      <dd className="tabular-nums text-ink">{first ? "1st" : "4th"} of 4</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted">Ahead of you</dt>
                      <dd className="tabular-nums text-ink">{first ? 0 : AHEAD} MTok</dd>
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted">You earn</dt>
                      <dd className="text-ink">
                        <NumberTicker value={step >= 2 ? dollars(EARNED) : 0} />
                        <span className="hidden text-muted sm:inline"> after the fee</span>
                      </dd>
                    </div>
                  </dl>
                </Actor>
              </div>
            </Stage>

            <div className="mt-2 flex flex-col gap-4 xl:flex-row xl:items-start">
              <Steps items={STEPS} active={step} seq={seq} progress grid="grid-cols-1 sm:grid-cols-3" className="flex-1" />
              <PlayButton seq={seq} className="self-start xl:mt-4" />
            </div>
          </div>
        </MotionConfig>
      </div>
    </section>
  );
}

function PriceRail({ price }: { price: bigint }) {
  const low = ASKS[0].price;
  const high = ASKS[ASKS.length - 1]?.price ?? low;
  return (
    <div className="flex flex-col gap-1.5 pt-6">
      <div className="-mx-2 overflow-x-clip px-2">
      <div className="relative h-6">
        <span className="absolute inset-x-0 top-1/2 border-t border-line" />
        <span className="absolute right-0 top-0 h-6 border-r border-dashed border-accent" />
        {ASKS.map((ask) => (
          <span key={ask.id} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-control" style={{ left: share(ask.price) }} />
        ))}
        <motion.span className="absolute inset-0" initial={false} animate={{ x: share(price) }} transition={{ duration: 1.1, ease: EASE }}>
          <span className="absolute left-0 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 border border-accent bg-accent" />
        </motion.span>
      </div>
      </div>
      <div className="relative h-4 text-[12px] leading-4 tabular-nums text-muted">
        <span className="absolute left-0">$0</span>
        <span className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: share((low + high) / 2n) }}>
          3 asks, {usd(low)} to {usd(high)}
        </span>
        <span className="absolute right-0 whitespace-nowrap text-accent">List {usd(LIST)}</span>
      </div>
    </div>
  );
}
