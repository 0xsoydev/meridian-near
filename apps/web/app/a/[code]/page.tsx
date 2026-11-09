"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { parseUsd } from "../../../lib/price";
import { useNear } from "../../(site)/providers";
import type { NearTransaction } from "../../(site)/providers";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const USDC = process.env.NEXT_PUBLIC_NEAR_USDC_ID ?? "";

type Approval = { key_id: string; name: string; cap_usd_micro: string | null };

export default function ApprovePage() {
  const params = useParams<{ code: string }>();
  const code = params.code;
  const { accountId, connect, send } = useNear();
  const [approval, setApproval] = useState<Approval | null>(null);
  const [limit, setLimit] = useState("5");
  const [fund, setFund] = useState("10");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "denied" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/approvals/${code}`)
      .then(async (response) => (response.ok ? ((await response.json()) as Approval) : null))
      .then((body) => {
        setApproval(body);
        if (body?.cap_usd_micro) setLimit((Number(body.cap_usd_micro) / 1_000_000).toFixed(2));
      })
      .catch(() => setError("could not load this approval"));
  }, [code]);

  const approve = async () => {
    if (!approval || !accountId) return;
    const perDay = parseUsd(limit);
    const amount = parseUsd(fund);
    if (perDay === null || amount === null) {
      setError("invalid amount");
      return;
    }
    setBusy(true);
    setError(null);
    const transactions: NearTransaction[] = [];
    if (amount > 0n) {
      transactions.push({
        receiverId: USDC,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "ft_transfer_call",
              args: { receiver_id: CORE, amount: amount.toString(), msg: JSON.stringify({ fund: {} }) },
              gas: "100000000000000",
              deposit: "1",
            },
          },
        ],
      });
    }
    transactions.push({
      receiverId: CORE,
      actions: [
        {
          type: "FunctionCall",
          params: { methodName: "set_cap", args: { key: approval.key_id, per_day: perDay.toString() }, gas: "30000000000000", deposit: "1" },
        },
      ],
    });
    const sent = await send(transactions);
    if (!sent) {
      setBusy(false);
      setError("the transaction was not signed");
      return;
    }
    const response = await fetch(`/api/v1/approvals/${code}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account_id: accountId }),
    });
    setBusy(false);
    if (!response.ok) {
      setError("the limit is not visible on-chain yet; wait a second and try again");
      return;
    }
    setDone("approved");
  };

  const deny = async () => {
    await fetch(`/api/v1/approvals/${code}/deny`, { method: "POST" });
    setDone("denied");
  };

  return (
    <main className="mx-auto flex max-w-xl flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold">Approve an agent</h1>
      {!approval && !error && <p className="text-[#555]">Loading…</p>}
      {error && <p className="text-sm text-[#B00020]">{error}</p>}

      {approval && !done && (
        <>
          <p className="text-[#555]">
            <span className="font-semibold text-[#1E1E1E]">{approval.name}</span> wants to buy inference from your wallet. It never sees your key.
          </p>
          <label className="flex flex-col gap-1 text-sm">
            Daily limit (USD)
            <input value={limit} onChange={(event) => setLimit(event.target.value)} className="h-11 rounded-[6px] border border-[#CECECE] px-3 tabular-nums" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Fund the wallet (USDC)
            <input value={fund} onChange={(event) => setFund(event.target.value)} className="h-11 rounded-[6px] border border-[#CECECE] px-3 tabular-nums" />
          </label>
          {!accountId ? (
            <button type="button" onClick={() => void connect()} className="h-11 rounded-[6px] bg-black font-semibold text-white">
              Connect a wallet
            </button>
          ) : (
            <div className="flex gap-3">
              <button type="button" disabled={busy} onClick={() => void approve()} className="h-11 flex-1 rounded-[6px] bg-black font-semibold text-white disabled:bg-[#D4D4D4]">
                Fund and approve {limit ? `$${limit}/day` : ""}
              </button>
              <button type="button" onClick={() => void deny()} className="h-11 rounded-[6px] border border-[#CECECE] px-4">
                Deny
              </button>
            </div>
          )}
          <p className="text-xs text-[#777]">One wallet prompt sets the funding transfer and the on-chain daily limit.</p>
        </>
      )}

      {done === "approved" && <p className="text-[#1743FF]">Approved. The agent picks up its key on its next poll.</p>}
      {done === "denied" && <p className="text-[#555]">Denied. The agent stops asking.</p>}
    </main>
  );
}
