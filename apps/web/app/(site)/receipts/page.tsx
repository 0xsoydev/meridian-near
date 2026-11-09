import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../../../lib/db";
import { MARKETS, readMarket } from "../../../lib/perp";
import { formatMicroPerMtok, formatMtok } from "../../../lib/price";
import { attestedSigner, proofValid, type Proof } from "../../../lib/proof";
import { readRollups } from "../../../lib/rollup";
import { listings, usage } from "../../../lib/schema";

export const dynamic = "force-dynamic";

const NEARAI = process.env.NEARAI_BASE_URL ?? "https://cloud-api.near.ai/v1";

type ProofRow = { at: Date; raw: string | null; model: string };

async function recentProofs(): Promise<ProofRow[]> {
  try {
    return await db()
      .select({ at: usage.createdAt, raw: usage.proof, model: listings.model })
      .from(usage)
      .innerJoin(listings, eq(listings.id, usage.listingId))
      .where(and(eq(usage.rail, "near-ai"), isNotNull(usage.proof)))
      .orderBy(desc(usage.createdAt))
      .limit(20);
  } catch {
    return [];
  }
}

function parse(raw: string | null): Proof | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Proof;
  } catch {
    return null;
  }
}

export default async function ReceiptsPage() {
  const since = Math.floor(Date.now() / 60_000) - 120;
  const [markets, proofs, signer] = await Promise.all([
    Promise.all(
      MARKETS.map(async (model) => ({
        model,
        market: await readMarket(model).catch(() => null),
        rollups: await readRollups(model, since).catch(() => []),
      })),
    ),
    recentProofs(),
    attestedSigner(NEARAI).catch(() => null),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold">Receipts</h1>
        <p className="text-[#555]">Read straight from core. Anyone can recompute the index from these rows.</p>
      </header>

      {markets.map((row) => (
        <section key={row.model} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-xl font-semibold">{row.model}</h2>
            <p className="text-sm tabular-nums text-[#555]">
              index {row.market && row.market.updatedAt > 0n ? formatMicroPerMtok(row.market.price) : "no post yet"}
            </p>
          </div>
          {row.rollups.length === 0 && <p className="text-sm text-[#777]">No rollups in the last two hours.</p>}
          {row.rollups.length > 0 && (
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-[#777]">
                <tr>
                  <th className="py-1 font-normal">minute</th>
                  <th className="py-1 font-normal">fills</th>
                  <th className="py-1 font-normal">MTok</th>
                  <th className="py-1 font-normal">VWAP</th>
                  <th className="py-1 font-normal">root</th>
                </tr>
              </thead>
              <tbody>
                {row.rollups
                  .slice()
                  .reverse()
                  .map((rollup) => (
                    <tr key={rollup.minute} className="border-t border-[#EEEEEE]">
                      <td className="py-1">{new Date(rollup.minute * 60_000).toISOString().slice(11, 16)}</td>
                      <td className="py-1">{rollup.fills}</td>
                      <td className="py-1">{formatMtok(BigInt(rollup.mixed_tokens))}</td>
                      <td className="py-1">{formatMicroPerMtok(BigInt(rollup.vwap_micro_per_mtok))}</td>
                      <td className="py-1 font-mono text-xs text-[#777]">{rollup.usage_root.slice(0, 16)}…</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          )}
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">NEAR AI proofs</h2>
        <p className="text-sm text-[#555]">
          {signer ? `attested gateway signer ${signer.slice(0, 20)}…` : "attestation report unavailable"}
        </p>
        {proofs.length === 0 && <p className="text-sm text-[#777]">No signed responses yet.</p>}
        {proofs.map((row) => {
          const proof = parse(row.raw);
          const valid = proof ? proofValid(proof) : false;
          return (
            <p key={row.at.toISOString()} className="text-sm tabular-nums text-[#555]">
              {row.at.toISOString().slice(11, 19)} · {row.model} · {proof?.signature_kind ?? "?"} ·{" "}
              {valid ? "signature verified" : "not verified"} · {proof?.signing_address.slice(0, 16) ?? "—"}…
            </p>
          );
        })}
        <p className="text-xs text-[#777]">Full TDX and NVIDIA verification: cloud.near.ai/verify.</p>
      </section>
    </main>
  );
}
