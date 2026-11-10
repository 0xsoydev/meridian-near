"use client";

import { RotateCcw } from "lucide-react";
import { LayoutGroup, motion, useInView, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { FOCUS, LINK } from "../kit";

const EASE = [0.22, 1, 0.36, 1] as const;
const HATCH = "repeating-linear-gradient(135deg, var(--color-line) 0 1px, transparent 1px 7px)";
const ASKS = [
  { price: "0.1840", size: "25" },
  { price: "0.1990", size: "60" },
  { price: "0.2150", size: "40" },
];
const BEATS = [700, 1700, 2700];

export function ExpiringCredit() {
  const figure = useRef<HTMLDivElement>(null);
  const seen = useInView(figure, { once: true, amount: 0.5 });
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState(0);
  const timers = useRef<number[]>([]);

  const play = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    setPhase(0);
    timers.current = BEATS.map((at, index) => window.setTimeout(() => setPhase(index + 1), at));
  }, []);

  useEffect(() => {
    if (reduced) setPhase(3);
    else if (seen) play();
    return () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    };
  }, [seen, reduced, play]);

  const listed = phase >= 2;

  return (
    <section className="grid gap-12 border-t border-line px-6 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20 lg:px-12 lg:py-28">
      <div className="flex flex-col items-start gap-6 lg:pt-4">
        <h2 className="max-w-[14ch] text-balance font-serif text-[40px] leading-[1.04] tracking-[-0.01em] text-ink lg:text-[60px]">
          Credit you won&apos;t use gets a price.
        </h2>
        <p className="max-w-[46ch] text-pretty text-[17px] leading-[27px] text-ink">
          Provider plans reset every month, and what you didn&apos;t use is gone. List the rest on Meridian below the provider&apos;s list price. Agents
          buy it through the router, and your key stays sealed: only their requests ever run on it.
        </p>
        <Link href="/sell" className={`${LINK} flex h-11 items-center text-[16px] text-ink`}>
          Sell spare capacity
        </Link>
      </div>

      <figure ref={figure} className="flex flex-col border border-line bg-white p-5 sm:p-8">
        <figcaption className="sr-only">
          A plan of 100 MTok with 58 used and 42 left before it resets. The 42 MTok are listed at $0.18 per MTok, 55% under the list price, and become
          the cheapest ask in the glm-5.3 book.
        </figcaption>
        <LayoutGroup>
          <div aria-hidden className="flex flex-col">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-[13px]">
              <span className="text-ink">Your OpenRouter plan, 100 MTok a month</span>
              <span className="tabular-nums text-muted">Resets in 6 days</span>
            </div>
            <div className="relative mt-3 flex h-12">
              <div className="h-full w-[58%] bg-ink" />
              <div className="relative h-full w-[42%] border border-l-0 border-line" style={{ backgroundImage: HATCH }}>
                {listed ? (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.3 }}
                    className="absolute inset-0 flex items-center justify-center bg-white/70 text-[12px] text-muted"
                  >
                    Listed on Meridian
                  </motion.span>
                ) : (
                  <motion.div
                    layoutId="ask"
                    transition={{ duration: 0.9, ease: EASE }}
                    className={`absolute -inset-px border transition-colors duration-300 ${phase >= 1 ? "border-accent bg-accent/10" : "border-transparent"}`}
                  />
                )}
              </div>
              <motion.span
                className="absolute -bottom-3 -top-3 left-[58%] w-0.5 -translate-x-1/2 origin-top bg-accent"
                initial={{ scaleY: 0 }}
                animate={{ scaleY: phase >= 1 ? 1 : 0 }}
                transition={{ duration: 0.6, ease: EASE }}
              />
            </div>
            <div className="mt-3 flex justify-between gap-4 text-[12px] tabular-nums">
              <span className="text-ink">58 MTok used</span>
              <span className={phase >= 1 ? "text-accent" : "text-muted"}>42 MTok left over</span>
            </div>

            <div className="mt-10 border border-line">
              <div className="flex h-10 items-center justify-between border-b border-line px-4 text-[12px] text-muted">
                <span>glm-5.3 asks</span>
                <span>USD per MTok</span>
              </div>
              <div className="flex h-9 items-center justify-between border-b border-dashed border-line px-4 text-[12px] tabular-nums text-muted">
                <span>List price, the ceiling</span>
                <span>0.4024</span>
              </div>
              <ol className="flex flex-col">
                {listed ? (
                  <motion.li
                    layoutId="ask"
                    transition={{ duration: 0.9, ease: EASE }}
                    className="flex h-11 items-center justify-between gap-4 border border-accent bg-accent/10 px-4 text-[14px] tabular-nums"
                  >
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: phase >= 3 ? 1 : 0 }} className="flex items-baseline gap-3">
                      <span className="text-ink">0.1800</span>
                      <span className="text-[12px] text-accent">Yours, fills first</span>
                    </motion.span>
                    <motion.span initial={{ opacity: 0 }} animate={{ opacity: phase >= 3 ? 1 : 0 }} className="text-ink">
                      42 MTok
                    </motion.span>
                  </motion.li>
                ) : null}
                {ASKS.map((ask) => (
                  <motion.li
                    layout
                    transition={{ duration: 0.9, ease: EASE }}
                    key={ask.price}
                    className="flex h-11 items-center justify-between border-t border-line px-4 text-[14px] tabular-nums text-ink first:border-t-0"
                  >
                    <span>{ask.price}</span>
                    <span>{ask.size} MTok</span>
                  </motion.li>
                ))}
              </ol>
            </div>
          </div>
        </LayoutGroup>
        <div className="mt-5 flex min-h-10 items-center justify-between gap-4">
          <motion.p
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 3 ? 1 : 0 }}
            className="text-[13px] leading-[20px] text-ink"
          >
            55% under list. The lowest ask fills first.
          </motion.p>
          {phase >= 3 && !reduced ? (
            <button
              type="button"
              onClick={play}
              className={`flex h-10 shrink-0 items-center gap-1.5 text-[13px] text-muted transition-colors duration-150 ease-brand hover:text-ink ${FOCUS}`}
            >
              <RotateCcw aria-hidden className="size-3.5" />
              Play again
            </button>
          ) : null}
        </div>
      </figure>
    </section>
  );
}
