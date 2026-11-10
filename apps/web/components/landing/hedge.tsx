"use client";

import { MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRef } from "react";
import { payoffLadder } from "../../lib/perp-math";
import { charge } from "../../lib/price";
import { LINK, Toggle } from "../kit";
import { NumberTicker } from "../ui/number-ticker";
import { Stage, useSequence } from "./blueprint";
import { H2, LEDE, WRAP } from "./shared";

const EASE = [0.22, 1, 0.36, 1] as const;
const SIZE = 10_000_000n;
const ENTRY = 180_000n;
const SCENARIOS = { falls: -2000n, rises: 2000n } as const;
type Scenario = keyof typeof SCENARIOS;
const ORDER: Scenario[] = ["falls", "rises"];
const HOLDS = [3200, 0] as const;

const W = 600;
const H = 240;
const TOP = 234_000;
const RANGE = 108_000;
const NOW = 300;
const END = 584;
const HISTORY = [128, 116, 124, 110, 118, 130, 122, 114, 123, 117, 120];
const WIGGLE = [0, 7, -4, 10, -3, 8, -6, 5, -2, 3, 0];

const y = (price: bigint | number) => 20 + ((TOP - Number(price)) / RANGE) * 200;
const position = (size: bigint) => ({ size, margin: 0n, entryPrice: ENTRY, fundingOwed: 0n });

function outcome(scenario: Scenario) {
  const move = SCENARIOS[scenario];
  const [short] = payoffLadder(position(-SIZE), ENTRY, [move]);
  const [long] = payoffLadder(position(SIZE), ENTRY, [move]);
  const price = short?.price ?? ENTRY;
  const spot = charge(SIZE, price);
  const shortPnl = short?.pnl ?? 0n;
  const longPnl = long?.pnl ?? 0n;
  return { price, spot, shortPnl, longPnl, seller: spot + shortPnl, buyer: -spot + longPnl };
}

function futurePoints(scenario: Scenario) {
  const end = y(outcome(scenario).price);
  const flip = scenario === "falls" ? 1 : -1;
  return WIGGLE.map((wiggle, index) => {
    const t = index / (WIGGLE.length - 1);
    return [NOW + t * (END - NOW), y(ENTRY) + t * (end - y(ENTRY)) + wiggle * flip] as const;
  });
}

const line = (points: ReadonlyArray<readonly [number, number]>) => points.map(([px, py], i) => `${i ? "L" : "M"}${px.toFixed(1)},${py.toFixed(1)}`).join(" ");
const HISTORY_PATH = line(HISTORY.map((py, index) => [(index / (HISTORY.length - 1)) * NOW, py] as const));
const dollars = (micro: bigint) => Number(micro) / 1e6;
const price3 = (micro: bigint | number) => `$${(Number(micro) / 1e6).toFixed(3)}`;

