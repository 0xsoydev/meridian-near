"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CommitButton, FOCUS, Field, INPUT, LINK, Line, Skeleton } from "../../../components/kit";
import { api, usd } from "../../../lib/client";
import { formatMicroPerMtok, parseUsd } from "../../../lib/price";
import { useNear, type NearTransaction } from "../../(site)/providers";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const USDC = process.env.NEXT_PUBLIC_NEAR_USDC_ID ?? "";
const NETWORK = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "NEAR mainnet" : "NEAR testnet";

type Approval = { key_id: string; name: string; cap_usd_micro: string | null };

export default function ApprovePage() {
  const { code } = useParams<{ code: string }>();
  const { accountId, connect, send } = useNear();
  const [approval, setApproval] = useState<Approval | null>(null);
  const [missing, setMissing] = useState(false);
  const [wallet, setWallet] = useState<bigint | null>(null);
  const [limit, setLimit] = useState("5");
  const [fund, setFund] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"approved" | "denied" | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<Approval>(`/api/v1/approvals/${code}`).then((result) => {
      if (!result.ok) {
        setMissing(true);
        return;
      }
      setApproval(result.data);
      if (result.data.cap_usd_micro) setLimit(formatMicroPerMtok(BigInt(result.data.cap_usd_micro)));
    });
  }, [code]);

  useEffect(() => {
    if (!accountId) return;
    void api<{ wallet_usd_micro: string }>(`/api/v1/wallet?account=${encodeURIComponent(accountId)}`).then((result) => {
      if (result.ok) setWallet(BigInt(result.data.wallet_usd_micro));
    });
  }, [accountId]);

  const perDay = parseUsd(limit);
  const amount = fund.trim() === "" ? 0n : parseUsd(fund);

  const approve = async () => {
    if (!approval) return;
    if (!accountId) {
      await connect();
      return;
    }
    if (perDay === null || perDay === 0n) {
      setError("Enter a daily limit in USDC, like 5.");
      return;
    }
    if (amount === null) {
      setError("Enter an amount to add in USDC, or 0 to skip.");
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
    if (!(await send(transactions))) {
      setBusy(false);
      setError("The wallet didn't sign, so nothing changed.");
      return;
    }
    const confirmed = await api<unknown>(`/api/v1/approvals/${code}/confirm`, {
      method: "POST",
      body: JSON.stringify({ account_id: accountId }),
    });
    setBusy(false);
    if (!confirmed.ok) {
      setError("The limit isn't visible on chain yet. Wait a few seconds, then approve again.");
      return;
    }
    setDone("approved");
  };

  const deny = async () => {
    await api<unknown>(`/api/v1/approvals/${code}/deny`, { method: "POST" });
    setDone("denied");
  };

  return (
    <main className="mx-auto flex min-h-svh w-full max-w-[480px] flex-col gap-10 px-5 pb-16 pt-6">
      <Link href="/" className={`self-start ${FOCUS}`}>
        <img src="/images/namelogo.svg" alt="Meridian" className="h-[20px] w-auto" />
      </Link>

      {missing ? (
        <section className="flex flex-col gap-3">
          <h1 className="font-serif text-[34px] leading-[1.1] text-ink">This link has expired</h1>
          <p className="text-[16px] leading-[24px] text-ink">It was already used, or it timed out. Ask the agent to request a new one.</p>
        </section>
      ) : !approval ? (
        <section className="flex flex-col gap-4" aria-busy>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-16 w-full" />
        </section>
      ) : done === "approved" ? (
        <section className="flex flex-col gap-4">
          <h1 className="text-balance font-serif text-[34px] leading-[1.1] text-ink">{approval.name} is approved</h1>
          <p className="text-[16px] leading-[24px] text-ink">
            It picks up its key within a few seconds and can spend up to {perDay === null ? "the limit" : usd(perDay)} a day. Change the limit or revoke it any time on the{" "}
            <Link href={`/keys?key=${approval.key_id}`} className={LINK}>
              Wallet
            </Link>{" "}
            page.
          </p>
        </section>
      ) : done === "denied" ? (
        <section className="flex flex-col gap-4">
          <h1 className="font-serif text-[34px] leading-[1.1] text-ink">Denied</h1>
          <p className="text-[16px] leading-[24px] text-ink">{approval.name} gets no key and stops asking.</p>
        </section>
      ) : (
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="text-[13px] text-muted">An agent is asking to spend</p>
            <h1 className="text-balance font-serif text-[34px] leading-[1.1] text-ink">{approval.name}</h1>
            <p className="text-pretty text-[16px] leading-[24px] text-ink">
              It wants to buy inference from your Meridian wallet. It never sees your NEAR key and can&apos;t spend past the daily limit you set on
              chain.
            </p>
          </div>

          <dl className="flex flex-col gap-2 border-y border-line py-4">
            <Line label="Asked for">{approval.cap_usd_micro ? `${usd(BigInt(approval.cap_usd_micro))} a day` : "No amount"}</Line>
            <Line label="Your wallet">{accountId ? (wallet === null ? "Reading" : usd(wallet)) : "Not connected"}</Line>
            <Line label="Network">{NETWORK}</Line>
          </dl>

          <div className="flex flex-col gap-5">
            <Field label="Daily limit (USDC)">
              <input value={limit} onChange={(event) => setLimit(event.target.value)} inputMode="decimal" autoComplete="off" className={INPUT} />
            </Field>
            <Field label="Add to your wallet now (USDC)" note="0 skips it. It comes from the USDC in your NEAR account.">
              <input value={fund} onChange={(event) => setFund(event.target.value)} inputMode="decimal" autoComplete="off" className={INPUT} />
            </Field>
          </div>

          <div className="flex flex-col gap-4">
            <CommitButton disabled={busy} aria-busy={busy} onClick={() => void approve()} className="w-full">
              {busy
                ? "Waiting for the wallet"
                : !accountId
                  ? "Connect wallet to approve"
                  : `Approve ${perDay === null ? "" : usd(perDay)} a day`}
            </CommitButton>
            {error ? (
              <p role="status" className="text-[13px] leading-[20px] text-down">
                {error}
              </p>
            ) : null}
            <button type="button" onClick={() => void deny()} className={`${LINK} self-center text-[14px] text-muted`}>
              Deny this agent
            </button>
          </div>

          <p className="text-[12px] leading-[18px] text-muted">
            One wallet prompt signs both steps: the deposit, if any, and the daily limit on {CORE || "core"}.
          </p>
        </section>
      )}
    </main>
  );
}
