"use client";

import { Check } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRef } from "react";
import { usd } from "../../lib/client";
import { charge } from "../../lib/price";
import { LINK } from "../kit";
import { NumberTicker } from "../ui/number-ticker";
import { AgentPrompt } from "./agents-terminal";
import { PlayButton, Stage, Steps, useSequence } from "./blueprint";
import { H2, LEDE, WRAP } from "./shared";

const EASE = [0.22, 1, 0.36, 1] as const;
const START = 3_100_000n;
const CAP = 5_000_000n;
const RAISED = 10_000_000n;
const REQUESTS = [
  { id: "r1", model: "claude-fable-5.1", tokens: 24_180n, ask: 17_000_000n },
  { id: "r2", model: "gpt-5.5", tokens: 38_920n, ask: 9_800_000n },
  { id: "r3", model: "claude-fable-5.1", tokens: 19_640n, ask: 17_000_000n },
  { id: "r4", model: "gpt-5.5", tokens: 41_300n, ask: 9_800_000n },
  { id: "r5", model: "claude-fable-5.1", tokens: 22_050n, ask: 17_000_000n },
].map((request) => ({ ...request, kind: "request" as const, cost: charge(request.tokens, request.ask) }));
const AT_LIMIT = START + REQUESTS.slice(0, 4).reduce((sum, request) => sum + request.cost, 0n);
const HOLDS = [1100, 900, 900, 900, 1300, 1700, 1900, 1400, 0] as const;
const TICKS = Array.from({ length: 21 }, (_, tick) => tick * 500_000);
const LABELS = [0, 2_500_000, 5_000_000, 7_500_000, 10_000_000];

const STEPS = [
  { title: "Spends inside the limit", frame: 4 },
  { title: "Stops at the limit", frame: 5 },
  { title: "One approval raises it", frame: 8 },
];

type Row = (typeof REQUESTS)[number] | { kind: "blocked"; id: "blocked" };

function frameAt(step: number) {
  const served = step >= 8 ? 5 : Math.min(step, 4);
  const used = START + REQUESTS.slice(0, served).reduce((sum, request) => sum + request.cost, 0n);
  const cap = step >= 7 ? RAISED : CAP;
  const rows: Row[] = REQUESTS.slice(0, Math.min(served, 4)).reverse();
  if (step >= 5) rows.unshift({ kind: "blocked", id: "blocked" });
  if (step >= 8) rows.unshift(...REQUESTS.slice(4, 5));
  const phone = step >= 7 ? "approved" : step >= 6 ? "ask" : step >= 5 ? "alert" : "idle";
  return { used, cap, rows: rows.slice(0, 4), phone, blocked: step >= 5 && step < 8 } as const;
}

const dollars = (micro: bigint | number) => Number(micro) / 1e6;
const cents = (micro: bigint | number) => `$${dollars(micro).toFixed(2)}`;