export function Hedge() {
  const ref = useRef<HTMLDivElement>(null);
  const seq = useSequence(ref, HOLDS);
  const scenario = ORDER[seq.step] ?? "falls";
  const result = outcome(scenario);
  const points = futurePoints(scenario);
  const entryY = y(ENTRY);
  const endY = points.at(-1)?.[1] ?? entryY;
  const area = `${line(points)} L${END},${entryY.toFixed(1)} L${NOW},${entryY.toFixed(1)} Z`;
  const move = result.price - ENTRY;

  return (
    <section aria-labelledby="hedge-title" className="border-t border-line bg-wash py-16 sm:py-24 lg:py-32">
      <div className={`${WRAP} grid gap-12 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-16`}>
        <div className="flex flex-col gap-5 lg:order-2">
          <h2 id="hedge-title" className={H2}>
            Lock in tomorrow&apos;s price
          </h2>
          <p className={LEDE}>Perps settle in USDC against the venue&apos;s index, up to 5x, with margin from your Meridian wallet.</p>
          <dl className="mt-6 flex flex-col gap-6">
            {[
              ["Sellers short", "A falling index pays the short, so tomorrow's revenue holds."],
              ["Buyers go long", "A rising index pays the long, so tomorrow's bill holds."],
            ].map(([term, detail]) => (
              <div key={term} className="flex flex-col gap-1">
                <dt className="text-[16px] leading-[24px] text-ink">{term}</dt>
                <dd className="max-w-[46ch] text-pretty text-[15px] leading-[23px] text-muted">{detail}</dd>
              </div>
            ))}
          </dl>
          <Link href="/perps" className={`${LINK} mt-4 w-fit text-[16px] text-ink`}>
            Open perps
          </Link>
        </div>

        <MotionConfig reducedMotion="user">
          <div ref={ref} className="flex min-w-0 flex-col gap-3 lg:order-1">
            <Stage className="px-4 pb-6 pt-10 sm:px-6 lg:px-8 lg:pb-8 lg:pt-12">
              <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
                <p className="text-[14px] leading-[20px] text-ink">glm-5.3 index, per MTok</p>
                <Toggle
                  label="Scenario"
                  value={scenario}
                  onChange={(next) => seq.go(ORDER.indexOf(next))}
                  items={[
                    { value: "falls", label: "Price falls", tone: "down" },
                    { value: "rises", label: "Price rises", tone: "up" },
                  ]}
                />
              </div>

              <div aria-hidden className="relative mt-4 h-[220px] sm:h-[240px]">
                <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible">
                  {[216_000, 180_000, 144_000].map((price) => (
                    <line key={price} x1={0} x2={W} y1={y(price)} y2={y(price)} className="stroke-line" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
                  ))}
                  <line x1={NOW} x2={NOW} y1={8} y2={H} className="stroke-control" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                  <path d={HISTORY_PATH} fill="none" className="stroke-ink" strokeWidth={1.5} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                  <motion.path
                    key={`area-${scenario}`}
                    d={area}
                    className="fill-accent/10"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 0.7, ease: EASE }}
                  />
                  <line x1={NOW} x2={END} y1={entryY} y2={entryY} className="stroke-accent" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                  <motion.path
                    key={`path-${scenario}`}
                    d={line(points)}
                    fill="none"
                    className="stroke-ink"
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1.1, ease: EASE }}
                  />
                  <motion.line
                    key={`gap-${scenario}`}
                    x1={END + 8}
                    x2={END + 8}
                    y1={entryY}
                    y2={endY}
                    className="stroke-accent"
                    strokeWidth={1.5}
                    vectorEffect="non-scaling-stroke"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.9, ease: EASE }}
                  />
                </svg>
                {[216_000, 180_000, 144_000].map((price) => (
                  <span
                    key={price}
                    className="absolute left-0 -translate-y-full pb-0.5 text-[12px] leading-4 tabular-nums text-muted"
                    style={{ top: `${(y(price) / H) * 100}%` }}
                  >
                    {price3(price)}
                  </span>
                ))}
                <span
                  className="absolute whitespace-nowrap pl-2 text-[12px] leading-4 text-accent"
                  style={{
                    left: `${(NOW / W) * 100}%`,
                    top: `${(entryY / H) * 100}%`,
                    transform: scenario === "falls" ? "translateY(-100%)" : "translateY(4px)",
                  }}
                >
                  Locked at {price3(ENTRY)}
                </span>
                <motion.span
                  key={`move-${scenario}`}
                  className={`absolute -translate-x-full whitespace-nowrap text-[12px] leading-4 tabular-nums ${move < 0n ? "pt-1.5 text-down" : "-translate-y-full pb-1.5 text-up"}`}
                  style={{ left: `${((END + 10) / W) * 100}%`, top: `${(endY / H) * 100}%` }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 1, ease: EASE }}
                >
                  {move < 0n ? "−" : "+"}
                  {price3(move < 0n ? -move : move)}
                </motion.span>
                <span className="absolute bottom-0 translate-y-full pt-1 text-[12px] leading-4 text-muted" style={{ left: 0 }}>
                  last 24 h
                </span>
                <span
                  className="absolute bottom-0 -translate-x-1/2 translate-y-full pt-1 text-[12px] leading-4 text-muted"
                  style={{ left: `${(NOW / W) * 100}%` }}
                >
                  position opened
                </span>
                <span className="absolute bottom-0 right-0 translate-y-full pt-1 text-[12px] leading-4 text-muted">tomorrow</span>
              </div>

              <div className="mt-12 grid gap-6 sm:grid-cols-2 sm:gap-8">
                <Ledger
                  title="Seller, short 10 MTok"
                  rows={[
                    ["Sells 10 MTok", dollars(result.spot)],
                    ["Short settles", dollars(result.shortPnl)],
                  ]}
                  net={dollars(result.seller)}
                />
                <Ledger
                  title="Buyer, long 10 MTok"
                  rows={[
                    ["Buys 10 MTok", -dollars(result.spot)],
                    ["Long settles", dollars(result.longPnl)],
                  ]}
                  net={dollars(result.buyer)}
                />
              </div>
            </Stage>
            <p className="text-[13px] leading-[20px] text-muted">Before the 0.1% trading fee and funding.</p>
          </div>
        </MotionConfig>
      </div>
    </section>
  );
}

function Ledger({ title, rows, net }: { title: string; rows: ReadonlyArray<readonly [string, number]>; net: number }) {
  return (
    <div className="flex flex-col text-[13px] leading-[20px]">
      <p className="pb-2 text-[14px] text-ink">{title}</p>
      {rows.map(([label, amount], index) => (
        <p key={label} className="flex h-9 items-center justify-between border-t border-line/80 text-muted">
          {label}
          <NumberTicker
            value={amount}
            signed
            className={index === 1 ? (amount < 0 ? "text-down" : "text-up") : "text-ink"}
          />
        </p>
      ))}
      <p className="flex h-10 items-center justify-between border-t border-ink text-ink">
        Net either way
        <NumberTicker value={net} signed className="text-[15px]" />
      </p>
    </div>
  );
}
