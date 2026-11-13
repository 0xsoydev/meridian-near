"use client";

import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, useRef, useState } from "react";
import { FOCUS } from "../kit";
import { CtaLink } from "./cta";
import { H2, LEDE, WRAP } from "./shared";

const EASE = [0.22, 1, 0.36, 1] as const;
const WAYS = [
  {
    id: "agents",
    label: "Run agents",
    title: "See what each agent spends",
    body: "Every agent key shows today's spend against its daily limit on the Wallet page. Raise a limit or revoke a key in one step.",
    href: "/agents",
    cta: "Connect an agent",
    route: "/wallet",
    alt: "The Agents panel on the Wallet page: two agent keys, each with a $5.00 daily limit and what it spent today.",
  },
  {
    id: "sell",
    label: "Sell capacity",
    title: "List the key you won't use up",
    body: "Pick a provider and a model, price it under list, and see where your ask lands in the book. Earnings land in your NEAR account daily.",
    href: "/sell",
    cta: "Sell spare capacity",
    route: "/sell",
    alt: "The new listing form on the Sell page: a price of $0.17 per MTok placed first in the book.",
  },
  {
    id: "trade",
    label: "Trade the price",
    title: "Go long or short on inference",
    body: "Trade perps on the venue's index with up to 5x leverage. The ticket shows your position at every move before you sign.",
    href: "/perps",
    cta: "Open perps",
    route: "/perps",
    alt: "The Perps page: what a 10 MTok long is worth if the index moves 5 to 20%, beside the order ticket.",
  },
] as const;

export function WaysIn() {
  const [active, setActive] = useState(0);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const way = WAYS[active] ?? WAYS[0];

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    const move = moves[event.key];
    const next = move === undefined ? (event.key === "Home" ? 0 : event.key === "End" ? WAYS.length - 1 : null) : (active + move + WAYS.length) % WAYS.length;
    if (next === null) return;
    event.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  };

  return (
    <section aria-labelledby="ways-title" className="border-t border-line py-16 sm:py-24 lg:py-32">
      <div className={WRAP}>
        <div className="flex flex-col gap-5">
          <h2 id="ways-title" className={H2}>
            Three ways in
          </h2>
          <p className={LEDE}>Run agents, sell what your keys won&apos;t use, or trade the price itself. Each starts on its own page.</p>
        </div>

        <div
          role="tablist"
          aria-label="Ways to use Meridian"
          onKeyDown={onKey}
          className="mt-10 flex gap-x-6 overflow-x-auto whitespace-nowrap shadow-[inset_0_-1px_0_var(--color-line)] sm:gap-x-8 lg:mt-14"
        >
          {WAYS.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                tabs.current[index] = element;
              }}
              id={`way-${item.id}`}
              type="button"
              role="tab"
              aria-selected={active === index}
              aria-controls="way-panel"
              tabIndex={active === index ? 0 : -1}
              onClick={() => setActive(index)}
              className={`flex h-12 shrink-0 items-center border-b-2 text-[15px] transition-[color,border-color] duration-200 ease-brand sm:text-[17px] ${FOCUS} ${
                active === index ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div
          id="way-panel"
          role="tabpanel"
          aria-labelledby={`way-${way.id}`}
          className="mt-10 grid gap-10 lg:mt-14 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16"
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={way.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: EASE }}
              className="flex flex-col items-start gap-5 lg:pt-6"
            >
              <h3 className="max-w-[18ch] text-balance font-serif text-[30px] leading-[36px] text-ink">{way.title}</h3>
              <p className="max-w-[40ch] text-pretty text-[16px] leading-[25px] text-muted">{way.body}</p>
              <CtaLink href={way.href} className="mt-4">
                {way.cta}
              </CtaLink>
            </motion.div>
          </AnimatePresence>

          <figure className="min-w-0 border border-line bg-white">
            <figcaption className="flex h-10 items-center justify-between gap-4 border-b border-line px-4 text-[12px] text-muted">
              <span>Meridian</span>
              <span className="tabular-nums text-ink">{way.route}</span>
            </figcaption>
            <div className="relative aspect-[390/680] overflow-hidden bg-wash sm:aspect-[35/24]">
              <AnimatePresence initial={false}>
                <motion.picture
                  key={way.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="absolute inset-0"
                >
                  <source media="(max-width: 639px)" srcSet={`/images/landing/${way.id}-m.webp`} width={780} height={1360} />
                  <img
                    src={`/images/landing/${way.id}.webp`}
                    alt={way.alt}
                    width={1400}
                    height={960}
                    loading="eager"
                    fetchPriority="low"
                    className="size-full object-cover object-left-top"
                  />
                </motion.picture>
              </AnimatePresence>
            </div>
          </figure>
        </div>
      </div>
    </section>
  );
}
