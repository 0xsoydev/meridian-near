import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Empty, LINK, PAGE, PageHeader, Panel, ROW, Stat, TD, Table } from "../../../components/kit";
import { ago, explorer, usd } from "../../../lib/client";
import { db } from "../../../lib/db";
import { MARKETS, readMarket } from "../../../lib/perp";
import { blended, clockFormat, formatMtok, referenceFor } from "../../../lib/price";
import { attestedSigner, proofValid, readProof } from "../../../lib/proof";
import { catalog } from "../../../lib/rails";
import { readRollups } from "../../../lib/rollup";
import { accounts, listings, payouts, usage } from "../../../lib/schema";
import { Recompute } from "./recompute";

export const dynamic = "force-dynamic";

const NEARAI = process.env.NEARAI_BASE_URL ?? "https://cloud-api.near.ai/v1";
const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "core";
const WINDOW = Number(process.env.INDEX_WINDOW_MIN ?? "60");

async function recentProofs() {
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

async function recentPayouts() {
  try {
    return await db()
      .select({ day: payouts.day, amount: payouts.amountUsdMicro, status: payouts.status, tx: payouts.txHash, seller: accounts.address })
      .from(payouts)
      .innerJoin(accounts, eq(accounts.id, payouts.accountId))
      .orderBy(desc(payouts.createdAt))
      .limit(10);
  } catch {
    return [];
  }
}

const minute = (value: number) => new Date(value * 60_000).toISOString().slice(11, 16);
const short = (value: string) => (value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value);

export default async function ReceiptsPage() {
  const now = Math.floor(Date.now() / 1000);
  const since = Math.floor(Date.now() / 60_000) - 120;
  const [markets, proofs, paid, signer, rails] = await Promise.all([
    Promise.all(
      MARKETS.map(async (model) => ({
        model,
        market: await readMarket(model).catch(() => null),
        rollups: await readRollups(model, since).catch(() => []),
      })),
    ),
    recentProofs(),
    recentPayouts(),
    attestedSigner(NEARAI).catch(() => null),
    catalog().catch(() => []),
  ]);

  return (
    <div className={PAGE}>
      <PageHeader title="Receipts">
        Fill rollups and index posts are read from{" "}
        <a href={explorer("address", CORE)} target="_blank" rel="noreferrer" className={LINK}>
          {CORE}
        </a>
        . Recompute the index in your own browser, and follow every payout to its transaction.
      </PageHeader>

      {markets.map(({ model, market, rollups }) => {
        const posted = market && market.updatedAt > 0n ? market : null;
        const reference = referenceFor(model, rails);
        const fills = rollups.reduce((total, rollup) => total + rollup.fills, 0);
        const volume = rollups.reduce((total, rollup) => total + BigInt(rollup.mixed_tokens), 0n);
        return (
          <Panel key={model} title={model} bodyClassName="flex flex-col gap-6 pt-5">
            <dl className="flex flex-wrap gap-x-10 gap-y-4">
              <Stat label="Index">{posted ? usd(posted.price) : "Not posted"}</Stat>
              <Stat label="Posted">{posted ? ago(now - Number(posted.updatedAt)) : "Never"}</Stat>
              <Stat label="Rollups, 2 h">{rollups.length}</Stat>
              <Stat label="Fills, 2 h">{fills}</Stat>
              <Stat label="Volume, 2 h">{formatMtok(volume)} MTok</Stat>
              <Stat label="Allowed band">
                {reference ? `${usd(blended(reference.pricing) / 10n)} to ${usd(blended(reference.pricing))}` : "No list price"}
              </Stat>
            </dl>
            {reference ? <Recompute model={model} reference={blended(reference.pricing).toString()} window={WINDOW} /> : null}
            {rollups.length === 0 ? (
              <Empty start>No rollups in the last two hours. One is written for every minute with fills.</Empty>
            ) : (
              <Table
                minWidth={720}
                columns={[
                  { label: "Minute (UTC)" },
                  { label: "Fills", end: true },
                  { label: "MTok", end: true },
                  { label: "VWAP", end: true },
                  { label: "Charged", end: true },
                  { label: "Usage root" },
                ]}
              >
                {rollups.toReversed().map((rollup) => (
                  <tr key={rollup.minute} className={ROW}>
                    <td className={TD}>{minute(rollup.minute)}</td>
                    <td className={`${TD} text-right`}>{rollup.fills}</td>
                    <td className={`${TD} text-right`}>{formatMtok(BigInt(rollup.mixed_tokens))}</td>
                    <td className={`${TD} text-right`}>{usd(BigInt(rollup.vwap_micro_per_mtok))}</td>
                    <td className={`${TD} text-right`}>{usd(BigInt(rollup.charge_usd_micro))}</td>
                    <td className={`${TD} font-mono text-[12px] text-muted`} title={rollup.usage_root}>
                      {short(rollup.usage_root)}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Panel>
        );
      })}

      <Panel title="NEAR AI proofs" bodyClassName="flex flex-col gap-4 pt-5">
        <p className="max-w-[68ch] text-[13px] leading-[20px] text-ink">
          {signer
            ? `Responses served through NEAR AI are signed inside a TEE. The attested gateway signer is ${short(signer)}.`
            : "The NEAR AI attestation report is unavailable right now, so signers can't be matched to it."}{" "}
          <a href="https://cloud.near.ai/verify" target="_blank" rel="noreferrer" className={LINK}>
            Verify TDX and NVIDIA quotes
          </a>
        </p>
        {proofs.length === 0 ? (
          <Empty start>No signed responses yet. They appear after the first request served by NEAR AI.</Empty>
        ) : (
          <Table columns={[{ label: "Time (UTC)" }, { label: "Model" }, { label: "Kind" }, { label: "Signature" }, { label: "Signer" }]}>
            {proofs.map((row) => {
              const proof = readProof(row.raw);
              const valid = proof ? proofValid(proof) : false;
              return (
                <tr key={row.at.toISOString()} className={ROW}>
                  <td className={TD}>{clockFormat.format(row.at)}</td>
                  <td className={TD}>{row.model}</td>
                  <td className={TD}>{proof?.signature_kind ?? "Unknown"}</td>
                  <td className={`${TD} ${valid ? "text-up" : "text-down"}`}>{valid ? "Verified" : "Not verified"}</td>
                  <td className={`${TD} font-mono text-[12px] text-muted`}>{proof ? short(proof.signing_address) : "None"}</td>
                </tr>
              );
            })}
          </Table>
        )}
      </Panel>

      <Panel title="Payouts" bodyClassName="flex flex-col gap-4 pt-5">
        {paid.length === 0 ? (
          <Empty start>No payouts yet. Sellers are paid once a day for the day before.</Empty>
        ) : (
          <Table columns={[{ label: "Day" }, { label: "Seller" }, { label: "Amount", end: true }, { label: "Status" }, { label: "Transaction" }]}>
            {paid.map((row) => (
              <tr key={`${row.day}-${row.seller}-${row.tx ?? "pending"}`} className={ROW}>
                <td className={TD}>{row.day}</td>
                <td className={TD}>{row.seller}</td>
                <td className={`${TD} text-right`}>{usd(row.amount)}</td>
                <td className={`${TD} ${row.status === "executed" ? "text-up" : "text-muted"}`}>{row.status === "executed" ? "Paid" : "Pending"}</td>
                <td className={TD}>
                  {row.tx ? (
                    <a href={explorer("txns", row.tx)} target="_blank" rel="noreferrer" className={`${LINK} font-mono text-[12px]`}>
                      {short(row.tx)}
                    </a>
                  ) : (
                    <span className="text-muted">{row.status === "executed" ? "Not recorded" : "Not sent"}</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
