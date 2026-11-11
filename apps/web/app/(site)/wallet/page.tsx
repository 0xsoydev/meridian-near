"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { z } from "zod";
import { ConfirmButton } from "../../../components/confirm-button";
import { CopyButton } from "../../../components/copy-button";
import {
  CommitButton,
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
import { CHAINS, KEY_STORAGE, api, chainName, evmTransfer, explorer, paymentUri, railName, usd } from "../../../lib/client";
import { formatMicroPerMtok, formatMtok, parseUsd, stampFormat } from "../../../lib/price";
import type { CreateKeyResult, IntentQuote, IntentStatus, IntentToken, KeySummary, OwnerUsage, VenueStatus } from "../../../lib/types";
import {
  anything,
  createKeySchema,
  intentQuoteSchema,
  intentStatusSchema,
  intentTokensSchema,
  keyListSchema,
  returnedSchema,
  statusSchema,
  walletSchema,
} from "../../../lib/wire";
import { latestBlockhash, solTransfer, splTransfer, tokenProgram } from "../../../lib/solana";
import { useNear, type EvmWallet, type NearTransaction, type Signed } from "../providers";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const USDC = process.env.NEXT_PUBLIC_NEAR_USDC_ID ?? "";
const MAINNET = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet";
const ENVELOPE_MS = 240_000;
const STORAGE_DEPOSIT = "1250000000000000000000";
const MIN_DEPOSIT = 100_000n;

type Direction = "deposit" | "withdraw";
type Route = "near" | "chain";
type Notice = { tone: "up" | "down" | "plain"; text: string; tx?: string | null | undefined };
type Balances = { wallet: bigint; near: bigint };

const LIVE: ReadonlyArray<IntentStatus> = ["PENDING_DEPOSIT", "PROCESSING"];
const ORDER = Object.keys(CHAINS);

type Preview = { key: string } & ({ quote: IntentQuote } | { error: string });

const accountsSchema = z.tuple([z.string()]).rest(z.string());
const walletErrorSchema = z.object({ code: z.number().optional(), message: z.string().optional() });

function rank(code: string): number {
  const at = ORDER.indexOf(code);
  return at === -1 ? ORDER.length : at;
}

const STEPS = [
  ["Deposit", "USDC from your NEAR account, or any token from another chain through NEAR Intents."],
  ["Give each agent a key", "Every key gets a daily limit that the contract enforces, so an agent can't overspend."],
  ["Withdraw any time", "Back to your NEAR account or another chain. A revoked key's balance returns in the next payout."],
] as const;

function call(receiverId: string, methodName: string, args: object, gas: string, deposit: string): NearTransaction {
  return { receiverId, actions: [{ type: "FunctionCall", params: { methodName, args, gas, deposit } }] };
}

function plain(micro: bigint): string {
  return formatMicroPerMtok(micro).replaceAll(",", "");
}

function statusText(status: IntentStatus, direction: Direction, chain: string, sent: boolean): string {
  if (status === "PENDING_DEPOSIT") {
    if (direction === "withdraw") return "Waiting for the withdrawal to land.";
    return sent ? `Paid. Waiting for ${chain} to confirm.` : `Waiting for your deposit on ${chain}.`;
  }
  if (status === "PROCESSING") return direction === "deposit" ? "Deposit seen. Converting to USDC." : `Converting and sending to your address on ${chain}.`;
  if (status === "SUCCESS") return direction === "deposit" ? "Done. The USDC is in your Meridian wallet." : `Done. The funds reached your address on ${chain}.`;
  if (status === "INCOMPLETE_DEPOSIT") return "Received less than quoted. Send the rest, or wait for the refund.";
  if (status === "REFUNDED") return `Refunded to your address on ${chain}.`;
  return "Failed. Any deposit is refunded.";
}

function Said({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <p role="status" className={`text-[13px] leading-[20px] ${notice.tone === "up" ? "text-up" : notice.tone === "down" ? "text-down" : "text-ink"}`}>
      {notice.text}{" "}
      {notice.tx ? (
        <a href={explorer("txns", notice.tx)} target="_blank" rel="noreferrer" className={LINK}>
          View transaction
        </a>
      ) : null}
    </p>
  );
}

function Cell({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`flex min-w-0 items-center justify-between gap-4 lg:block ${className}`}>
      <span className="text-[12px] text-muted lg:sr-only">{label}</span>
      <div className="min-w-0 text-right lg:text-left">{children}</div>
    </div>
  );
}

