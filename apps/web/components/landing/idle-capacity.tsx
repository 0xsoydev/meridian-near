"use client";

import { RotateCcw } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import Link from "next/link";
import { FOCUS, LINK } from "../kit";
import { EASE, usePlayOnce } from "./play";

const HATCH = "repeating-linear-gradient(135deg, var(--color-line) 0 1px, transparent 1px 7px)";
const ASKS = [
  { price: "0.1840", size: "25" },
  { price: "0.1990", size: "60" },
  { price: "0.2150", size: "40" },
];
const BEATS = [700, 1700, 2700];
const FACTS = [
  { title: "You set the price", body: "At or under the provider's list price. The lowest ask fills first." },
  { title: "Your key stays sealed", body: "Stored encrypted and opened only to serve a buyer's request." },
  { title: "Paid in USDC every day", body: "Earnings, minus the 10% venue fee, land in your NEAR account." },
];

export function IdleCapacity() {
  const { ref, phase, play, reduced, done } = usePlayOnce(BEATS, 0.5);
  const listed = phase >= 2;

  return (
    <section className="grid gap-12 border-t border-line px-6 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-20 lg:px-12 lg:py-24">
      <div className="flex flex-col items-start gap-6 lg:self-center">
        <h2 className="max-w-[15ch] text-balance font-serif text-[40px] leading-[1.04] tracking-[-0.01em] text-ink lg:text-[60px]">
          Capacity you won&apos;t use gets a price.
        </h2>
        <p className="max-w-[46ch] text-pretty text-[17px] leading-[27px] text-ink">
          Prepaid balances, startup credits, hackathon credits: most teams hold more model access than their own work uses. List the idle part on
          Meridian, under the provider&apos;s list price, and agents buy it through the router.
        </p>
        <dl className="mt-2 flex flex-col gap-4">
          {FACTS.map((fact) => (
            <div key={fact.title} className="flex flex-col gap-0.5">
              <dt className="text-[16px] leading-[24px] text-ink">{fact.title}</dt>
              <dd className="max-w-[44ch] text-[15px] leading-[23px] text-muted">{fact.body}</dd>
            </div>
          ))}
        </dl>
        <Link href="/sell" className={`${LINK} flex h-11 items-center text-[16px] text-ink`}>
          Sell spare capacity
        </Link>
      </div>

      <figure ref={ref} className="flex flex-col border border-line bg-white p-5 sm:p-8">
        <figcaption className="sr-only">
          An OpenRouter credit worth about 100 MTok of glm-5.3. Your own work uses 58 MTok, so 42 MTok sit idle. Listed at $0.18 per MTok, 55% under the
          list price, they become the cheapest ask in the glm-5.3 book.
        </figcaption>
        <LayoutGroup>
          <div aria-hidden className="flex flex-col">
            <p className="text-[13px] text-ink">Your OpenRouter credit, about 100 MTok of glm-5.3</p>
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
                initial={false}
                animate={{ scaleY: phase >= 1 ? 1 : 0 }}
                transition={{ duration: 0.6, ease: EASE }}
              />
            </div>
            <div className="mt-3 flex justify-between gap-4 text-[12px] tabular-nums">
              <span className="text-ink">58 MTok your work uses</span>
              <span className={phase >= 1 ? "text-accent" : "text-muted"}>42 MTok sitting idle</span>
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
          <motion.p aria-hidden initial={false} animate={{ opacity: phase >= 3 ? 1 : 0 }} className="text-[13px] leading-[20px] text-ink">
            55% under list. The lowest ask fills first.
          </motion.p>
          {done && !reduced ? (
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
