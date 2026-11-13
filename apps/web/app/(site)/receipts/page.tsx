import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Empty, LINK, NIL, PAGE, PageHeader, Panel, ROW, TD, Table } from "../../../components/kit";
import { ago, explorer, price, usd } from "../../../lib/client";
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

  const rows = markets.map(({ model, market, rollups }) => {
    const listed = referenceFor(model, rails);
    return {
      model,
      rollups,
      posted: market && market.updatedAt > 0n ? market : null,
      reference: listed ? blended(listed.pricing) : null,
      fills: rollups.reduce((total, rollup) => total + rollup.fills, 0),
      volume: rollups.reduce((total, rollup) => total + BigInt(rollup.mixed_tokens), 0n),
    };
  });

  return (
    <div className={PAGE}>
      <PageHeader title="Receipts">
        Fill rollups and index posts are read from{" "}
        <a href={explorer("address", CORE)} target="_blank" rel="noreferrer" className={LINK}>
          {CORE}
        </a>
        . Recompute the index in your own browser, and follow every payout to its transaction.
      </PageHeader>

      <Panel title="Index by market" bodyClassName="flex flex-col gap-4 pt-5">
        <p className="max-w-[68ch] text-pretty text-[13px] leading-[20px] text-ink">
          Recompute reads the rollups and the posted index straight from {CORE} over public NEAR RPC, then runs the keeper&apos;s math in this browser.
        </p>
        <Table
          minWidth={960}
          columns={[
            { label: "Market" },
            { label: "Index", end: true },
            { label: "Posted" },
            { label: "Rollups, 2 h", end: true },
            { label: "Fills, 2 h", end: true },
            { label: "Volume, 2 h", end: true },
            { label: "Allowed band" },
            { label: "" },
          ]}
        >
          {rows.map((row) => (
            <Recompute key={row.model} model={row.model} reference={row.reference?.toString() ?? null} window={WINDOW} span={8}>
              <td className={TD}>{row.model}</td>
              <td className={`${TD} text-right`}>{row.posted ? price(row.posted.price) : "Not posted"}</td>
              <td className={`${TD} text-muted`}>{row.posted ? ago(now - Number(row.posted.updatedAt)) : "Never"}</td>
              <td className={`${TD} text-right`}>{row.rollups.length}</td>
              <td className={`${TD} text-right`}>{row.fills}</td>
              <td className={`${TD} text-right`}>{formatMtok(row.volume)} MTok</td>
              <td className={TD}>{row.reference ? `${price(row.reference / 10n)} to ${price(row.reference)}` : "No list price"}</td>
            </Recompute>
          ))}
        </Table>
      </Panel>

      {rows
        .filter((row) => row.rollups.length > 0)
        .map((row) => (
          <Panel key={row.model} title={`${row.model} rollups, last 2 h`} bodyClassName="pt-2">
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
              {row.rollups.toReversed().map((rollup) => (
                <tr key={rollup.minute} className={ROW}>
                  <td className={TD}>{minute(rollup.minute)}</td>
                  <td className={`${TD} text-right`}>{rollup.fills}</td>
                  <td className={`${TD} text-right`}>{formatMtok(BigInt(rollup.mixed_tokens))}</td>
                  <td className={`${TD} text-right`}>{price(BigInt(rollup.vwap_micro_per_mtok))}</td>
                  <td className={`${TD} text-right`}>{usd(BigInt(rollup.charge_usd_micro))}</td>
                  <td className={`${TD} font-mono text-[12px] text-muted`} title={rollup.usage_root}>
                    {short(rollup.usage_root)}
                  </td>
                </tr>
              ))}
            </Table>
          </Panel>
        ))}

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
                  <td className={TD}>{proof?.signature_kind ?? NIL}</td>
                  <td className={`${TD} ${valid ? "text-up" : "text-down"}`}>{valid ? "Verified" : "Not verified"}</td>
                  <td className={`${TD} font-mono text-[12px] text-muted`}>{proof ? short(proof.signing_address) : NIL}</td>
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
