"use client";

import { AnimatePresence, motion } from "motion/react";
import { type KeyboardEvent, useRef, useState } from "react";
import { CommitLink, FOCUS } from "../kit";

const EASE = [0.22, 1, 0.36, 1] as const;
const WAYS = [
  {
    id: "agents",
    label: "Run agents",
    title: "Give an agent a key, not your wallet",
    body: "Ask for a key from the terminal, approve its daily limit on your phone, and point the agent at Meridian. It pays per request in USDC.",
    href: "/agents",
    cta: "Connect an agent",
    shot: "/images/landing/agents.webp",
    path: "/agents",
  },
  {
    id: "sell",
    label: "Sell capacity",
    title: "List the plan you won't finish",
    body: "Pick a provider and a model, price it under list, and set how much to sell. Earnings land in your NEAR account once a day.",
    href: "/sell",
    cta: "Sell spare capacity",
    shot: "/images/landing/sell.webp",
    path: "/sell",
  },
  {
    id: "trade",
    label: "Trade the price",
    title: "Go long or short on inference",
    body: "Buy MTokens at today's price to use later, or trade perps on the index with up to 5x leverage. Margin comes from your wallet.",
    href: "/perps",
    cta: "Open perps",
    shot: "/images/landing/perps.webp",
    path: "/perps",
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
    <section className="border-t border-line px-6 py-20 lg:px-12 lg:py-28">
      <h2 className="font-serif text-[40px] leading-[1.04] tracking-[-0.01em] text-ink lg:text-[60px]">Three ways in.</h2>
      <div role="tablist" aria-label="Ways to use Meridian" onKeyDown={onKey} className="mt-8 flex gap-x-5 overflow-x-auto whitespace-nowrap border-b border-line sm:gap-x-8">
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
            className={`flex h-12 shrink-0 items-center border-b-2 text-[15px] transition sm:text-[17px]-[color,border-color] duration-200 ease-brand ${FOCUS} ${
              active === index ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div id="way-panel" role="tabpanel" aria-labelledby={`way-${way.id}`} className="mt-12 grid gap-12 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-16">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={way.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="flex flex-col items-start gap-6 lg:pt-10"
          >
            <h3 className="max-w-[18ch] text-balance text-[26px] leading-[32px] text-ink">{way.title}</h3>
            <p className="max-w-[40ch] text-pretty text-[17px] leading-[27px] text-ink">{way.body}</p>
            <CommitLink href={way.href} className="mt-4">
              {way.cta}
            </CommitLink>
          </motion.div>
        </AnimatePresence>

        <div className="relative px-4 pb-10 sm:px-10 sm:pb-16">
          <img
            src="/images/panorama.webp"
            alt=""
            aria-hidden
            loading="lazy"
            width={2172}
            height={724}
            className="absolute inset-x-0 bottom-0 h-[72%] w-full object-cover object-[50%_60%] grayscale"
          />
          <div className="relative border border-line bg-white">
            <div aria-hidden className="flex h-9 items-center gap-3 border-b border-line px-3">
              <span className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-line" />
                <span className="size-2.5 rounded-full bg-line" />
                <span className="size-2.5 rounded-full bg-line" />
              </span>
              <span className="flex h-6 min-w-0 flex-1 items-center justify-center bg-hover px-3 text-[12px] text-muted sm:mx-auto sm:max-w-[320px]">
                meridian{way.path}
              </span>
            </div>
            <div className="relative aspect-[16/10] overflow-hidden bg-white">
              <AnimatePresence initial={false}>
                <motion.img
                  key={way.shot}
                  src={way.shot}
                  alt={`Meridian's ${way.path} page`}
                  width={1440}
                  height={900}
                  loading="lazy"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="absolute inset-0 size-full object-cover object-top"
                />
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
