"use client";

import { useCallback, useEffect, useState } from "react";
import { formatMicroPerMtok, formatUsd, parseUsd } from "../../../lib/price";
import type { KeySummary } from "../../../lib/types";
import { useNear } from "../providers";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const USDC = process.env.NEXT_PUBLIC_NEAR_USDC_ID ?? "";

export default function KeysPage() {
  const { accountId, connect, sign, send } = useNear();
  const [keys, setKeys] = useState<KeySummary[]>([]);
  const [wallet, setWallet] = useState<bigint>(0n);
  const [created, setCreated] = useState<string | null>(null);
  const [amount, setAmount] = useState("10");
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    setError(null);
    const [walletResponse, envelope] = await Promise.all([
      fetch(`/api/v1/wallet?account=${encodeURIComponent(accountId)}`),
      sign("list_keys"),
    ]);
    const walletBody = (await walletResponse.json()) as { wallet_usd_micro?: string };
    setWallet(BigInt(walletBody.wallet_usd_micro ?? "0"));
    if (!envelope) return;
    const response = await fetch(`/api/v1/keys?${new URLSearchParams(envelope)}`);
    if (!response.ok) {
      setError("could not list keys");
      return;
    }
    const body = (await response.json()) as { keys: KeySummary[] };
    setKeys(body.keys);
  }, [accountId, sign]);

  useEffect(() => {
    void load();
  }, [load]);

  const fund = async () => {
    const micro = parseUsd(amount);
    if (micro === null) {
      setError("invalid amount");
      return;
    }
    setBusy(true);
    const ok = await send([
      {
        receiverId: USDC,
        actions: [
          {
            type: "FunctionCall",
            params: {
              methodName: "ft_transfer_call",
              args: { receiver_id: CORE, amount: micro.toString(), msg: JSON.stringify({ fund: {} }) },
              gas: "100000000000000",
              deposit: "1",
            },
          },
        ],
      },
    ]);
    setBusy(false);
    if (!ok) {
      setError("the transfer was not signed");
      return;
    }
    await load();
  };

  const withdraw = async () => {
    const micro = parseUsd(amount);
    if (micro === null) {
      setError("invalid amount");
      return;
    }
    setBusy(true);
    const ok = await send([
      {
        receiverId: CORE,
        actions: [
          {
            type: "FunctionCall",
            params: { methodName: "withdraw", args: { amount: micro.toString(), to: null }, gas: "50000000000000", deposit: "1" },
          },
        ],
      },
    ]);
    setBusy(false);
    if (!ok) {
      setError("the withdrawal was not signed");
      return;
    }
    await load();
  };

  const create = async () => {
    setError(null);
    const envelope = await sign("create_key");
    if (!envelope) return;
    const response = await fetch("/api/v1/keys", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
    });
    const body = (await response.json()) as { key?: string; error?: { message: string } };
    if (!body.key) {
      setError(body.error?.message ?? "could not create a key");
      return;
    }
    setCreated(body.key);
    await load();
  };

  const raise = async (key: KeySummary) => {
    const micro = parseUsd(limits[key.key_id] ?? (key.cap ? formatMicroPerMtok(BigInt(key.cap.per_day_usd_micro)) : "5"));
    if (micro === null || !key.cap_key) {
      setError("invalid limit");
      return;
    }
    const ok = await send([
      {
        receiverId: CORE,
        actions: [
          {
            type: "FunctionCall",
            params: { methodName: "set_cap", args: { key: key.cap_key, per_day: micro.toString() }, gas: "30000000000000", deposit: "1" },
          },
        ],
      },
    ]);
    if (!ok) {
      setError("the limit was not signed");
      return;
    }
    await load();
  };

  const revoke = async (key: KeySummary) => {
    const envelope = await sign("revoke_key", { key_id: key.key_id });
    if (!envelope) return;
    const response = await fetch("/api/v1/keys/revoke", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
    });
    if (!response.ok) {
      const body = (await response.json()) as { error?: { message: string } };
      setError(body.error?.message ?? "could not revoke the key");
      return;
    }
    await load();
  };

  if (!accountId) {
    return (
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
        <h1 className="text-3xl font-semibold">Wallet</h1>
        <p className="text-[#555]">Connect a NEAR wallet to hold USDC and manage agent keys.</p>
        <button type="button" onClick={() => void connect()} className="h-10 w-fit rounded-[6px] bg-black px-5 font-semibold text-white">
          Connect
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Wallet</h1>
          <p className="text-[#555]">{accountId}</p>
        </div>
        <p className="text-2xl tabular-nums">{formatUsd(wallet)}</p>
      </header>

      <section className="flex flex-wrap items-end gap-3 rounded-[8px] border border-[#CECECE] p-5">
        <label className="flex flex-col gap-1 text-sm">
          Amount (USDC)
          <input value={amount} onChange={(event) => setAmount(event.target.value)} className="h-10 w-32 rounded-[6px] border border-[#CECECE] px-3 tabular-nums" />
        </label>
        <button type="button" disabled={busy} onClick={() => void fund()} className="h-10 rounded-[6px] bg-black px-4 font-semibold text-white disabled:bg-[#D4D4D4]">
          Fund
        </button>
        <button type="button" disabled={busy} onClick={() => void withdraw()} className="h-10 rounded-[6px] border border-[#CECECE] px-4 font-semibold disabled:text-[#999]">
          Withdraw
        </button>
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Agents</h2>
          <button type="button" onClick={() => void create()} className="h-10 rounded-[6px] bg-black px-4 font-semibold text-white">
            Create key
          </button>
        </div>

        {created && (
          <div className="rounded-[8px] border border-[#1743FF] p-4">
            <p className="text-sm text-[#555]">Copy this now. It is shown once.</p>
            <code className="mt-2 block break-all font-mono text-sm">{created}</code>
          </div>
        )}

        {keys.length === 0 && <p className="text-[#555]">No keys yet. Create one and give it to an agent.</p>}

        {keys.map((key) => (
          <article key={key.key_id} className="grid gap-3 rounded-[8px] border border-[#CECECE] p-5 md:grid-cols-[1fr_auto]">
            <div className="flex flex-col gap-1">
              <p className="font-semibold">{key.name}</p>
              <p className="text-sm text-[#555] tabular-nums">
                float {formatUsd(BigInt(key.float_usd_micro))}
                {key.cap && ` · ${formatUsd(BigInt(key.cap.left_usd_micro))} of ${formatUsd(BigInt(key.cap.per_day_usd_micro))} left today`}
              </p>
              <code className="text-xs text-[#777]">{key.key_id}</code>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <input
                value={limits[key.key_id] ?? (key.cap ? formatMicroPerMtok(BigInt(key.cap.per_day_usd_micro)) : "5")}
                onChange={(event) => setLimits({ ...limits, [key.key_id]: event.target.value })}
                className="h-10 w-24 rounded-[6px] border border-[#CECECE] px-3 tabular-nums"
              />
              <button type="button" onClick={() => void raise(key)} className="h-10 rounded-[6px] border border-[#CECECE] px-3 font-semibold">
                Set limit
              </button>
              <button type="button" onClick={() => void revoke(key)} className="h-10 rounded-[6px] border border-[#CECECE] px-3 text-[#B00020]">
                Revoke
              </button>
            </div>
          </article>
        ))}
      </section>

      {error && <p className="text-sm text-[#B00020]">{error}</p>}
    </main>
  );
}
