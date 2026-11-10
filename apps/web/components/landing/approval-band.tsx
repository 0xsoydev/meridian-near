"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useState } from "react";
import { AgentsTerminal } from "./agents-terminal";
import { EASE } from "./play";

const FEED = [
  { text: "Bought 0.1 MTok", detail: "glm-5.3-flash", amount: "-$0.0175" },
  { text: "1,400 tokens", detail: "paid from prepaid MTok", amount: "$0.00" },
  { text: "Sold 0.0986 MTok", detail: "back to the book", amount: "+$0.0133" },
];
const CORNERS = ["-left-[5px] -top-[5px] border-l border-t", "-right-[5px] -top-[5px] border-r border-t", "-bottom-[5px] -left-[5px] border-b border-l", "-bottom-[5px] -right-[5px] border-b border-r"];
const ROW = "flex items-baseline justify-between gap-3 text-[11px] leading-[15px]";

function Screen({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="mt-6 flex min-h-0 flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
}

function Phone({ step, lines }: { step: number; lines: number }) {
  const done = step === 0 ? 0 : step - 1 + (lines >= 3 ? 1 : 0);
  const screen = step > 0 ? "feed" : lines >= 4 ? "approved" : lines >= 2 ? "ask" : "home";
  const spent = done >= 1;

  return (
    <div aria-hidden className="relative mx-auto h-[500px] w-[260px] shrink-0 rounded-[40px] border-[9px] border-ink bg-white text-left text-ink lg:mx-0">
      <span className="absolute left-1/2 top-2 z-20 h-[18px] w-[72px] -translate-x-1/2 rounded-full bg-ink" />
      <div className="relative flex h-full flex-col overflow-hidden rounded-[31px] px-5 pb-5 pt-10">
        <img src="/images/namelogo.svg" alt="" width={80} height={18} className="h-[15px] w-auto self-start" />
        <AnimatePresence>
          {step === 0 && lines === 1 ? (
            <motion.div
              key="notice"
              initial={{ opacity: 0, y: -24 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: EASE }}
              className="absolute inset-x-3 top-9 z-10 bg-hover p-3 shadow-[0_12px_24px_-12px_rgb(30_30_30/0.3)]"
            >
              <p className="text-[10px] text-muted">Meridian, now</p>
              <p className="mt-1 text-[12px] leading-[16px]">claude-code wants a key</p>
              <p className="mt-0.5 text-[11px] leading-[15px] text-muted">Up to $5.00 a day. Tap to review.</p>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          {screen === "home" ? (
            <Screen id="home">
              <p className="text-[11px] text-muted">Wallet balance</p>
              <p className="mt-1 font-serif text-[34px] leading-none tabular-nums">$25.00</p>
              <p className="mt-6 border-t border-line pt-3 text-[11px] text-muted">Agents</p>
              <p className="mt-2 text-[12px] leading-[17px]">No agents yet. When one asks for a key, it shows up here.</p>
            </Screen>
          ) : screen === "ask" ? (
            <Screen id="ask">
              <p className="text-[11px] text-muted">An agent is asking to spend</p>
              <p className="mt-1 font-serif text-[30px] leading-[1.05]">claude-code</p>
              <dl className="mt-4 flex flex-col gap-1.5 border-y border-line py-3 text-[11px]">
                <div className="flex justify-between">
                  <dt className="text-muted">Your Meridian wallet</dt>
                  <dd className="tabular-nums">$25.00</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted">Network</dt>
                  <dd>NEAR testnet</dd>
                </div>
              </dl>
              <p className="mt-4 text-[11px] text-muted">Daily limit (USDC)</p>
              <p className="mt-1.5 flex h-9 items-center border border-control px-2.5 text-[13px] tabular-nums">5</p>
              <p className="mt-1.5 text-[10px] text-muted">The agent asked for $5.00 a day.</p>
              <span
                className={`relative mt-auto flex h-10 items-center justify-center text-[13px] text-white transition-[background-color,scale] duration-200 ease-brand ${
                  lines >= 3 ? "scale-[0.96] bg-accent" : "bg-ink"
                }`}
              >
                {CORNERS.map((spot) => (
                  <span key={spot} className={`absolute size-2 border-accent ${spot}`} />
                ))}
                {lines >= 3 ? "Waiting for the wallet" : "Approve $5.00 a day"}
              </span>
              <span className="mt-3 self-center text-[11px] text-muted underline decoration-line underline-offset-4">Deny this agent</span>
            </Screen>
          ) : screen === "approved" ? (
            <Screen id="approved">
              <span className="flex size-10 items-center justify-center bg-accent text-white">
                <Check className="size-5" />
              </span>
              <p className="mt-5 font-serif text-[30px] leading-[1.05]">claude-code is approved</p>
              <p className="mt-3 text-[12px] leading-[18px]">It picks up its key within a few seconds and can spend up to $5.00 a day.</p>
            </Screen>
          ) : (
            <Screen id="feed">
              <p className="text-[11px] text-muted">Wallet balance</p>
              <p className="mt-1 font-serif text-[34px] leading-none tabular-nums">{spent ? "$24.98" : "$25.00"}</p>
              <div className="mt-4 border-y border-line py-3">
                <div className={ROW}>
                  <span>claude-code</span>
                  <span className="tabular-nums text-muted">{spent ? "$0.0175" : "$0.00"} of $5.00</span>
                </div>
                <span className="relative mt-2 block h-1 bg-hover">
                  <span className={`absolute inset-y-0 left-0 bg-accent ${spent ? "w-[3px]" : "w-0"}`} />
                </span>
              </div>
              <p className="mt-4 text-[11px] text-muted">Recent requests</p>
              <ol className="mt-1.5 flex flex-col">
                <AnimatePresence initial={false}>
                  {FEED.slice(0, done).map((item) => (
                    <motion.li
                      key={item.text}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: EASE }}
                      className={`${ROW} border-t border-line py-2 first:border-t-0`}
                    >
                      <span className="flex flex-col">
                        {item.text}
                        <span className="text-muted">{item.detail}</span>
                      </span>
                      <span className={`shrink-0 tabular-nums ${item.amount.startsWith("+") ? "text-up" : "text-ink"}`}>{item.amount}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ol>
              <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
                <div className={ROW}>
                  <span className="text-muted">Limit resets</span>
                  <span>00:00 UTC</span>
                </div>
                <span className="self-start text-[11px] text-down underline decoration-line underline-offset-4">Revoke this key</span>
              </div>
            </Screen>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function ApprovalBand() {
  const [progress, setProgress] = useState({ step: 0, lines: 0 });
  const onProgress = useCallback((step: number, lines: number) => setProgress({ step, lines }), []);

  return (
    <section className="relative isolate overflow-hidden bg-[#56595D] px-6 py-20 lg:px-12 lg:py-24">
      <img
        src="/images/terminal-rays.webp"
        alt=""
        aria-hidden
        loading="lazy"
        width={1217}
        height={768}
        className="absolute inset-0 -z-10 size-full object-cover object-bottom"
      />
      <div className="grid gap-14 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end lg:gap-16 xl:gap-24">
        <div className="flex min-w-0 flex-col gap-10">
          <div className="flex flex-col gap-5">
            <h2 className="text-balance font-serif text-[40px] leading-[1.04] tracking-[-0.01em] text-white lg:text-[60px]">Agents ask. You approve.</h2>
            <p className="max-w-[52ch] text-pretty text-[17px] leading-[27px] text-on-dark">
              An agent asks for a key with one request. You approve its daily limit from your phone with one signature, and it never holds your NEAR
              key.
            </p>
          </div>
          <div className="h-[380px] lg:h-[420px]">
            <AgentsTerminal plain onProgress={onProgress} />
          </div>
        </div>
        <Phone step={progress.step} lines={progress.lines} />
      </div>
    </section>
  );
}
