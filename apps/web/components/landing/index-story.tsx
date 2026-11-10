"use client";

import { RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { FOCUS } from "../kit";
import { EASE, usePlayOnce } from "./play";

const LOW = 0.1755;
const HIGH = 0.1945;
const ODD = 7;
const FILLS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0.1782, 4], [0.1801, 2], [0.1795, 6]],
  [[0.181, 3], [0.1798, 5]],
  [[0.1823, 2], [0.1806, 7], [0.1815, 3], [0.1829, 2]],
  [[0.1801, 6], [0.1794, 3]],
  [[0.1787, 4], [0.1779, 5], [0.1792, 2]],
  [[0.1771, 6], [0.1783, 3]],
  [[0.179, 3], [0.1802, 4], [0.1797, 2]],
  [[0.1812, 2], [0.1925, 1], [0.1808, 5]],
  [[0.1826, 4], [0.1834, 3]],
  [[0.1841, 2], [0.1829, 5], [0.1838, 3]],
  [[0.1852, 4], [0.1846, 2]],
  [[0.1849, 3], [0.1861, 5], [0.1855, 2]],
];
const VWAP = FILLS.map((fills) => fills.reduce((sum, [price, size]) => sum + price * size, 0) / fills.reduce((sum, [, size]) => sum + size, 0));
const INDEX = VWAP.map((_, bucket) => VWAP.slice(0, bucket + 1).reduce((sum, price) => sum + price, 0) / (bucket + 1));
const ENTRY = INDEX.at(-1) ?? 0;
const STEPS = ["Fills land in their minute", "Each minute gets one price", "The hour's average is the index", "Perps settle against it"];
const BEATS = [200, 1700, 2800, 4000];

