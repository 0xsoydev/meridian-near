"use client";

import { useState } from "react";
import { z } from "zod";
import { SECONDARY } from "../../../components/kit";
import { usd } from "../../../lib/client";
import { recomputeIndex, type IndexRecompute } from "../../../lib/index-math";
import type { Rollup } from "../../../lib/types";

const RPC = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "https://free.rpc.fastnear.com" : "https://test.rpc.fastnear.com";
const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";

const rpcSchema = z.object({ result: z.object({ result: z.array(z.number()) }) });
const rollupsSchema = z.array(
  z.object({ minute: z.number(), fills: z.number(), mixed_tokens: z.string(), charge: z.string(), vwap: z.string(), root: z.string() }),
);
const marketSchema = z.object({ price: z.string() });

type State = { phase: "idle" | "reading" | "failed" } | { phase: "done"; count: number; result: IndexRecompute };

async function view<T>(method: string, args: object, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "receipts",
      method: "query",
      params: { request_type: "call_function", finality: "final", account_id: CORE, method_name: method, args_base64: btoa(JSON.stringify(args)) },
    }),
  });
  const envelope = rpcSchema.parse(await response.json());
  return schema.parse(JSON.parse(new TextDecoder().decode(new Uint8Array(envelope.result.result))));
}

function explain(result: IndexRecompute, count: number, window: number): string {
  if (result.state === "no-input") {
    return `No fills in the last ${window} minutes, so the keeper holds the index at the best ask, which lives off chain. On chain now: ${usd(result.latest)}.`;
  }
  if (result.state === "no-post") {
    return result.twap === null
      ? "No index has been posted, and there are no rollups to post one from."
      : `No index has been posted yet. ${count} rollups average ${usd(result.twap)}, which becomes the first post.`;
  }
  const band = `between ${usd(result.band[0])} and ${usd(result.band[1])}`;
  const head = `${count} rollups from the last ${window} minutes average ${usd(result.twap)}. Clamped ${band} and stepped from ${usd(result.latest)}, the next post is ${usd(result.next)}.`;
  return result.state === "sync"
    ? `${head} It matches the index on chain.`
    : `${head} That moves it ${(Number(result.diffBps) / 100).toFixed(2)}%, posted once the move passes 0.1% or 5 minutes pass.`;
}

export function Recompute({ model, reference, window }: { model: string; reference: string; window: number }) {
  const [state, setState] = useState<State>({ phase: "idle" });

  const run = async () => {
    setState({ phase: "reading" });
    try {
      const since = Math.floor(Date.now() / 60_000) - window;
      const [rows, market] = await Promise.all([
        view("rollups", { model, since_minute: since }, rollupsSchema),
        view("market", { model }, marketSchema),
      ]);
      const rollups: Rollup[] = rows.map((row) => ({
        v: 1,
        model,
        minute: row.minute,
        fills: row.fills,
        mixed_tokens: row.mixed_tokens,
        charge_usd_micro: row.charge,
        vwap_micro_per_mtok: row.vwap,
        usage_root: row.root,
      }));
      setState({ phase: "done", count: rows.length, result: recomputeIndex({ rollups, reference: BigInt(reference), latest: BigInt(market.price) }) });
    } catch {
      setState({ phase: "failed" });
    }
  };

  return (
    <div className="flex flex-col items-start gap-3">
      <button type="button" disabled={state.phase === "reading"} onClick={() => void run()} className={SECONDARY}>
        {state.phase === "reading" ? "Reading core" : "Recompute in this browser"}
      </button>
      <p role="status" className={`max-w-[68ch] text-[13px] leading-[20px] ${state.phase === "failed" ? "text-down" : "text-ink"}`}>
        {state.phase === "done"
          ? explain(state.result, state.count, window)
          : state.phase === "failed"
            ? "Couldn't read core over NEAR RPC. Check your connection and retry."
            : state.phase === "reading"
              ? "Reading rollups and the index from core over NEAR RPC."
              : `Reads the rollups and the posted index straight from ${CORE || "core"} over public NEAR RPC, then runs the keeper's math here.`}
      </p>
    </div>
  );
}
