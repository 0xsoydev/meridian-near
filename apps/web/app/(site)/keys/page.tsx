"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { CopyButton } from "../../../components/copy-button";
import {
  CommitButton,
  DANGER,
  Empty,
  Field,
  INPUT,
  INPUT_SM,
  LINK,
  PAGE,
  PageHeader,
  Panel,
  ROW,
  SECONDARY,
  Select,
  Skeleton,
  TD,
  Table,
  Toggle,
} from "../../../components/kit";
import { KEY_STORAGE, api, explorer, usd } from "../../../lib/client";
import { formatMicroPerMtok, parseUsd } from "../../../lib/price";
import type { CreateKeyResult, IntentQuote, IntentStatus, IntentToken, KeySummary } from "../../../lib/types";
import { useNear, type NearTransaction, type Signed } from "../providers";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const USDC = process.env.NEXT_PUBLIC_NEAR_USDC_ID ?? "";
const ENVELOPE_MS = 240_000;
const STORAGE_DEPOSIT = "1250000000000000000000";

type Direction = "deposit" | "withdraw";
type Route = "near" | "chain";
type Notice = { tone: "up" | "down"; text: string };

const LIVE: ReadonlyArray<IntentStatus> = ["PENDING_DEPOSIT", "PROCESSING"];

function call(receiverId: string, methodName: string, args: object, gas: string, deposit: string): NearTransaction {
  return { receiverId, actions: [{ type: "FunctionCall", params: { methodName, args, gas, deposit } }] };
}

function statusText(status: IntentStatus, direction: Direction): string {
  if (status === "PENDING_DEPOSIT") return direction === "deposit" ? "Waiting for your deposit." : "Waiting for the withdrawal to land.";
  if (status === "PROCESSING") return direction === "deposit" ? "Deposit seen. Converting to USDC on NEAR." : "Converting and sending to your address.";
  if (status === "SUCCESS") return direction === "deposit" ? "Done. The USDC is in your wallet." : "Done. The funds reached your address.";
  if (status === "INCOMPLETE_DEPOSIT") return "Received less than quoted. Send the rest, or wait for the refund.";
  if (status === "REFUNDED") return "Refunded to your address.";
  return "Failed. Any deposit is refunded.";
}