export function IndexStory() {
  const { ref: figure, phase, play, reduced, done } = usePlayOnce(BEATS, 0.4);
  const plot = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = plot.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const narrow = width < 640;
  const height = narrow ? 300 : 360;
  const right = narrow ? 52 : 68;
  const top = 24;
  const bottom = 32;
  const span = (width - right) / FILLS.length;
  const x = (bucket: number) => span * (bucket + 0.5);
  const y = (price: number) => top + ((HIGH - price) / (HIGH - LOW)) * (height - top - bottom);
  const line = INDEX.map((price, bucket) => `${bucket === 0 ? "M" : "L"} ${x(bucket).toFixed(1)} ${y(price).toFixed(1)}`).join(" ");
  const grid = [0.18, 0.185, 0.19];

  return (
    <section className="border-t border-line px-6 py-20 lg:px-12 lg:py-24">
      <h2 className="max-w-[18ch] text-balance font-serif text-[40px] leading-[1.04] tracking-[-0.01em] text-ink lg:text-[60px]">
        One public price for inference.
      </h2>
      <p className="mt-6 max-w-[62ch] text-pretty text-[17px] leading-[27px] text-ink">
        Every fill lands in a one-minute bucket. The keeper averages the last hour of buckets and posts it on NEAR as the index, never above the list
        price and never more than 10% from its last post. Perps settle against it, so a seller can lock in what their capacity will earn.
      </p>

      <figure ref={figure} className="mt-12 border border-line bg-white p-5 sm:p-8">
        <figcaption className="sr-only">
          Twelve minutes of glm-5.3 fills. Each minute becomes one volume-weighted price, the running average of those prices is the index, and one odd
          trade at $0.1925 barely moves it. A seller shorts 40 MTok at the latest index, ${ENTRY.toFixed(4)}.
        </figcaption>
        <div ref={plot} aria-hidden className="relative w-full" style={{ height }}>
          {width > 0 ? (
            <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 overflow-visible">
              {grid.map((price) => (
                <g key={price}>
                  <line x1={0} x2={width - right} y1={y(price)} y2={y(price)} stroke="var(--color-line)" strokeDasharray="2 4" />
                  <text x={width - right + 10} y={y(price) + 4} fontSize={12} fill="var(--color-muted)" className="tabular-nums">
                    {price.toFixed(3)}
                  </text>
                </g>
              ))}
              {[0, 3, 6, 9].map((bucket) => (
                <text key={bucket} x={x(bucket)} y={height - 8} fontSize={12} textAnchor="middle" fill="var(--color-muted)" className="tabular-nums">
                  {`12:0${bucket}`}
                </text>
              ))}
              {FILLS.map((fills, bucket) =>
                fills.map(([price, size], position) => (
                  <motion.circle
                    key={`${bucket}-${position}`}
                    cx={x(bucket) + (position - (fills.length - 1) / 2) * Math.min(9, span / 5)}
                    r={2.5 + Math.sqrt(size) * (narrow ? 1.1 : 1.4)}
                    fill={bucket === ODD && price > 0.19 ? "var(--color-down)" : "var(--color-ink)"}
                    initial={false}
                    animate={{
                      cy: phase >= 1 ? y(price) : y(price) - 36,
                      opacity: phase === 0 ? 0 : phase === 1 || (bucket === ODD && price > 0.19) ? 0.9 : 0.4,
                    }}
                    transition={{ duration: 0.55, ease: EASE, delay: phase === 1 ? bucket * 0.07 + position * 0.03 : 0 }}
                  />
                )),
              )}
              {VWAP.map((price, bucket) => (
                <motion.line
                  key={bucket}
                  x1={x(bucket) - span * 0.3}
                  x2={x(bucket) + span * 0.3}
                  y1={y(price)}
                  y2={y(price)}
                  stroke="var(--color-ink)"
                  strokeWidth={3}
                  initial={false}
                  animate={{ opacity: phase >= 2 ? 1 : 0, pathLength: phase >= 2 ? 1 : 0 }}
                  transition={{ duration: 0.45, ease: EASE, delay: phase === 2 ? bucket * 0.05 : 0 }}
                />
              ))}
              <motion.text
                x={x(ODD) + 10}
                y={y(0.1925) + 4}
                fontSize={12}
                fill="var(--color-down)"
                initial={false}
                animate={{ opacity: phase >= 2 ? 1 : 0 }}
              >
                One odd trade
              </motion.text>
              <motion.text
                x={x(5)}
                y={y(VWAP[5] ?? 0) + 26}
                fontSize={12}
                textAnchor="middle"
                fill="var(--color-ink)"
                initial={false}
                animate={{ opacity: phase >= 2 ? 1 : 0 }}
              >
                Minute price
              </motion.text>
              <motion.text
                x={x(10)}
                y={y(INDEX[10] ?? 0) - 14}
                fontSize={12}
                textAnchor="middle"
                fill="var(--color-accent)"
                initial={false}
                animate={{ opacity: phase >= 3 ? 1 : 0 }}
              >
                Index
              </motion.text>
              <motion.path
                d={line}
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                initial={false}
                animate={{ pathLength: phase >= 3 ? 1 : 0, opacity: phase >= 3 ? 1 : 0 }}
                transition={{ duration: 1.1, ease: EASE }}
              />
              <motion.g initial={false} animate={{ opacity: phase >= 4 ? 1 : 0 }} transition={{ duration: 0.4 }}>
                <line x1={x(FILLS.length - 1)} x2={width - right} y1={y(ENTRY)} y2={y(ENTRY)} stroke="var(--color-down)" strokeWidth={1.5} strokeDasharray="5 4" />
                <rect x={x(FILLS.length - 1) - 5} y={y(ENTRY) - 5} width={10} height={10} fill="var(--color-down)" />
                <text x={width - right + 10} y={y(ENTRY) + 4} fontSize={12} fill="var(--color-down)" className="tabular-nums">
                  {ENTRY.toFixed(4)}
                </text>
              </motion.g>
            </svg>
          ) : null}
        </div>

        <div className="mt-6 flex flex-col gap-5 border-t border-line pt-5 lg:flex-row lg:items-start lg:justify-between">
          <ol aria-hidden className="grid flex-1 grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((label, index) => (
              <li
                key={label}
                className={`flex items-baseline gap-2.5 text-[14px] leading-[20px] transition-colors duration-300 ease-brand ${
                  phase >= index + 1 ? "text-ink" : "text-muted"
                }`}
              >
                <span className={`tabular-nums ${phase === index + 1 || (index === 3 && phase === 4) ? "text-accent" : ""}`}>{index + 1}</span>
                {label}
              </li>
            ))}
          </ol>
          {done && !reduced ? (
            <button
              type="button"
              onClick={play}
              className={`-my-2 flex h-10 shrink-0 items-center gap-1.5 self-start text-[13px] text-muted transition-colors duration-150 ease-brand hover:text-ink ${FOCUS}`}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Play again
            </button>
          ) : null}
        </div>
        <p aria-hidden className={`mt-4 text-[13px] leading-[20px] transition-opacity duration-300 ${phase >= 4 ? "text-down opacity-100" : "opacity-0"}`}>
          A seller shorts 40 MTok at {ENTRY.toFixed(4)}. If the index falls, the short gains what their listing loses.
        </p>
      </figure>
    </section>
  );
}
