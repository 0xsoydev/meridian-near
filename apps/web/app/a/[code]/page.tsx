"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { CommitButton, FOCUS, Field, INPUT, LINK, Line, Skeleton } from "../../../components/kit";
import { api, explorer, usd } from "../../../lib/client";
import { formatMicroPerMtok, parseUsd } from "../../../lib/price";
import type { ApprovalView, WalletView } from "../../../lib/types";
import { anything, approvalSchema, walletSchema } from "../../../lib/wire";
import { useNear, type NearTransaction } from "../../(site)/providers";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const USDC = process.env.NEXT_PUBLIC_NEAR_USDC_ID ?? "";
const NETWORK = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "NEAR mainnet" : "NEAR testnet";

type Problem = { field: "limit" | "fund" | "send"; text: string };

const plain = (micro: bigint) => formatMicroPerMtok(micro).replaceAll(",", "");

export default function ApprovePage() {
  const { code } = useParams<{ code: string }>();
  const { accountId, connect, send } = useNear();
  const [approval, setApproval] = useState<ApprovalView | null>(null);
  const [missing, setMissing] = useState(false);
  const [wallet, setWallet] = useState<WalletView | null>(null);
  const [limit, setLimit] = useState("5");
  const [fund, setFund] = useState("0");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [done, setDone] = useState<{ kind: "approved" | "denied"; tx: string | null } | null>(null);
  const [busy, setBusy] = useState<"approve" | "deny" | null>(null);
  const limitRef = useRef<HTMLInputElement | null>(null);
  const fundRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void api(`/api/v1/approvals/${code}`, approvalSchema).then((result) => {
      if (!result.ok) {
        setMissing(true);
        return;
      }
      setApproval(result.data);
      if (result.data.cap_usd_micro) setLimit(plain(BigInt(result.data.cap_usd_micro)));
    });
  }, [code]);

  useEffect(() => {
    if (!accountId) return;
    void api(`/api/v1/wallet?account=${encodeURIComponent(accountId)}`, walletSchema).then((result) => {
      if (result.ok) setWallet(result.data);
    });
  }, [accountId]);

  const perDay = parseUsd(limit);
  const amount = fund.trim() === "" ? 0n : parseUsd(fund);
  const held = wallet ? BigInt(wallet.near_usdc_micro) : null;
  const asked = approval?.cap_usd_micro ? BigInt(approval.cap_usd_micro) : null;

  const flag = (field: Problem["field"], text: string) => {
    setProblem({ field, text });
    if (field === "limit") limitRef.current?.focus();
    if (field === "fund") fundRef.current?.focus();
  };

  const approve = async () => {
    if (!approval) return;
    if (!accountId) {
      await connect();
      return;
    }
    if (perDay === null || perDay === 0n) return flag("limit", "Enter a daily limit in USDC, like 5.");
    if (amount === null) return flag("fund", "Enter an amount in USDC, or 0 to skip.");
    if (amount > 0n && amount < 100_000n) return flag("fund", "Deposits start at $0.10. Enter 0 to skip.");
    if (held !== null && amount > held) return flag("fund", `Your NEAR account holds ${usd(held)} USDC.`);
    setBusy("approve");
    setProblem(null);
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
    const hashes = await send(transactions);
    if (!hashes) {
      setBusy(null);
      flag("send", "The wallet didn't sign, or the transaction failed, so nothing changed.");
      return;
    }
    const confirmed = await api(`/api/v1/approvals/${code}/confirm`, anything, {
      method: "POST",
      body: JSON.stringify({ account_id: accountId }),
    });
    setBusy(null);
    if (!confirmed.ok) {
      flag("send", "The limit isn't visible on chain yet. Wait a few seconds, then approve again.");
      return;
    }
    setDone({ kind: "approved", tx: hashes.at(-1) ?? null });
  };

  const deny = async () => {
    setBusy("deny");
    const result = await api(`/api/v1/approvals/${code}/deny`, anything, { method: "POST" });
    setBusy(null);
    if (result.ok) setDone({ kind: "denied", tx: null });
    else flag("send", result.message);
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
      ) : done?.kind === "approved" ? (
        <section className="flex flex-col gap-4">
          <h1 className="text-balance font-serif text-[34px] leading-[1.1] text-ink">{approval.name} is approved</h1>
          <p className="text-[16px] leading-[24px] text-ink">
            It picks up its key within a few seconds and can spend up to {perDay === null ? "the limit" : usd(perDay)} a day. Change the limit or revoke it any time on the{" "}
            <Link href={`/wallet?key=${approval.key_id}`} className={LINK}>
              Wallet
            </Link>{" "}
            page.
          </p>
          {done.tx ? (
            <a href={explorer("txns", done.tx)} target="_blank" rel="noreferrer" className={`${LINK} self-start text-[14px] text-ink`}>
              View the transaction
            </a>
          ) : null}
        </section>
      ) : done?.kind === "denied" ? (
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
            <Line label="Your Meridian wallet">{accountId ? (wallet === null ? "Reading" : usd(BigInt(wallet.wallet_usd_micro))) : "Not connected"}</Line>
            {accountId ? <Line label="USDC in your NEAR account">{held === null ? "Reading" : usd(held)}</Line> : null}
            <Line label="Network">{NETWORK}</Line>
          </dl>

          <div className="flex flex-col gap-5">
            <Field
              label="Daily limit (USDC)"
              alert={problem?.field === "limit"}
              note={problem?.field === "limit" ? problem.text : asked !== null ? `The agent asked for ${usd(asked)} a day. You can set less.` : "The most it can spend each UTC day."}
            >
              <input
                ref={limitRef}
                value={limit}
                onChange={(event) => setLimit(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={problem?.field === "limit"}
                className={INPUT}
              />
            </Field>
            <Field
              label="Add to your wallet now (USDC)"
              alert={problem?.field === "fund"}
              note={problem?.field === "fund" ? problem.text : "0 skips it. It comes from the USDC in your NEAR account."}
            >
              <input
                ref={fundRef}
                value={fund}
                onChange={(event) => setFund(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                aria-invalid={problem?.field === "fund"}
                className={INPUT}
              />
            </Field>
          </div>

          <div className="flex flex-col gap-4">
            <CommitButton disabled={busy !== null} aria-busy={busy === "approve"} onClick={() => void approve()} className="w-full">
              {busy === "approve"
                ? "Waiting for the wallet"
                : !accountId
                  ? "Connect wallet to approve"
                  : `Approve ${perDay === null ? "" : usd(perDay)} a day`}
            </CommitButton>
            {problem?.field === "send" ? (
              <p role="status" className="text-[13px] leading-[20px] text-down">
                {problem.text}
              </p>
            ) : null}
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void deny()}
              className={`${LINK} flex h-10 items-center self-center text-[14px] text-muted disabled:cursor-not-allowed`}
            >
              {busy === "deny" ? "Denying" : "Deny this agent"}
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