export default function WalletPage() {
  const { accountId, connect, sign, send } = useNear();
  const [wallet, setWallet] = useState<bigint | null>(null);
  const [keys, setKeys] = useState<KeySummary[] | null>(null);
  const [created, setCreated] = useState<CreateKeyResult | null>(null);
  const [createdLimit, setCreatedLimit] = useState("5");
  const [direction, setDirection] = useState<Direction>("deposit");
  const [route, setRoute] = useState<Route>("near");
  const [amount, setAmount] = useState("10");
  const [tokens, setTokens] = useState<IntentToken[]>([]);
  const [asset, setAsset] = useState("");
  const [address, setAddress] = useState("");
  const [quote, setQuote] = useState<IntentQuote | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<IntentStatus | null>(null);
  const [limits, setLimits] = useState<Record<string, string>>({});
  const [money, setMoney] = useState<Notice | null>(null);
  const [agents, setAgents] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const envelope = useRef<{ at: number; account: string; signed: Signed } | null>(null);

  useEffect(() => {
    setAsked(new URLSearchParams(window.location.search).get("key"));
    void api<{ data: IntentToken[] }>("/api/v1/quotes/tokens").then((result) => {
      if (!result.ok) return;
      const external = result.data.data.filter((token) => token.blockchain !== "near");
      setTokens(external);
      setAsset(external[0]?.assetId ?? "");
    });
  }, []);

  const readWallet = useCallback(async () => {
    if (!accountId) return;
    const result = await api<{ wallet_usd_micro: string }>(`/api/v1/wallet?account=${encodeURIComponent(accountId)}`);
    if (result.ok) setWallet(BigInt(result.data.wallet_usd_micro));
  }, [accountId]);

  useEffect(() => {
    setWallet(null);
    setKeys(null);
    envelope.current = null;
    void readWallet();
    if (!accountId) return;
    const id = window.setInterval(() => void readWallet(), 15_000);
    return () => window.clearInterval(id);
  }, [accountId, readWallet]);

  useEffect(() => {
    if (!quote || (quoteStatus !== null && !LIVE.includes(quoteStatus))) return;
    const id = window.setInterval(() => {
      void api<{ status: IntentStatus }>(`/api/v1/quotes/${quote.depositAddress}`).then((result) => {
        if (!result.ok) return;
        setQuoteStatus(result.data.status);
        if (result.data.status === "SUCCESS") void readWallet();
      });
    }, 5_000);
    return () => window.clearInterval(id);
  }, [quote, quoteStatus, readWallet]);

  const listKeys = async (prompt: boolean) => {
    if (!accountId) return;
    const cached = envelope.current;
    let signed = cached && cached.account === accountId && Date.now() - cached.at < ENVELOPE_MS ? cached.signed : null;
    if (!signed) {
      if (!prompt) return;
      setBusy("list");
      signed = await sign("list_keys");
      setBusy(null);
      if (!signed) {
        setAgents({ tone: "down", text: "The wallet didn't sign, so your agents stay hidden." });
        return;
      }
      envelope.current = { at: Date.now(), account: accountId, signed };
    }
    const result = await api<{ keys: KeySummary[] }>(`/api/v1/keys?${new URLSearchParams(signed)}`);
    if (result.ok) setKeys(result.data.keys);
    else setAgents({ tone: "down", text: result.message });
  };

  const transact = async (label: string, transactions: NearTransaction[], done: string, notify: (notice: Notice) => void) => {
    setBusy(label);
    const ok = await send(transactions);
    setBusy(null);
    notify(ok ? { tone: "up", text: done } : { tone: "down", text: "The wallet didn't sign, or the transaction failed. Nothing moved." });
    if (!ok) return false;
    await readWallet();
    return true;
  };

  const moveOnNear = async () => {
    const micro = parseUsd(amount);
    if (micro === null || micro === 0n) {
      setMoney({ tone: "down", text: "Enter an amount in USDC, like 10." });
      return;
    }
    if (direction === "withdraw" && wallet !== null && micro > wallet) {
      setMoney({ tone: "down", text: `Your wallet holds ${usd(wallet)}.` });
      return;
    }
    if (direction === "deposit") {
      await transact(
        "move",
        [call(USDC, "ft_transfer_call", { receiver_id: CORE, amount: micro.toString(), msg: JSON.stringify({ fund: {} }) }, "100000000000000", "1")],
        `Deposited ${usd(micro)}. Agents can spend it within their limits.`,
        setMoney,
      );
      return;
    }
    await transact(
      "move",
      [
        call(USDC, "storage_deposit", { account_id: accountId, registration_only: true }, "30000000000000", STORAGE_DEPOSIT),
        call(CORE, "withdraw", { amount: micro.toString(), to: null }, "50000000000000", "1"),
      ],
      `Sent ${usd(micro)} to ${accountId}.`,
      setMoney,
    );
  };

  const quoteChain = async () => {
    const micro = parseUsd(amount);
    if (micro === null || micro === 0n || !asset || !address.trim()) {
      setMoney({
        tone: "down",
        text: direction === "deposit" ? "Pick a chain, an amount and your refund address." : "Pick a chain, an amount and the destination address.",
      });
      return;
    }
    setBusy("quote");
    setMoney(null);
    setQuote(null);
    setQuoteStatus(null);
    const result = await api<IntentQuote>("/api/v1/quotes", {
      method: "POST",
      body: JSON.stringify(
        direction === "deposit"
          ? { kind: "fund", owner: accountId, originAsset: asset, amount: micro.toString(), refundTo: address.trim() }
          : { kind: "withdraw", account: accountId, destinationAsset: asset, amount: micro.toString(), recipient: address.trim() },
      ),
    });
    setBusy(null);
    if (result.ok) setQuote(result.data);
    else setMoney({ tone: "down", text: result.message });
  };

  const sendChainWithdraw = async () => {
    const micro = parseUsd(amount);
    if (micro === null || !quote) return;
    const ok = await transact(
      "move",
      [
        call(USDC, "storage_deposit", { account_id: quote.depositAddress, registration_only: true }, "30000000000000", STORAGE_DEPOSIT),
        call(CORE, "withdraw", { amount: micro.toString(), to: quote.depositAddress }, "50000000000000", "1"),
      ],
      "Sent. The bridge forwards it once it lands.",
      setMoney,
    );
    if (ok) setQuoteStatus("PENDING_DEPOSIT");
  };

  const createKey = async () => {
    setAgents(null);
    setBusy("create");
    const signed = await sign("create_key");
    if (!signed) {
      setBusy(null);
      setAgents({ tone: "down", text: "The wallet didn't sign, so no key was created." });
      return;
    }
    const result = await api<CreateKeyResult>("/api/v1/keys", { method: "POST", body: JSON.stringify(signed) });
    setBusy(null);
    if (!result.ok) {
      setAgents({ tone: "down", text: result.message });
      return;
    }
    setCreated(result.data);
    await listKeys(false);
  };

  const limitCreated = async () => {
    if (!created) return;
    const micro = parseUsd(createdLimit);
    if (micro === null || micro === 0n) {
      setAgents({ tone: "down", text: "Enter a daily limit in USDC, like 5." });
      return;
    }
    const ok = await transact(
      "limit-new",
      [call(CORE, "set_cap", { key: created.key_id, per_day: micro.toString() }, "30000000000000", "1")],
      `The new key can spend ${usd(micro)} a day.`,
      setAgents,
    );
    if (ok) await listKeys(false);
  };

  const setLimit = async (key: KeySummary) => {
    const fallback = key.cap ? formatMicroPerMtok(BigInt(key.cap.per_day_usd_micro)) : "5";
    const micro = parseUsd(limits[key.key_id] ?? fallback);
    if (micro === null || !key.cap_key) {
      setAgents({ tone: "down", text: "Enter a daily limit in USDC, like 5." });
      return;
    }
    const ok = await transact(
      `limit-${key.key_id}`,
      [call(CORE, "set_cap", { key: key.cap_key, per_day: micro.toString() }, "30000000000000", "1")],
      `${key.name || "The agent"} can now spend ${usd(micro)} a day.`,
      setAgents,
    );
    if (ok) await listKeys(false);
  };

  const revoke = async (key: KeySummary) => {
    if (!window.confirm(`Revoke ${key.name || "this key"}? Its prepaid MTokens are forfeited, and its float is refunded in the next payout.`)) return;
    setBusy(`revoke-${key.key_id}`);
    const signed = await sign("revoke_key", { key_id: key.key_id });
    if (!signed) {
      setBusy(null);
      setAgents({ tone: "down", text: "The wallet didn't sign, so the key still works." });
      return;
    }
    const result = await api<unknown>("/api/v1/keys/revoke", { method: "POST", body: JSON.stringify(signed) });
    setBusy(null);
    setAgents(result.ok ? { tone: "up", text: `Revoked ${key.name || "the key"}. It stops working now.` } : { tone: "down", text: result.message });
    if (result.ok) await listKeys(false);
  };

  if (!accountId) {
    return (
      <div className={PAGE}>
        <PageHeader title="Your wallet">
          USDC on NEAR that you and your agents spend from. Every agent gets its own key and a daily limit enforced on chain.
        </PageHeader>
        <div>
          <CommitButton onClick={() => void connect()}>Connect wallet</CommitButton>
        </div>
      </div>
    );
  }

  const chainVerb = direction === "deposit" ? "Get a deposit address" : "Get a quote";

  return (
    <div className={PAGE}>
      <header className="flex flex-col gap-3 border-b border-line pb-8">
        <p className="text-[13px] text-muted">Wallet balance</p>
        {wallet === null ? (
          <Skeleton className="h-14 w-56" />
        ) : (
          <h1 className="font-serif text-[48px] leading-none tracking-[-0.01em] text-ink lg:text-[64px]">{usd(wallet)}</h1>
        )}
        <p className="text-[14px] text-muted">
          USDC on {CORE || "core"}, held for{" "}
          <a href={explorer("address", accountId)} target="_blank" rel="noreferrer" className={`${LINK} text-ink`}>
            {accountId}
          </a>
        </p>
      </header>

      <div className="grid gap-12 lg:grid-cols-[400px_minmax(0,1fr)]">
        <Panel title="Move money" bodyClassName="flex flex-col gap-5 pt-5">
          <Toggle
            big
            label="Direction"
            value={direction}
            onChange={(next) => {
              setDirection(next);
              setQuote(null);
              setQuoteStatus(null);
              setMoney(null);
            }}
            items={[
              { value: "deposit", label: "Deposit" },
              { value: "withdraw", label: "Withdraw" },
            ]}
          />
          <Toggle
            label="Route"
            value={route}
            onChange={(next) => {
              setRoute(next);
              setQuote(null);
              setQuoteStatus(null);
              setMoney(null);
            }}
            items={[
              { value: "near", label: direction === "deposit" ? "From NEAR" : "To NEAR" },
              { value: "chain", label: direction === "deposit" ? "From another chain" : "To another chain" },
            ]}
          />
          {route === "chain" ? (
            tokens.length === 0 ? (
              <p className="text-[13px] text-muted">Cross-chain routes are unavailable right now. Use a NEAR route.</p>
            ) : (
              <Field label={direction === "deposit" ? "From" : "To"}>
                <Select value={asset} onChange={(event) => setAsset(event.target.value)}>
                  {tokens.map((token) => (
                    <option key={token.assetId} value={token.assetId}>
                      {token.symbol} on {token.blockchain}
                    </option>
                  ))}
                </Select>
              </Field>
            )
          ) : null}
          <Field label="Amount (USDC)">
            <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" autoComplete="off" className={INPUT} />
          </Field>
          {route === "chain" ? (
            <Field
              label={direction === "deposit" ? "Your address on that chain" : "Destination address"}
              note={direction === "deposit" ? "Refunds go here if the deposit can't complete." : "Double-check it. Transfers can't be reversed."}
            >
              <input
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={`${INPUT} font-mono text-[13px]`}
              />
            </Field>
          ) : null}

          {route === "near" ? (
            <CommitButton disabled={busy !== null} aria-busy={busy === "move"} onClick={() => void moveOnNear()} className="self-start">
              {busy === "move" ? "Waiting for the wallet" : `${direction === "deposit" ? "Deposit" : "Withdraw"} ${amount || "0"} USDC`}
            </CommitButton>
          ) : quote === null ? (
            <CommitButton disabled={busy !== null || tokens.length === 0} aria-busy={busy === "quote"} onClick={() => void quoteChain()} className="self-start">
              {busy === "quote" ? "Asking the bridge" : chainVerb}
            </CommitButton>
          ) : direction === "deposit" ? (
            <div className="flex flex-col gap-3 border border-line p-4">
              <p className="text-[13px] text-muted">Send at least {usd(BigInt(quote.amountIn))} to</p>
              <code className="break-all font-mono text-[13px] text-ink">{quote.depositAddress}</code>
              <div className="flex flex-wrap items-center gap-3">
                <CopyButton value={quote.depositAddress} label="Copy address" />
                <span role="status" className="text-[13px] text-ink">
                  {statusText(quoteStatus ?? "PENDING_DEPOSIT", direction)}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 border border-line p-4">
              <p className="text-[13px] text-ink">
                {usd(BigInt(quote.amountOut))} arrives at your address after the bridge fee.
              </p>
              {quoteStatus === null ? (
                <CommitButton disabled={busy !== null} aria-busy={busy === "move"} onClick={() => void sendChainWithdraw()} className="self-start">
                  {busy === "move" ? "Waiting for the wallet" : `Send ${amount} USDC`}
                </CommitButton>
              ) : (
                <p role="status" className="text-[13px] text-ink">
                  {statusText(quoteStatus, direction)}
                </p>
              )}
            </div>
          )}
          {money ? (
            <p role="status" className={`text-[13px] leading-[20px] ${money.tone === "up" ? "text-up" : "text-down"}`}>
              {money.text}
            </p>
          ) : null}
          <p className="text-[12px] leading-[18px] text-muted">
            {route === "near"
              ? direction === "deposit"
                ? "Moves USDC from your NEAR account into Meridian."
                : "If your account has never held USDC, the wallet also pays 0.00125 NEAR to register it. Registered accounts get that back."
              : "Routed by NEAR Intents 1Click. The quote holds for a few minutes."}
          </p>
        </Panel>

        <Panel
          title="Agents"
          aside={
            <button type="button" disabled={busy !== null} onClick={() => void createKey()} className={SECONDARY}>
              {busy === "create" ? "Waiting for the wallet" : "Create key"}
            </button>
          }
          bodyClassName="flex flex-col gap-4 pt-4"
        >
          {created ? (
            <div className="flex flex-col gap-3 border border-line p-4">
              <p className="text-[13px] text-ink">Copy this key now. It is shown once.</p>
              <code className="break-all font-mono text-[13px] text-ink">{created.key}</code>
              <div className="flex flex-wrap gap-2">
                <CopyButton value={created.key} label="Copy key" />
                <button
                  type="button"
                  onClick={() => {
                    localStorage.setItem(KEY_STORAGE, created.key);
                    setAgents({ tone: "up", text: "Saved in this browser. The Trade page uses it now." });
                  }}
                  className={SECONDARY}
                >
                  Use in this browser
                </button>
                <button type="button" onClick={() => setCreated(null)} className={SECONDARY}>
                  I saved it
                </button>
              </div>
              <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                <div className="flex items-end gap-2">
                  <Field label="Daily limit (USDC)" className="w-40">
                    <input
                      value={createdLimit}
                      onChange={(event) => setCreatedLimit(event.target.value)}
                      inputMode="decimal"
                      autoComplete="off"
                      className={INPUT_SM}
                    />
                  </Field>
                  <button type="button" disabled={busy !== null} onClick={() => void limitCreated()} className={SECONDARY}>
                    {busy === "limit-new" ? "Signing" : "Set limit"}
                  </button>
                </div>
                <p className="text-[12px] leading-[18px] text-muted">It can&apos;t spend until it has a daily limit.</p>
              </div>
            </div>
          ) : null}

          {keys === null ? (
            <Empty start
              action={
                <button type="button" disabled={busy !== null} onClick={() => void listKeys(true)} className={SECONDARY}>
                  {busy === "list" ? "Waiting for the wallet" : "Show my agents"}
                </button>
              }
            >
              {asked
                ? "An agent asked for a higher limit. Sign once to see your agents. Nothing goes on chain."
                : "Sign once to see your agents. It proves this wallet owns them, and nothing goes on chain."}
            </Empty>
          ) : keys.length === 0 ? (
            <Empty start>No agents yet. Create a key, then give it to an agent with a daily limit.</Empty>
          ) : (
            <Table
              minWidth={600}
              columns={[{ label: "Agent" }, { label: "Float", end: true }, { label: "Spent today" }, { label: "Daily limit (USDC)" }, { label: "" }]}
            >
              {keys.map((key) => {
                const used = key.cap ? BigInt(key.cap.used_today_usd_micro) : 0n;
                const per = key.cap ? BigInt(key.cap.per_day_usd_micro) : 0n;
                const width = per > 0n ? Math.min(100, Number((used * 100n) / per)) : 0;
                return (
                  <tr key={key.key_id} className={`${ROW} ${asked === key.key_id ? "bg-accent/5" : ""}`}>
                    <td className={`${TD} max-w-[200px] truncate`} title={key.key_id}>
                      {key.name || "Unnamed key"}
                    </td>
                    <td className={`${TD} text-right`}>{usd(BigInt(key.float_usd_micro))}</td>
                    <td className={TD}>
                      {key.cap ? (
                        <div className="flex items-center gap-2">
                          <span aria-hidden className="relative h-1 w-16 bg-hover">
                            <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${width}%` }} />
                          </span>
                          <span>
                            {usd(used)} of {usd(per)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted">No limit set</span>
                      )}
                    </td>
                    <td className={TD}>
                      {key.cap_key ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            value={limits[key.key_id] ?? (key.cap ? formatMicroPerMtok(per) : "5")}
                            onChange={(event) => setLimits((all) => ({ ...all, [key.key_id]: event.target.value }))}
                            inputMode="decimal"
                            aria-label={`Daily limit for ${key.name || "this key"}, in USDC`}
                            className={`${INPUT_SM} w-20`}
                          />
                          <button type="button" disabled={busy !== null} onClick={() => void setLimit(key)} className={SECONDARY}>
                            {busy === `limit-${key.key_id}` ? "Signing" : "Set"}
                          </button>
                        </div>
                      ) : (
                        <span className="text-muted">Not approved yet</span>
                      )}
                    </td>
                    <td className={`${TD} text-right`}>
                      <button type="button" disabled={busy !== null} onClick={() => void revoke(key)} className={DANGER}>
                        {busy === `revoke-${key.key_id}` ? "Revoking" : "Revoke"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )}
          {agents ? (
            <p role="status" className={`text-[13px] leading-[20px] ${agents.tone === "up" ? "text-up" : "text-down"}`}>
              {agents.text}
            </p>
          ) : null}
          <p className="text-[12px] leading-[18px] text-muted">
            Agents never hold your NEAR key. They spend through their router key, inside the daily limit you set on chain.{" "}
            <Link href="/agents" className={LINK}>
              Connect an agent
            </Link>
          </p>
        </Panel>
      </div>
    </div>
  );
}
