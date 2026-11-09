import { MARKETS, readMarket } from "../../../lib/perp";
import { formatMicroPerMtok, formatMtok } from "../../../lib/price";
import { readRollups } from "../../../lib/rollup";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const since = Math.floor(Date.now() / 60_000) - 120;
  const rows = await Promise.all(
    MARKETS.map(async (model) => ({
      model,
      market: await readMarket(model).catch(() => null),
      rollups: await readRollups(model, since).catch(() => []),
    })),
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold">Receipts</h1>
        <p className="text-[#555]">Read straight from core. Anyone can recompute the index from these rows.</p>
      </header>

      {rows.map((row) => (
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
    </main>
  );
}