export function Limit({ host }: { host: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const seq = useSequence(ref, HOLDS);
  const frame = frameAt(seq.step);
  const active = seq.step >= 6 ? 2 : seq.step >= 5 ? 1 : 0;

  return (
    <section aria-labelledby="limit-title" className="border-t border-line py-16 sm:py-24 lg:py-32">
      <div className={`${WRAP} grid gap-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-16`}>
        <div className="flex flex-col gap-5">
          <h2 id="limit-title" className={H2}>
            Your agent gets a key, not your wallet
          </h2>
          <p className={LEDE}>
            Approve an agent once and set its daily limit on chain. It spends from your wallet inside that limit, and stops at it.
          </p>
          <dl className="mt-6 flex flex-col gap-6">
            {[
              ["No NEAR key on the agent", "It holds a router key that can only buy inference."],
              ["The contract holds the line", "core refuses any pull past today's limit."],
              ["Raise it from your phone", "A 403 links to one approval, then the agent retries."],
            ].map(([term, detail]) => (
              <div key={term} className="flex flex-col gap-1">
                <dt className="text-[16px] leading-[24px] text-ink">{term}</dt>
                <dd className="max-w-[46ch] text-pretty text-[15px] leading-[23px] text-muted">{detail}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex flex-col gap-4">
            <AgentPrompt host={host} />
            <Link href="/agents" className={`${LINK} w-fit text-[16px] text-ink`}>
              Read the agent guide
            </Link>
          </div>
        </div>

        <MotionConfig reducedMotion="user">
          <div ref={ref} className="flex min-w-0 flex-col">
            <Stage className="flex flex-col items-center gap-6 px-4 pb-6 pt-10 sm:px-6 lg:px-8 lg:pb-8 lg:pt-12 xl:flex-row xl:items-end">
              <div aria-hidden className="w-full max-w-[460px] border border-line bg-white xl:min-w-0 xl:flex-1">
                <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
                  <img src="/images/rails/claudecode.svg" alt="" width={20} height={20} className="size-5 object-contain" />
                  <p className="min-w-0 flex-1 truncate text-[14px] text-ink">claude-code on zer0-laptop</p>
                  <span className="font-mono text-[12px] text-muted">rk_…41aa</span>
                </div>
                <div className="flex flex-col gap-4 px-4 pb-5 pt-4">
                  <p className="text-[13px] leading-[20px] text-muted">
                    Used today{" "}
                    <NumberTicker value={dollars(frame.used)} className="text-[20px] text-ink" /> of{" "}
                    <NumberTicker value={dollars(frame.cap)} className="text-ink" /> a day
                  </p>
                  <Ruler used={frame.used} cap={frame.cap} blocked={frame.blocked} />
                </div>
                <ul className="flex min-h-[176px] flex-col border-t border-line">
                  <AnimatePresence initial={false} mode="popLayout">
                    {frame.rows.map((row) => (
                      <motion.li
                        key={row.id}
                        layout
                        initial={{ opacity: 0, y: -8, scale: 0.98 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.2 } }}
                        transition={{ duration: 0.45, ease: EASE }}
                        className="grid h-11 grid-cols-[minmax(0,1fr)_auto_64px] items-center gap-3 border-b border-line/70 px-4 text-[13px] last:border-b-0"
                      >
                        {row.kind === "blocked" ? (
                          <>
                            <span className="truncate text-ink">
                              <span className="tabular-nums text-down">403</span> limit reached
                            </span>
                            <span className="font-mono text-[12px] text-muted">/a/7KQ2XM</span>
                            <span className="text-right text-muted">waiting</span>
                          </>
                        ) : (
                          <>
                            <span className="truncate text-ink">{row.model}</span>
                            <span className="tabular-nums text-muted">{row.tokens.toLocaleString("en-US")} tok</span>
                            <span className="text-right tabular-nums text-ink">{cents(row.cost)}</span>
                          </>
                        )}
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </div>

              <Phone state={frame.phone} />
            </Stage>

            <div className="mt-2 flex flex-col gap-4 xl:flex-row xl:items-start">
              <Steps items={STEPS} active={active} seq={seq} grid="grid-cols-1 sm:grid-cols-3" className="flex-1" />
              <PlayButton seq={seq} className="self-start xl:mt-4" />
            </div>
          </div>
        </MotionConfig>
      </div>
    </section>
  );
}

function Ruler({ used, cap, blocked }: { used: bigint; cap: bigint; blocked: boolean }) {
  const scale = Number(cap);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative h-2.5 overflow-hidden bg-hover">
        <motion.span
          className={`absolute inset-0 origin-left ${blocked ? "bg-down" : "bg-ink"} transition-colors duration-300`}
          initial={false}
          animate={{ scaleX: Math.min(1, dollars(used) / dollars(cap)) }}
          transition={{ duration: 0.8, ease: EASE }}
        />
      </div>
      <div className="relative h-2 overflow-hidden">
        {TICKS.map((tick) => (
          <motion.span
            key={tick}
            className="absolute inset-0"
            initial={false}
            animate={{ x: `${(tick / scale) * 100}%`, opacity: tick <= scale ? 1 : 0 }}
            transition={{ duration: 0.9, ease: EASE }}
          >
            <span className={`absolute left-0 top-0 w-px bg-accent ${tick % 2_500_000 === 0 ? "h-2" : "h-1"}`} />
          </motion.span>
        ))}
      </div>
      <div className="relative h-4 overflow-x-clip">
        {LABELS.map((label) => (
          <motion.span
            key={label}
            className="absolute inset-0"
            initial={false}
            animate={{ x: `${(label / scale) * 100}%`, opacity: label <= scale ? 1 : 0 }}
            transition={{ duration: 0.9, ease: EASE }}
          >
            <span
              className={`absolute top-0 text-[12px] leading-4 tabular-nums text-muted ${
                label === 0 ? "left-0" : label >= scale ? "right-full" : "-translate-x-1/2"
              }`}
            >
              {usd(BigInt(label))}
            </span>
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function Phone({ state }: { state: "idle" | "alert" | "ask" | "approved" }) {
  return (
    <div aria-hidden className="relative aspect-[511/1041] w-[204px] shrink-0">
      <div className="absolute bottom-[2.3%] left-[5.1%] right-[5.1%] top-[2.2%] flex flex-col overflow-hidden rounded-[22px] bg-white px-3 pb-2 pt-2.5">
        <span className="mx-auto block h-[17px] w-[36%] shrink-0 rounded-full bg-ink" />
        <div className="relative mt-7 min-h-0 flex-1 overflow-hidden">
          <AnimatePresence initial={false} mode="wait">
            {state === "idle" || state === "alert" ? (
              <motion.div
                key="wallet"
                className="flex h-full flex-col gap-3 px-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, ease: EASE }}
              >
                <img src="/images/namelogo.svg" alt="" width={70} height={16} className="h-4 w-auto self-start" />
                <p className="text-[12px] leading-4 text-muted">Meridian wallet</p>
                <p className="-mt-2 text-[22px] leading-7 tabular-nums text-ink">$42.18</p>
                <div className="flex flex-col gap-1 border-t border-line pt-3 text-[12px] leading-4 text-muted">
                  <span className="text-ink">claude-code on zer0-laptop</span>
                  <span>Limit $5.00 a day</span>
                </div>
                <AnimatePresence>
                  {state === "alert" ? (
                    <motion.div
                      key="alert"
                      className="mt-auto border border-line bg-white px-2.5 py-2 text-[12px] leading-4 shadow-[0_6px_20px_-8px_rgb(30_30_30/0.25)]"
                      initial={{ opacity: 0, y: 12, scale: 0.96 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.45, ease: EASE }}
                    >
                      <span className="block text-ink">claude-code hit its limit</span>
                      <span className="text-muted">Tap to review a higher limit</span>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.div
                key="approve"
                className="flex h-full flex-col gap-2.5 px-1"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: EASE }}
              >
                <p className="text-[13px] leading-[18px] text-ink">Raise claude-code&apos;s limit</p>
                <p className="text-[12px] leading-4 text-muted">
                  Used today {cents(AT_LIMIT)} of {cents(CAP)}
                </p>
                <div className="flex flex-col gap-1">
                  <span className="text-[12px] leading-4 text-muted">Daily limit (USDC)</span>
                  <span className="flex h-8 items-center border border-control px-2 text-[13px] tabular-nums text-ink">10</span>
                </div>
                <motion.span
                  className={`mt-1 flex h-9 items-center justify-center gap-1.5 text-[12px] text-white ${state === "approved" ? "bg-accent" : "bg-ink"}`}
                  initial={false}
                  animate={{ scale: state === "approved" ? [0.94, 1] : 1 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  {state === "approved" ? (
                    <>
                      <Check className="size-3.5" /> Approved
                    </>
                  ) : (
                    "Approve $10.00 a day"
                  )}
                </motion.span>
                <p className="text-[12px] leading-4 text-muted">
                  {state === "approved" ? "set_cap signed on core. The agent retries." : "One signature. The agent never sees your key."}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <span className="mx-auto mt-2 block h-1 w-[38%] shrink-0 rounded-full bg-ink/80" />
      </div>
      <span className="absolute inset-0 bg-ink [mask-image:url(/images/iphone-14-pro-frame.png)] [mask-repeat:no-repeat] [mask-size:100%_100%]" />
    </div>
  );
}
