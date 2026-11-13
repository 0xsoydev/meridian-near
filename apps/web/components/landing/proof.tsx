"use client";

import { Check } from "lucide-react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRef } from "react";
import { usd } from "../../lib/client";
import { clampIndex, recomputeIndex, twap } from "../../lib/index-math";
import type { Rollup } from "../../lib/types";
import { LINK } from "../kit";
import { Actor, Connector, PlayButton, Stage, useSequence } from "./blueprint";
import { H2, LEDE, WRAP } from "./shared";

const EASE = [0.22, 1, 0.36, 1] as const;
const LIST = 402_425n;
const FILLS = [
  { tokens: 400_000n, price: 181_000n },
  { tokens: 120_000n, price: 179_000n },
  { tokens: 850_000n, price: 182_000n },
  { tokens: 300_000n, price: 180_000n },
];
const VWAP = FILLS.reduce((sum, fill) => sum + fill.price * fill.tokens, 0n) / FILLS.reduce((sum, fill) => sum + fill.tokens, 0n);
const PREVIOUS = [180_400n, 180_900n, 179_800n, 180_200n, 181_500n, 180_700n, 179_900n, 180_300n, 180_800n];
const rollup = (minute: number, vwap: bigint): Rollup => ({
  v: 1,
  model: "glm-5.3",
  minute,
  fills: 0,
  mixed_tokens: "0",
  charge_usd_micro: "0",
  vwap_micro_per_mtok: vwap.toString(),
  usage_root: "",
});
const ROLLUPS = [...PREVIOUS, VWAP].map((vwap, index) => rollup(index, vwap));
const POSTED = clampIndex(twap(ROLLUPS) ?? 0n, LIST);
const CHECK = recomputeIndex({ rollups: ROLLUPS, reference: LIST, latest: POSTED });
const RECOMPUTED = CHECK.state === "sync" || CHECK.state === "pending" ? CHECK.next : POSTED;
const LOW = 179_000;
const HIGH = 182_500;
const HOLDS = [900, 650, 650, 650, 1200, 1400, 1300, 0] as const;

const FACTS = [
  ["Every fill names its rail", "NEAR AI answers come back with TEE signatures anyone can check."],
  ["Every payment is on chain", "Pulls, payouts and withdrawals are USDC transfers with explorer links."],
  ["Limits live in the contract", "core enforces each key's daily limit, not our database."],
  ["The index is public math", "The receipts page rebuilds it from on-chain rollups over public RPC."],
] as const;

const mtok = (tokens: bigint) => (Number(tokens) / 1e6).toFixed(2);

export function Proof() {
  const ref = useRef<HTMLDivElement>(null);
  const seq = useSequence(ref, HOLDS);
  const step = seq.step;
  const shown = Math.min(step, FILLS.length);

  return (
    <section aria-labelledby="proof-title" className="border-t border-line py-16 sm:py-24 lg:py-32">
      <div className={WRAP}>
        <div className="flex flex-col gap-5">
          <h2 id="proof-title" className={`${H2} max-w-[30ch]`}>
            Proof over marketing. Recompute our index in your browser.
          </h2>
          <p className={LEDE}>Every fill, rollup and index post is public. The same math the keeper runs is a click away on the receipts page.</p>
        </div>

        <MotionConfig reducedMotion="user">
          <div ref={ref} className="mt-12 lg:mt-16">
            <Stage>
              <div
                aria-hidden
                className="grid px-4 pb-6 pt-10 sm:px-6 lg:grid-cols-[minmax(0,1fr)_112px_minmax(0,1.15fr)_112px_minmax(0,1fr)] lg:px-8 lg:pb-8 lg:pt-12"
              >
                <Actor title="Fills at 12:04 UTC" meta="glm-5.3">
                  <ul className="flex min-h-[152px] flex-col">
                    <AnimatePresence initial={false}>
                      {FILLS.slice(0, shown).map((fill) => (
                        <motion.li
                          key={fill.tokens.toString()}
                          className="flex h-9 items-center justify-between border-b border-line/70 text-[13px] tabular-nums last:border-b-0"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: step >= 5 && step < seq.last ? 0.45 : 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.4, ease: EASE }}
                        >
                          <span className="text-ink">{mtok(fill.tokens)} MTok</span>
                          <span className="text-muted">at ${(Number(fill.price) / 1e6).toFixed(3)}</span>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </Actor>

                <Connector label="one rollup a minute" />

                <Actor title="Rollups on core" meta="VWAP per minute">
                  <div className="flex h-[152px] flex-col">
                    <div className="flex flex-1 items-end gap-1.5">
                      {ROLLUPS.map((item, index) => {
                        const fresh = index === ROLLUPS.length - 1;
                        const height = 18 + ((Number(item.vwap_micro_per_mtok) - LOW) / (HIGH - LOW)) * 82;
                        return (
                          <motion.span
                            key={item.minute}
                            className={`block flex-1 origin-bottom ${fresh ? "bg-accent" : "bg-ink/80"}`}
                            style={{ height: `${height}%` }}
                            initial={false}
                            animate={{ scaleY: fresh && step < 5 ? 0 : 1 }}
                            transition={{ duration: 0.7, ease: EASE }}
                          />
                        );
                      })}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[12px] leading-4 text-muted">
                      <span>11:55</span>
                      <motion.span
                        className="tabular-nums text-accent"
                        initial={false}
                        animate={{ opacity: step >= 5 ? 1 : 0 }}
                        transition={{ duration: 0.4, ease: EASE }}
                      >
                        12:04 VWAP {usd(VWAP)}
                      </motion.span>
                    </div>
                  </div>
                </Actor>

                <Connector label="time-weighted average" />

                <Actor title="Index" meta="per MTok">
                  <div className="flex min-h-[152px] flex-col justify-between text-[13px]">
                    <Reading label="Recomputed in your browser" value={usd(RECOMPUTED)} on={step >= 6} />
                    <Reading label="Posted on core" value={usd(POSTED)} on={step >= 7} />
                    <motion.p
                      className="flex h-9 items-center gap-2 text-accent"
                      initial={false}
                      animate={{ opacity: step >= 7 ? 1 : 0, y: step >= 7 ? 0 : 4 }}
                      transition={{ duration: 0.4, delay: step >= 7 ? 0.35 : 0, ease: EASE }}
                    >
                      <Check className="size-4" />
                      Match
                    </motion.p>
                  </div>
                </Actor>
              </div>
            </Stage>
            <div className="mt-4 flex justify-end">
              <PlayButton seq={seq} />
            </div>
          </div>
        </MotionConfig>

        <dl className="mt-12 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
          {FACTS.map(([term, detail]) => (
            <div key={term} className="flex flex-col gap-1.5">
              <dt className="text-[16px] leading-[24px] text-ink">{term}</dt>
              <dd className="text-pretty text-[15px] leading-[23px] text-muted">{detail}</dd>
            </div>
          ))}
        </dl>
        <Link href="/receipts" className={`${LINK} mt-10 inline-block text-[16px] text-ink`}>
          Open receipts
        </Link>
      </div>
    </section>
  );
}

function Reading({ label, value, on }: { label: string; value: string; on: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-line/70 pb-2">
      <span className="text-[12px] leading-[18px] text-muted">{label}</span>
      {on ? (
        <motion.span
          className="text-[20px] leading-7 tabular-nums text-ink"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {value}
        </motion.span>
      ) : (
        <span className="my-1.5 block h-4 w-24 bg-line/50" />
      )}
    </div>
  );
}
