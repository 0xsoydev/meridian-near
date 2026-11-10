"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ago, api } from "../../lib/client";
import { MARKETS } from "../../lib/markets";
import type { ModelRow, VenueStatus } from "../../lib/types";
import { modelsSchema, statusSchema } from "../../lib/wire";
import { FOCUS } from "../kit";
import { SplitFlap } from "../ui/split-flap";

const POLL_MS = 30_000;
const MUTED = "text-[#a3a3a3]";

function price(micro: string | null | undefined): string {
  return micro ? (Number(micro) / 1_000_000).toFixed(4) : "----";
}

function versus(ask: string | null | undefined, list: string | undefined): string {
  if (!ask || !list || list === "0") return "----";
  const change = Math.round(((Number(ask) - Number(list)) / Number(list)) * 100);
  return `${change > 0 ? "+" : ""}${change}%`;
}

export function MarketBoard() {
  const [status, setStatus] = useState<VenueStatus | null>(null);
  const [models, setModels] = useState<ModelRow[]>([]);

  useEffect(() => {
    let alive = true;
    const read = () => {
      void api("/api/v1/status", statusSchema).then((result) => {
        if (alive && result.ok) setStatus(result.data);
      });
      void api("/api/v1/models", modelsSchema).then((result) => {
        if (alive && result.ok) setModels(result.data.data);
      });
    };
    read();
    const id = window.setInterval(read, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  const posted = status?.keeper_last_post_s ?? null;

  return (
    <div className="w-full max-w-[720px] bg-ink text-left text-on-dark">
      <div className={`flex h-10 items-center justify-between gap-4 border-b border-white/10 px-4 text-[12px] ${MUTED} sm:px-5`}>
        <span>Live prices, USD per MTok</span>
        <span className="tabular-nums">{posted === null ? "Reading the venue" : `Posted ${ago(posted)}`}</span>
      </div>
      <table className="w-full border-collapse">
        <thead>
          <tr className={`text-[12px] ${MUTED}`}>
            <th scope="col" className="h-9 pl-4 text-left font-normal sm:pl-5">
              Market
            </th>
            <th scope="col" className="h-9 px-3 text-right font-normal">
              Index
            </th>
            <th scope="col" className="hidden h-9 px-3 text-right font-normal sm:table-cell">
              Best ask
            </th>
            <th scope="col" className="h-9 pr-4 text-right font-normal sm:pr-5">
              Vs list
            </th>
          </tr>
        </thead>
        <tbody>
          {MARKETS.map((model, row) => {
            const market = status?.markets.find((entry) => entry.model === model);
            const listed = models.find((entry) => entry.id === model);
            const change = versus(listed?.best_ask_micro_per_mtok, listed?.reference_blended_micro_per_mtok);
            return (
              <tr key={model} className="border-t border-white/10 transition-colors duration-150 ease-brand hover:bg-white/5">
                <th scope="row" className="py-3 pl-4 text-left font-normal sm:pl-5">
                  <Link
                    href={`/trade?model=${encodeURIComponent(model)}`}
                    className={`text-[14px] underline decoration-transparent underline-offset-[5px] transition-[text-decoration-color] duration-200 ease-brand hover:decoration-on-dark sm:text-[15px] ${FOCUS}`}
                  >
                    {model}
                  </Link>
                </th>
                <td className="px-3 py-3 text-right">
                  <SplitFlap text={price(market?.index_micro_per_mtok)} length={6} delay={row * 120} className="text-[17px] sm:text-[20px]" />
                </td>
                <td className="hidden px-3 py-3 text-right sm:table-cell">
                  <SplitFlap text={price(listed?.best_ask_micro_per_mtok)} length={6} delay={row * 120 + 80} className="text-[17px] sm:text-[20px]" />
                </td>
                <td className="py-3 pr-4 text-right sm:pr-5">
                  <SplitFlap
                    text={change}
                    length={4}
                    delay={row * 120 + 160}
                    className="text-[17px] sm:text-[20px]"
                    tileClassName={change.startsWith("-") ? "text-up-tint" : undefined}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
