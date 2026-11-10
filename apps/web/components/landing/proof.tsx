"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ago, api } from "../../lib/client";
import type { VenueStatus } from "../../lib/types";
import { statusSchema } from "../../lib/wire";
import { LINK } from "../kit";

const EASE = [0.22, 1, 0.36, 1] as const;
const TEETH = 18;
const EDGE = `polygon(0 0, 100% 0, 100% calc(100% - 8px), ${Array.from({ length: TEETH }, (_, tooth) => {
  const step = 100 / TEETH;
  return `${(100 - (tooth + 0.5) * step).toFixed(2)}% 100%, ${(100 - (tooth + 1) * step).toFixed(2)}% calc(100% - 8px)`;
}).join(", ")})`;

const CLAIMS = [
  { title: "Every fill names its seller", body: "NEAR AI answers carry TEE signatures, and the receipts page checks them in your browser." },
  { title: "Every payment is a USDC transfer on NEAR", body: "Deposits, pulls and seller payouts all link to the explorer." },
  { title: "Agents can't overspend", body: "Each daily limit lives in the contract, not in our database." },
  { title: "The index can be recomputed", body: "Per-minute rollups are public. Rebuild the index from them yourself." },
  { title: "Perps settle on chain", body: "Positions clear against the house vault at up to 5x, with funding on skew." },
];

function price(micro: string | null): string {
  return micro ? `$${(Number(micro) / 1_000_000).toFixed(4)}` : "not posted";
}

export function Proof() {
  const paper = useRef<HTMLDivElement>(null);
  const seen = useInView(paper, { once: true, amount: 0.3 });
  const reduced = useReducedMotion();
  const [status, setStatus] = useState<VenueStatus | null>(null);
  const [stamp, setStamp] = useState("");

  useEffect(() => {
    void api("/api/v1/status", statusSchema).then((result) => {
      if (result.ok) setStatus(result.data);
    });
    setStamp(new Date().toISOString().slice(0, 16).replace("T", " "));
  }, []);

  const lines: Array<[string, string]> = status
    ? [
        ...status.markets.map((market): [string, string] => [`${market.model} index`, price(market.index_micro_per_mtok)]),
        ["Last index post", status.keeper_last_post_s === null ? "none yet" : ago(status.keeper_last_post_s)],
        ["Fills, last 24 h", status.venue.fills_24h.toString()],
        ["Asks on the book", status.venue.open_asks.toString()],
        ["Seller payouts", `${status.payouts.executed} paid, ${status.payouts.pending} pending`],
      ]
    : [];
  const printing = (seen || reduced) && status !== null;

  return (
    <section className="grid gap-14 border-t border-line px-6 py-20 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-20 lg:px-12 lg:py-28">
      <div className="flex flex-col items-center gap-0 lg:items-start">
        <h2 className="mb-12 max-w-[16ch] self-start text-balance font-serif text-[40px] leading-[1.04] tracking-[-0.01em] text-ink lg:text-[60px]">
          Proof over marketing.
        </h2>
        <div className="flex w-full max-w-[380px] flex-col items-center">
        <div aria-hidden className="relative z-10 h-3 w-full bg-ink" />
        <div ref={paper} className="-mt-1 w-[calc(100%_-_24px)] overflow-hidden">
          <motion.div
            initial={false}
            animate={{ y: printing || reduced ? "0%" : "-101%" }}
            transition={{ duration: reduced ? 0 : 1.8, ease: EASE }}
            className="bg-hover px-6 pb-9 pt-7 text-[13px] text-ink"
            style={{ clipPath: EDGE }}
          >
            <div className="flex items-center justify-between">
              <img src="/images/namelogo.svg" alt="Meridian" width={84} height={19} className="h-4 w-auto" />
              <span className="tabular-nums text-muted">{stamp ? `${stamp} UTC` : ""}</span>
            </div>
            <p className="mt-4 text-muted">The venue right now, read from NEAR</p>
            <dl className="mt-4 flex flex-col gap-2 border-t border-dashed border-control pt-4">
              {(status ? lines : [["Reading the venue", ""] as [string, string]]).map(([label, value], index) => (
                <motion.div
                  key={label}
                  initial={false}
                  animate={{ opacity: printing ? 1 : 0 }}
                  transition={{ delay: reduced ? 0 : 0.5 + index * 0.12, duration: 0.25 }}
                  className="flex items-baseline justify-between gap-4"
                >
                  <dt className="truncate">{label}</dt>
                  <dd className="shrink-0 tabular-nums">{value}</dd>
                </motion.div>
              ))}
            </dl>
            <div className="mt-6 border-t-2 border-dashed border-accent pt-4">
              <Link href="/receipts" className={`${LINK} text-[14px] text-ink`}>
                Recompute the index yourself
              </Link>
            </div>
          </motion.div>
        </div>
        </div>
      </div>

      <div className="flex flex-col justify-end">
        <p className="max-w-[46ch] text-pretty text-[17px] leading-[27px] text-ink">
          Everything that moves money on Meridian leaves a public trace. Check any of it without trusting this page.
        </p>
        <dl className="mt-10 flex flex-col border-b border-line">
          {CLAIMS.map((claim) => (
            <div key={claim.title} className="grid gap-1 border-t border-line py-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-8">
              <dt className="text-[16px] leading-[24px] text-ink">{claim.title}</dt>
              <dd className="text-pretty text-[15px] leading-[24px] text-muted">{claim.body}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