function Venue() {
  const [status, setStatus] = useState<VenueStatus | null>(null);
  useEffect(() => {
    void api("/api/v1/status", statusSchema).then((result) => {
      if (result.ok) setStatus(result.data);
    });
  }, []);
  const numbers: Array<[string, string]> = status
    ? [
        ["Markets open", `${status.markets.filter((market) => market.open).length} of ${status.markets.length}`],
        ["Fills in 24 h", status.venue.fills_24h.toString()],
        ["MTok traded in 24 h", formatMtok(BigInt(status.venue.volume_24h_tokens))],
        ["Seller payouts sent", status.payouts.executed.toString()],
      ]
    : [];
  return (
    <dl aria-busy={status === null} className="grid grid-cols-2 border-t border-line lg:grid-cols-4">
      {(status ? numbers : [["Markets open", ""], ["Fills in 24 h", ""], ["MTok traded in 24 h", ""], ["Seller payouts sent", ""]]).map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1 border-b border-line py-4 pr-4 lg:border-b-0">
          <dt className="text-[12px] text-muted">{label}</dt>
          <dd className="text-[20px] tabular-nums text-ink">{status ? value : <Skeleton className="h-7 w-16" />}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function WalletPage() {
  const { accountId, address: own, kind, connect, sign, send, evmWallets: wallets, solanaWallets, solanaSend } = useNear();
  const viaNear = kind === null || kind === "near";
  const [balances, setBalances] = useState<Balances | null>(null);
  const [keys, setKeys] = useState<KeySummary[] | null>(null);
  const [usage, setUsage] = useState<OwnerUsage[]>([]);
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
  const [preview, setPreview] = useState<Preview | null>(null);
  const [sent, setSent] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const envelope = useRef<{ at: number; account: string; signed: Signed } | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const addressRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setAsked(new URLSearchParams(window.location.search).get("key"));
    void api("/api/v1/quotes/tokens", intentTokensSchema).then((result) => {
      if (!result.ok) return;
      const external = result.data.data.filter((token) => token.blockchain !== "near");
      setTokens(external);
    });
  }, []);

  useEffect(() => {
    if (!viaNear) setRoute("chain");
  }, [viaNear]);

  useEffect(() => {
    const chain = kind === "solana" ? "sol" : "base";
    const preferred = tokens.find((token) => token.blockchain === chain && token.symbol === "USDC") ?? tokens[0];
    if (preferred) setAsset(preferred.assetId);
  }, [kind, tokens]);

  useEffect(() => {
    const token = tokens.find((item) => item.assetId === asset);
    const fits = token !== undefined && ((kind === "evm" && (CHAINS[token.blockchain]?.evm ?? null) !== null) || (kind === "solana" && token.blockchain === "sol"));
    if (own) setAddress((current) => (current === "" || current === own ? (fits ? own : "") : current));
  }, [asset, tokens, kind, own]);

  const readWallet = useCallback(async (): Promise<Balances | null> => {
    if (!accountId) return null;
    const result = await api(`/api/v1/wallet?account=${encodeURIComponent(accountId)}`, walletSchema);
    if (!result.ok) return null;
    const next = { wallet: BigInt(result.data.wallet_usd_micro), near: BigInt(result.data.near_usdc_micro) };
    setBalances(next);
    return next;
  }, [accountId]);

  useEffect(() => {
    setBalances(null);
    setKeys(null);
    setUsage([]);
    envelope.current = null;
    void readWallet();
    if (!accountId) return;
    const id = window.setInterval(() => void readWallet(), 15_000);
    return () => window.clearInterval(id);
  }, [accountId, readWallet]);

  useEffect(() => {
    const address = quote?.depositAddress;
    if (!quote || !address || (quoteStatus !== null && !LIVE.includes(quoteStatus))) return;
    const memo = quote.depositMemo ? `?memo=${encodeURIComponent(quote.depositMemo)}` : "";
    const id = window.setInterval(() => {
      void api(`/api/v1/quotes/${address}${memo}`, intentStatusSchema).then((result) => {
        if (!result.ok) return;
        setQuoteStatus(result.data.status);
        if (result.data.status === "SUCCESS") void readWallet();
      });
    }, 5_000);
    return () => window.clearInterval(id);
  }, [quote, quoteStatus, readWallet]);

  useEffect(() => {
    const micro = parseUsd(amount);
    if (route !== "chain" || direction !== "deposit" || !asset || !accountId || micro === null || micro === 0n) return;
    const key = `${asset}:${amount}`;
    let live = true;
    const id = window.setTimeout(() => {
      void api("/api/v1/quotes", intentQuoteSchema, {
        method: "POST",
        body: JSON.stringify({ kind: "fund", owner: accountId, originAsset: asset, amount: micro.toString(), dry: true }),
      }).then((result) => {
        if (live) setPreview(result.ok ? { key, quote: result.data } : { key, error: result.message });
      });
    }, 400);
    return () => {
      live = false;
      window.clearTimeout(id);
    };
  }, [route, direction, asset, amount, accountId]);

  useEffect(() => {
    const token = tokens.find((item) => item.assetId === asset);
    if (!quote?.depositAddress || direction !== "deposit" || !token) {
      setQr(null);
      return;
    }
    let live = true;
    void QRCode.toDataURL(paymentUri(token, quote) ?? quote.depositAddress, { margin: 1, width: 224 }).then((url) => {
      if (live) setQr(url);
    });
    return () => {
      live = false;
    };
  }, [quote, asset, tokens, direction]);

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
    const result = await api(`/api/v1/keys?${new URLSearchParams(signed)}`, keyListSchema);
    if (result.ok) {
      setKeys(result.data.keys);
      setUsage(result.data.usage);
    } else {
      setAgents({ tone: "down", text: result.message });
    }
  };

  const transact = async (label: string, transactions: NearTransaction[], done: string, notify: (notice: Notice) => void) => {
    setBusy(label);
    const sent = await send(transactions);
    setBusy(null);
    notify(
      "hashes" in sent
        ? { tone: "up", text: done, tx: sent.hashes.at(-1) }
        : { tone: "down", text: sent.failure ?? "The wallet didn't sign, or the transaction failed. Nothing moved." },
    );
    return "hashes" in sent ? sent.hashes : null;
  };

  const flagMoney = (text: string, field: "amount" | "address") => {
    setMoney({ tone: "down", text });
    (field === "amount" ? amountRef : addressRef).current?.focus();
  };

  const moveOnNear = async () => {
    const micro = parseUsd(amount);
    if (micro === null || micro === 0n) return flagMoney("Enter an amount in USDC, like 10.", "amount");
    if (direction === "deposit" && micro < MIN_DEPOSIT) return flagMoney(`Deposits start at ${usd(MIN_DEPOSIT)}.`, "amount");
    if (direction === "deposit" && balances && micro > balances.near) {
      return flagMoney(`Your NEAR account holds ${usd(balances.near)} USDC.`, "amount");
    }
    if (direction === "withdraw" && balances && micro > balances.wallet) return flagMoney(`Your wallet holds ${usd(balances.wallet)}.`, "amount");
    const before = balances?.wallet ?? null;
    if (direction === "deposit") {
      const hashes = await transact(
        "move",
        [call(USDC, "ft_transfer_call", { receiver_id: CORE, amount: micro.toString(), msg: JSON.stringify({ fund: {} }) }, "100000000000000", "1")],
        `Deposited ${usd(micro)}. Agents can spend it within their limits.`,
        setMoney,
      );
      if (!hashes) return;
      const after = await readWallet();
      if (after && before !== null && after.wallet <= before) {
        setMoney({ tone: "down", text: "The transfer went through but Meridian returned it, so your wallet is unchanged.", tx: hashes.at(-1) });
      }
      return;
    }
    const hashes = await transact(
      "move",
      [
        call(USDC, "storage_deposit", { account_id: accountId, registration_only: true }, "30000000000000", STORAGE_DEPOSIT),
        call(CORE, "withdraw", { amount: micro.toString(), to: null }, "50000000000000", "1"),
      ],
      `Sent ${usd(micro)} to ${accountId}.`,
      setMoney,
    );
    if (hashes) await readWallet();
  };

  const quoteChain = async () => {
    const micro = parseUsd(amount);
    if (micro === null || micro === 0n) return flagMoney("Enter an amount in USDC, like 10.", "amount");
    if (!address.trim()) {
      return flagMoney(direction === "deposit" ? "Enter your address on that chain for refunds." : "Enter the destination address.", "address");
    }
    setBusy("quote");
    setMoney(null);
    setQuote(null);
    setQuoteStatus(null);
    const result = await api("/api/v1/quotes", intentQuoteSchema, {
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
    const target = quote?.depositAddress;
    if (micro === null || !target) return;
    const hashes = await transact(
      "move",
      [
        call(USDC, "storage_deposit", { account_id: target, registration_only: true }, "30000000000000", STORAGE_DEPOSIT),
        call(CORE, "withdraw", { amount: micro.toString(), to: target }, "50000000000000", "1"),
      ],
      "Sent. The bridge forwards it once it lands.",
      setMoney,
    );
    if (!hashes) return;
    setQuoteStatus("PENDING_DEPOSIT");
    await readWallet();
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
    const result = await api("/api/v1/keys", createKeySchema, { method: "POST", body: JSON.stringify(signed) });
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
    const hashes = await transact(
      "limit-new",
      [call(CORE, "set_cap", { key: created.key_id, per_day: micro.toString() }, "30000000000000", "1")],
      `The new key can spend ${usd(micro)} a day.`,
      setAgents,
    );
    if (hashes) await listKeys(false);
  };

  const setLimit = async (key: KeySummary) => {
    const fallback = key.cap ? plain(BigInt(key.cap.per_day_usd_micro)) : "5";
    const micro = parseUsd(limits[key.key_id] ?? fallback);
    if (micro === null || !key.cap_key) {
      setAgents({ tone: "down", text: "Enter a daily limit in USDC, like 5." });
      return;
    }
    const hashes = await transact(
      `limit-${key.key_id}`,
      [call(CORE, "set_cap", { key: key.cap_key, per_day: micro.toString() }, "30000000000000", "1")],
      `${key.name || "The agent"} can now spend ${usd(micro)} a day.`,
      setAgents,
    );
    if (hashes) await listKeys(false);
  };

  const revoke = async (key: KeySummary) => {
    setBusy(`revoke-${key.key_id}`);
    const signed = await sign("revoke_key", { key_id: key.key_id });
    if (!signed) {
      setBusy(null);
      setAgents({ tone: "down", text: "The wallet didn't sign, so the key still works." });
      return;
    }
    const result = await api("/api/v1/keys/revoke", anything, { method: "POST", body: JSON.stringify(signed) });
    setBusy(null);
    setAgents(result.ok ? { tone: "up", text: `Revoked ${key.name || "the key"}. It stops working now.` } : { tone: "down", text: result.message });
    if (result.ok) await listKeys(false);
  };

  const startOver = () => {
    setQuote(null);
    setQuoteStatus(null);
    setSent(false);
    setMoney(null);
  };

  const pay = async (wallet: EvmWallet) => {
    const token = tokens.find((item) => item.assetId === asset);
    const chainId = token ? CHAINS[token.blockchain]?.evm : null;
    if (!token || !chainId) return;
    const micro = parseUsd(amount);
    if (micro === null || micro === 0n) return flagMoney("Enter an amount in USDC, like 10.", "amount");
    const chain = chainName(token.blockchain);
    startOver();
    setBusy("pay");
    setMoney({ tone: "plain", text: `Confirm in ${wallet.name}.` });
    try {
      const [from] = accountsSchema.parse(await wallet.provider.request({ method: "eth_requestAccounts" }));
      setAddress(from);
      setMoney({ tone: "plain", text: "Getting a deposit address from NEAR Intents." });
      const result = await api("/api/v1/quotes", intentQuoteSchema, {
        method: "POST",
        body: JSON.stringify({ kind: "fund", owner: accountId, originAsset: asset, amount: micro.toString(), refundTo: from }),
      });
      if (!result.ok) {
        setMoney({ tone: "down", text: result.message });
        return;
      }
      const target = result.data.depositAddress;
      if (!target) {
        setMoney({ tone: "down", text: "NEAR Intents didn't give a deposit address. Nothing was sent." });
        return;
      }
      setQuote(result.data);
      setMoney({ tone: "plain", text: `Switch to ${chain} in ${wallet.name} to continue.` });
      await wallet.provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${chainId.toString(16)}` }] });
      setMoney({ tone: "plain", text: `Confirm the payment in ${wallet.name}.` });
      const hash = z
        .string()
        .parse(await wallet.provider.request({ method: "eth_sendTransaction", params: [evmTransfer(from, target, BigInt(result.data.amountIn), token.contractAddress)] }));
      setSent(true);
      setQuoteStatus("PENDING_DEPOSIT");
      setMoney(null);
      await api(`/api/v1/quotes/${target}`, anything, {
        method: "POST",
        body: JSON.stringify({ tx_hash: hash, ...(result.data.depositMemo ? { memo: result.data.depositMemo } : {}) }),
      });
    } catch (error) {
      payFailed(wallet.name, chain, error);
    } finally {
      setBusy(null);
    }
  };

  const payFailed = (name: string, chain: string, error: unknown) => {
    setQuote(null);
    setQuoteStatus(null);
    setSent(false);
    const failure = walletErrorSchema.safeParse(error);
    const code = failure.success ? failure.data.code : undefined;
    const reason = failure.success && failure.data.message ? failure.data.message : "it gave no reason";
    setMoney({
      tone: "down",
      text:
        code === 4001
          ? `You cancelled in ${name}. Nothing was sent.`
          : code === 4902
            ? `Add ${chain} to ${name}, then try again.`
            : error instanceof Error && !("code" in error)
              ? `${error.message}. Nothing was sent.`
              : `${name} stopped: ${reason}. Nothing was sent.`,
    });
  };

  const paySolana = async (name: string) => {
    const token = tokens.find((item) => item.assetId === asset);
    if (!token || token.blockchain !== "sol") return;
    const micro = parseUsd(amount);
    if (micro === null || micro === 0n) return flagMoney("Enter an amount in USDC, like 10.", "amount");
    startOver();
    setBusy("pay");
    setMoney({ tone: "plain", text: `Confirm in ${name}.` });
    try {
      let target = "";
      const signature = await solanaSend(name, async (from) => {
        setAddress(from);
        setMoney({ tone: "plain", text: "Getting a deposit address from NEAR Intents." });
        const result = await api("/api/v1/quotes", intentQuoteSchema, {
          method: "POST",
          body: JSON.stringify({ kind: "fund", owner: accountId, originAsset: asset, amount: micro.toString(), refundTo: from }),
        });
        if (!result.ok) throw new Error(result.message.replace(/\.$/, ""));
        if (!result.data.depositAddress) throw new Error("NEAR Intents didn't give a deposit address");
        target = result.data.depositAddress;
        setQuote(result.data);
        setMoney({ tone: "plain", text: `Confirm the payment in ${name}.` });
        const blockhash = await latestBlockhash();
        const amountIn = BigInt(result.data.amountIn);
        return token.contractAddress
          ? splTransfer(from, target, token.contractAddress, await tokenProgram(token.contractAddress), amountIn, token.decimals, blockhash)
          : solTransfer(from, target, amountIn, blockhash);
      });
      setSent(true);
      setQuoteStatus("PENDING_DEPOSIT");
      setMoney(null);
      await api(`/api/v1/quotes/${target}`, anything, { method: "POST", body: JSON.stringify({ tx_hash: signature }) });
    } catch (error) {
      payFailed(name, "Solana", error);
    } finally {
      setBusy(null);
    }
  };

  const moveToWallet = async (key: KeySummary) => {
    setBusy(`move-${key.key_id}`);
    const signed = await sign("return_float", { key_id: key.key_id });
    if (!signed) {
      setBusy(null);
      setAgents({ tone: "down", text: "The wallet didn't sign, so the balance stays on the key." });
      return;
    }
    const result = await api("/api/v1/keys/return", returnedSchema, { method: "POST", body: JSON.stringify(signed) });
    setBusy(null);
    setAgents(
      result.ok
        ? { tone: "up", text: `Moving ${usd(BigInt(result.data.returned_usd_micro))} to your wallet. It arrives within a minute.` }
        : { tone: "down", text: result.message },
    );
    if (result.ok) await listKeys(false);
  };

  if (!accountId) {
    return (
      <div className={PAGE}>
        <PageHeader title="Your wallet">
          USDC on NEAR that you and your agents spend from. You hold the money; agents get keys with daily limits.
        </PageHeader>
        <ol className="grid lg:grid-cols-3">
          {STEPS.map(([title, body], position) => (
            <li key={title} className="flex flex-col gap-2 border-b border-line py-6 lg:border-b-0 lg:border-r lg:px-6 lg:first:pl-0 lg:last:border-r-0">
              <span className="text-[13px] tabular-nums text-accent">{`0${position + 1}`}</span>
              <h2 className="text-[18px] text-ink">{title}</h2>
              <p className="max-w-[36ch] text-pretty text-[14px] leading-[22px] text-muted">{body}</p>
            </li>
          ))}
        </ol>
        <div className="flex flex-col items-start gap-4">
          <CommitButton onClick={() => void connect()}>Connect wallet</CommitButton>
          <p className="text-[13px] text-muted">Connecting reads your balance. Nothing is signed until you move money or create a key.</p>
        </div>
        <section aria-label="The venue right now" className="flex flex-col gap-3">
          <h2 className="text-[13px] text-muted">The venue right now</h2>
          <Venue />
        </section>
      </div>
    );
  }

  const chainVerb = direction === "deposit" ? "Get a deposit address" : "Get a quote";
  const most = balances ? (direction === "deposit" ? balances.near : balances.wallet) : null;
  const token = tokens.find((item) => item.assetId === asset) ?? null;
  const chain = token ? chainName(token.blockchain) : "that chain";
  const payable = direction === "deposit" && token !== null && (CHAINS[token.blockchain]?.evm ?? null) !== null && wallets.length > 0;
  const solPayable = direction === "deposit" && token?.blockchain === "sol" && solanaWallets.length > 0;
  const shown = preview && preview.key === `${asset}:${amount}` ? preview : null;
  const uri = token && quote ? paymentUri(token, quote) : null;
  const chains = [...new Set(tokens.map((item) => item.blockchain))].sort((a, b) => rank(a) - rank(b));

  return (
    <div className={PAGE}>
      <header className="flex flex-col gap-3 border-b border-line pb-8">
        <p className="text-[13px] text-muted">Wallet balance</p>
        {balances === null ? (
          <Skeleton className="h-14 w-56" />
        ) : (
          <h1 className="font-serif text-[48px] leading-none tracking-[-0.01em] text-ink lg:text-[64px]">{usd(balances.wallet)}</h1>
        )}
        <p className="text-[14px] leading-[22px] text-muted">
          USDC on {CORE || "core"}, held for{" "}
          <a href={explorer("address", accountId)} target="_blank" rel="noreferrer" className={`${LINK} text-ink`}>
            {own ?? accountId}
          </a>
          {balances && balances.near > 0n ? (
            <>
              . <span className="text-ink">{usd(balances.near)}</span> more sits in your NEAR account, ready to deposit.
            </>
          ) : null}
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
              startOver();
            }}
            items={[
              { value: "deposit", label: "Deposit" },
              { value: "withdraw", label: "Withdraw" },
            ]}
          />
          {viaNear ? (
            <Toggle
              label="Route"
              value={route}
              onChange={(next) => {
                setRoute(next);
                startOver();
              }}
              items={[
                { value: "near", label: direction === "deposit" ? "From NEAR" : "To NEAR" },
                { value: "chain", label: direction === "deposit" ? "From another chain" : "To another chain" },
              ]}
            />
          ) : null}
          {route === "chain" ? (
            tokens.length === 0 ? (
              <p className="text-[13px] text-muted">Reading the chains NEAR Intents supports.</p>
            ) : (
              <Field label={direction === "deposit" ? "Pay with" : "Receive as"}>
                <Select value={asset} disabled={quote !== null} onChange={(event) => setAsset(event.target.value)}>
                  {chains.map((code) => (
                    <optgroup key={code} label={chainName(code)}>
                      {tokens
                        .filter((item) => item.blockchain === code)
                        .sort((a, b) => Number(b.symbol === "USDC") - Number(a.symbol === "USDC") || a.symbol.localeCompare(b.symbol))
                        .map((item) => (
                          <option key={item.assetId} value={item.assetId}>
                            {item.symbol} on {chainName(code)}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </Select>
              </Field>
            )
          ) : null}
          <Field
            label="Amount (USDC)"
            note={
              route === "near" && most !== null
                ? direction === "deposit"
                  ? `${usd(most)} in your NEAR account`
                  : `${usd(most)} in your wallet`
                : undefined
            }
          >
            <div className="flex gap-2">
              <input
                ref={amountRef}
                value={amount}
                disabled={quote !== null}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                autoComplete="off"
                className={INPUT}
              />
              {route === "near" ? (
                <button type="button" disabled={!most} onClick={() => most && setAmount(plain(most))} className={`${SECONDARY} h-11`}>
                  Max
                </button>
              ) : null}
            </div>
          </Field>
          {route === "chain" && direction === "deposit" && quote === null && token ? (
            <p role="status" className={`text-[13px] leading-[20px] ${shown === null ? "text-muted" : "error" in shown ? "text-down" : "text-ink"}`}>
              {shown === null
                ? "Getting a price."
                : "error" in shown
                  ? `No price from NEAR Intents. ${shown.error}`
                  : `You send ${shown.quote.amountInFormatted} ${token.symbol} on ${chain}. ${usd(BigInt(shown.quote.amountOut))} USDC lands in your Meridian wallet.`}
            </p>
          ) : null}
          {route === "chain" ? (
            <Field
              label={`Your address on ${chain}`}
              note={
                direction === "deposit"
                  ? "Refunds go here if the deposit can't complete. Paying from a wallet fills it in."
                  : "The funds go here. Double-check it: transfers can't be reversed."
              }
            >
              <input
                ref={addressRef}
                value={address}
                disabled={quote !== null}
                onChange={(event) => setAddress(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                className={`${INPUT} font-mono text-[13px]`}
              />
            </Field>
          ) : null}
          {route === "chain" && !MAINNET ? (
            <p className="border-l-2 border-accent pl-3 text-[13px] leading-[20px] text-ink">
              Testnet shows prices only. {direction === "deposit" ? "Deposits from" : "Withdrawals to"} other chains run on mainnet.
            </p>
          ) : null}

          {route === "near" ? (
            <CommitButton disabled={busy !== null} aria-busy={busy === "move"} onClick={() => void moveOnNear()} className="self-start">
              {busy === "move" ? "Waiting for the wallet" : `${direction === "deposit" ? "Deposit" : "Withdraw"} ${amount || "0"} USDC`}
            </CommitButton>
          ) : quote === null ? (
            <div className="flex flex-wrap gap-2">
              {payable
                ? wallets.map((wallet) => (
                    <CommitButton key={wallet.uuid} disabled={busy !== null || !MAINNET} aria-busy={busy === "pay"} onClick={() => void pay(wallet)}>
                      <img src={wallet.icon} alt="" width={16} height={16} className="size-4" />
                      Pay with {wallet.name}
                    </CommitButton>
                  ))
                : null}
              {solPayable
                ? solanaWallets.map((wallet) => (
                    <CommitButton key={wallet.name} disabled={busy !== null || !MAINNET} aria-busy={busy === "pay"} onClick={() => void paySolana(wallet.name)}>
                      <img src={wallet.icon} alt="" width={16} height={16} className="size-4" />
                      Pay with {wallet.name}
                    </CommitButton>
                  ))
                : null}
              {payable || solPayable ? (
                <button
                  type="button"
                  disabled={busy !== null || (!MAINNET && direction === "deposit")}
                  aria-busy={busy === "quote"}
                  onClick={() => void quoteChain()}
                  className={SECONDARY}
                >
                  {busy === "quote" ? "Asking NEAR Intents" : chainVerb}
                </button>
              ) : (
                <CommitButton
                  disabled={busy !== null || (!MAINNET && direction === "deposit")}
                  aria-busy={busy === "quote"}
                  onClick={() => void quoteChain()}
                >
                  {busy === "quote" ? "Asking NEAR Intents" : chainVerb}
                </CommitButton>
              )}
            </div>
          ) : direction === "deposit" ? (
            <div className="flex flex-col gap-4 border border-line p-4">
              <p className="text-[13px] leading-[20px] text-ink">
                {sent ? "You sent" : "Send"} {quote.amountInFormatted} {token?.symbol ?? ""} on {chain}. {usd(BigInt(quote.amountOut))} USDC lands in
                your Meridian wallet.
              </p>
              {quote.depositAddress && !sent ? (
                <div className="flex gap-4">
                  {qr ? (
                    <img src={qr} alt={`QR code for the deposit address on ${chain}`} width={112} height={112} className="hidden size-28 shrink-0 sm:block" />
                  ) : null}
                  <div className="flex min-w-0 flex-col gap-2">
                    <span className="text-[12px] text-muted">Deposit address</span>
                    <code className="break-all font-mono text-[13px] text-ink">{quote.depositAddress}</code>
                    <div className="flex flex-wrap gap-2">
                      <CopyButton value={quote.depositAddress} label="Copy address" />
                      {uri ? (
                        <a href={uri} className={`${SECONDARY} sm:hidden`}>
                          Open in your wallet
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              ) : null}
              {quote.depositMemo && !sent ? (
                <div className="flex flex-col gap-2 border-t border-line pt-3">
                  <span className="text-[12px] text-muted">Memo</span>
                  <code className="break-all font-mono text-[13px] text-ink">{quote.depositMemo}</code>
                  <p className="text-[13px] leading-[20px] text-down">Include this memo or the deposit can&apos;t be credited.</p>
                  <CopyButton value={quote.depositMemo} label="Copy memo" />
                </div>
              ) : null}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span role="status" className="text-[13px] text-ink">
                  {statusText(quoteStatus ?? "PENDING_DEPOSIT", direction, chain, sent)}
                </span>
                <button type="button" onClick={startOver} className={`${LINK} text-[13px] text-ink`}>
                  Start over
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3 border border-line p-4">
              <p className="text-[13px] leading-[20px] text-ink">
                {quote.amountOutFormatted} {token?.symbol ?? ""} arrives on {chain} after the bridge fee.
              </p>
              {quoteStatus !== null ? (
                <p role="status" className="text-[13px] text-ink">
                  {statusText(quoteStatus, direction, chain, false)}
                </p>
              ) : quote.depositAddress ? (
                <CommitButton disabled={busy !== null} aria-busy={busy === "move"} onClick={() => void sendChainWithdraw()} className="self-start">
                  {busy === "move" ? "Waiting for the wallet" : `Withdraw ${amount} USDC as ${token?.symbol ?? "it"} on ${chain}`}
                </CommitButton>
              ) : null}
              <button type="button" onClick={startOver} className={`${LINK} self-start text-[13px] text-ink`}>
                Start over
              </button>
            </div>
          )}
          <Said notice={money} />
          <p className="text-[12px] leading-[18px] text-muted">
            {route === "chain"
              ? "Routed by NEAR Intents 1Click. A quote holds for a few minutes."
              : direction === "deposit"
                ? "Moves USDC from your NEAR account into Meridian."
                : "If your account has never held USDC, the wallet also pays 0.00125 NEAR to register it."}
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
            <Empty
              start
              action={
                <button type="button" disabled={busy !== null} onClick={() => void listKeys(true)} className={SECONDARY}>
                  {busy === "list" ? "Waiting for the wallet" : "Show my agents"}
                </button>
              }
            >
              {asked
                ? "An agent asked for a higher limit. Sign once to see your agents. Nothing goes on chain."
                : "Sign once to see your agents and what they spent. It proves this wallet owns them, and nothing goes on chain."}
            </Empty>
          ) : keys.length === 0 ? (
            <Empty start>No agents yet. Create a key, then give it to an agent with a daily limit.</Empty>
          ) : (
            <div role="list" aria-label="Agents" className="flex flex-col">
              <div
                aria-hidden
                className="hidden h-9 grid-cols-[minmax(0,1fr)_96px_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(88px,auto)] items-center gap-4 text-[12px] text-muted lg:grid"
              >
                <span>Agent</span>
                <span>Key balance</span>
                <span>Spent today</span>
                <span>Daily limit (USDC)</span>
                <span />
              </div>
              {keys
                .filter((key) => key.parent_id === null)
                .flatMap((parent) => [parent, ...keys.filter((key) => key.parent_id === parent.key_id)])
                .map((key) => {
                  const child = key.parent_id !== null;
                  const float = BigInt(key.float_usd_micro);
                  const minutes = key.expires_at ? Math.ceil((Date.parse(key.expires_at) - Date.now()) / 60_000) : 0;
                  const used = key.cap ? BigInt(key.cap.used_today_usd_micro) : 0n;
                  const per = key.cap ? BigInt(key.cap.per_day_usd_micro) : 0n;
                  const width = per > 0n ? Math.min(100, Number((used * 100n) / per)) : 0;
                  const name = child ? (key.name.split(" / ").at(-1) ?? key.name) : key.name || "Unnamed key";
                  return (
                    <div
                      role="listitem"
                      key={key.key_id}
                      className={`flex flex-col gap-2 border-t border-line py-3 text-[13px] tabular-nums text-ink lg:grid lg:min-h-12 lg:grid-cols-[minmax(0,1fr)_96px_minmax(0,1.3fr)_minmax(0,1.2fr)_minmax(88px,auto)] lg:items-center lg:gap-4 lg:py-1.5 ${
                        asked === key.key_id ? "bg-accent/5" : ""
                      } ${child ? "lg:pl-4" : ""}`}
                    >
                      <Cell label="Agent">
                        <span className="block truncate text-[15px] lg:text-[13px]" title={key.key_id}>
                          {name}
                        </span>
                      </Cell>
                      <Cell label="Key balance">
                        <span className="inline-flex flex-col items-end gap-0.5 lg:items-start">
                          {usd(float)}
                          {!child && float > 0n ? (
                            <button
                              type="button"
                              disabled={busy !== null}
                              onClick={() => void moveToWallet(key)}
                              className={`${LINK} text-[12px] text-muted`}
                            >
                              {busy === `move-${key.key_id}` ? "Waiting for the wallet" : "Move to wallet"}
                            </button>
                          ) : null}
                        </span>
                      </Cell>
                      <Cell label={child ? "Kind" : "Spent today"}>
                        {child ? (
                          <span className="text-muted">Swarm agent</span>
                        ) : key.cap ? (
                          <span className="inline-flex items-center gap-2 whitespace-nowrap">
                            <span aria-hidden className="relative h-1 w-10 shrink-0 bg-hover">
                              <span className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${width}%` }} />
                            </span>
                            {usd(used)} of {usd(per)}
                          </span>
                        ) : (
                          <span className="text-muted">No limit set</span>
                        )}
                      </Cell>
                      <Cell label={child ? "Status" : "Daily limit"}>
                        {child ? (
                          <span className="text-muted">{minutes > 0 ? `Ends in ${minutes} min` : "Ended, balance on its way back"}</span>
                        ) : key.cap_key ? (
                          <span className="inline-flex items-center gap-1.5">
                            <input
                              value={limits[key.key_id] ?? (key.cap ? plain(per) : "5")}
                              onChange={(event) => setLimits((all) => ({ ...all, [key.key_id]: event.target.value }))}
                              inputMode="decimal"
                              aria-label={`Daily limit for ${name}, in USDC`}
                              className={`${INPUT_SM} w-20`}
                            />
                            <button type="button" disabled={busy !== null} onClick={() => void setLimit(key)} className={SECONDARY}>
                              {busy === `limit-${key.key_id}` ? "Signing" : "Set"}
                            </button>
                          </span>
                        ) : (
                          <span className="text-muted">Not approved yet</span>
                        )}
                      </Cell>
                      <div className="flex justify-end">
                        <ConfirmButton
                          label="Revoke"
                          confirmLabel="Revoke key"
                          question="Prepaid MTok on it is forfeited."
                          busy={busy === `revoke-${key.key_id}` ? "Revoking" : null}
                          disabled={busy !== null}
                          onConfirm={() => void revoke(key)}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
          <Said notice={agents} />
          <p className="text-[12px] leading-[18px] text-muted">
            Agents never hold your NEAR key. They spend through their router key, inside the daily limit you set on chain.{" "}
            <Link href="/agents" className={LINK}>
              Connect an agent
            </Link>
          </p>
        </Panel>
      </div>

      {keys !== null && keys.length > 0 ? (
        <Panel title="Recent requests" bodyClassName="pt-2">
          {usage.length === 0 ? (
            <Empty start>No requests yet. Every model call your agents make shows here with what it cost.</Empty>
          ) : (
            <Table
              minWidth={820}
              columns={[
                { label: "Time (UTC)" },
                { label: "Agent" },
                { label: "Model" },
                { label: "Provider" },
                { label: "Tokens", end: true },
                { label: "Cost", end: true },
                { label: "Paid from" },
                { label: "Result" },
              ]}
            >
              {usage.map((item, position) => (
                <tr key={`${item.at}-${position}`} className={ROW}>
                  <td className={`${TD} text-muted`}>{stampFormat.format(new Date(item.at))}</td>
                  <td className={`${TD} max-w-[160px] truncate`}>{item.key_name}</td>
                  <td className={TD}>{item.model}</td>
                  <td className={TD}>{railName(item.rail)}</td>
                  <td className={`${TD} text-right`}>{(item.prompt_tokens + item.completion_tokens).toLocaleString("en-US")}</td>
                  <td className={`${TD} text-right`}>{usd(BigInt(item.charge_usd_micro))}</td>
                  <td className={`${TD} text-muted`}>{item.paid_from === "prepaid" ? "Prepaid MTok" : "Key balance"}</td>
                  <td className={`${TD} ${item.status === "settled" ? "" : "text-muted"}`}>
                    {item.status === "settled" ? (item.proof ? "Done, TEE proof" : "Done") : item.status === "open" ? "Running" : "Not charged"}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Panel>
      ) : null}
    </div>
  );
}
