"use client";

import { NearConnector } from "@hot-labs/near-connect";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { z } from "zod";
import { FOCUS, ICON, LINK } from "../../components/kit";
import { ETH_ACCOUNT, api } from "../../lib/client";
import { orderText, type Order } from "../../lib/orders";
import { signedNonceSchema, signedResultSchema } from "../../lib/wire";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const USDC = process.env.NEXT_PUBLIC_NEAR_USDC_ID ?? "";
const STORED = "meridian_wallet";
const NEAR_ONLY = "That step needs a NEAR wallet. Deposits and withdrawals through another chain work from any wallet.";

const outcomeSchema = z.object({
  status: z.unknown().optional(),
  transaction: z.object({ hash: z.string() }).optional(),
  transaction_outcome: z.object({ id: z.string() }).optional(),
});

const announcedSchema = z.object({
  info: z.object({ uuid: z.string(), name: z.string(), icon: z.string(), rdns: z.string() }),
  provider: z.unknown(),
});
const addressesSchema = z.array(z.string());
const evmSignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/);
const storedSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("evm"), rdns: z.string(), address: z.string() }),
  z.object({ kind: z.literal("solana"), name: z.string(), address: z.string() }),
]);
const capArgs = z.object({ key: z.string(), per_day: z.string() });
const withdrawArgs = z.object({ amount: z.string(), to: z.string() });
const modifyArgs = z.object({ model: z.string(), size_delta: z.string(), margin_delta: z.string() });
const walletErrorSchema = z.object({ code: z.number().optional(), message: z.string().optional() });

export type Signed =
  | { account_id: string; public_key: string; signature: string; nonce: string; message: string }
  | { account_id: string; signature: string; message: string };

export type NearAction = {
  type: "FunctionCall";
  params: { methodName: string; args: object; gas: string; deposit: string };
};

export type NearTransaction = { receiverId: string; actions: NearAction[] };

export type Sent = { hashes: string[] } | { failure: string | null };

type Callable = (...args: unknown[]) => Promise<unknown>;
type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

export type EvmWallet = { uuid: string; name: string; icon: string; rdns: string; provider: Eip1193 };

type SolanaAccount = { address: string; publicKey: Uint8Array };
type SolanaWallet = { name: string; icon: string; features: Record<string, unknown> };

type Connection =
  | { kind: "near"; accountId: string }
  | { kind: "evm"; wallet: EvmWallet; address: string }
  | { kind: "solana"; wallet: SolanaWallet; account: SolanaAccount };

type Near = {
  accountId: string | null;
  address: string | null;
  kind: Connection["kind"] | null;
  evmWallets: EvmWallet[];
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sign: (action: string, intent?: Record<string, unknown>) => Promise<Signed | null>;
  send: (transactions: NearTransaction[]) => Promise<Sent>;
};

const NearContext = createContext<Near | null>(null);

function base64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isEip1193(value: unknown): value is Eip1193 {
  return typeof value === "object" && value !== null && "request" in value && typeof value.request === "function";
}

function callable(value: unknown): value is Callable {
  return typeof value === "function";
}

function method<K extends string>(value: unknown, name: K): value is Record<K, Callable> {
  return typeof value === "object" && value !== null && typeof Reflect.get(value, name) === "function";
}

function isSolanaAccount(value: unknown): value is SolanaAccount {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof Reflect.get(value, "address") === "string" &&
    Reflect.get(value, "publicKey") instanceof Uint8Array
  );
}

function solanaWallet(value: unknown): SolanaWallet | null {
  if (typeof value !== "object" || value === null) return null;
  const name: unknown = Reflect.get(value, "name");
  const icon: unknown = Reflect.get(value, "icon");
  const chains: unknown = Reflect.get(value, "chains");
  const features: unknown = Reflect.get(value, "features");
  const list: unknown[] = Array.isArray(chains) ? chains : [];
  if (typeof name !== "string" || typeof icon !== "string" || typeof features !== "object" || features === null) return null;
  if (!list.some((chain) => typeof chain === "string" && chain.startsWith("solana:"))) return null;
  const all = Object.fromEntries(Object.entries(features));
  if (!method(all["standard:connect"], "connect") || !method(all["solana:signMessage"], "signMessage")) return null;
  return { name, icon, features: all };
}

async function solanaConnect(wallet: SolanaWallet, silent: boolean): Promise<SolanaAccount | null> {
  const feature = wallet.features["standard:connect"];
  if (!method(feature, "connect")) return null;
  const result: unknown = await feature.connect(silent ? { silent: true } : undefined);
  const accounts: unknown = typeof result === "object" && result !== null ? Reflect.get(result, "accounts") : null;
  const list: unknown[] = Array.isArray(accounts) ? accounts : [];
  const first = list[0];
  return isSolanaAccount(first) ? first : null;
}

function ownerOf(connection: Connection): string {
  if (connection.kind === "near") return connection.accountId;
  if (connection.kind === "evm") return connection.address;
  return hex(connection.account.publicKey);
}

function addressOf(connection: Connection): string {
  if (connection.kind === "near") return connection.accountId;
  if (connection.kind === "evm") return connection.address;
  return connection.account.address;
}

async function signText(connection: Exclude<Connection, { kind: "near" }>, text: string): Promise<string | null> {
  const bytes = new TextEncoder().encode(text);
  if (connection.kind === "evm") {
    const signature = evmSignatureSchema.safeParse(
      await connection.wallet.provider.request({ method: "personal_sign", params: [`0x${hex(bytes)}`, connection.address] }),
    );
    return signature.success ? signature.data : null;
  }
  const feature = connection.wallet.features["solana:signMessage"];
  if (!method(feature, "signMessage")) return null;
  const output: unknown = await feature.signMessage({ account: connection.account, message: bytes });
  const list: unknown[] = Array.isArray(output) ? output : [];
  const first = list[0];
  const signature: unknown = typeof first === "object" && first !== null ? Reflect.get(first, "signature") : null;
  return signature instanceof Uint8Array && signature.length === 64 ? hex(signature) : null;
}

async function relay(connection: Exclude<Connection, { kind: "near" }>, transactions: NearTransaction[]): Promise<Sent> {
  const owner = ownerOf(connection);
  const drafts: Array<(nonce: number, validUntil: number) => Order> = [];
  for (const transaction of transactions) {
    for (const action of transaction.actions) {
      const { methodName, args } = action.params;
      if (transaction.receiverId === USDC && methodName === "storage_deposit") continue;
      const cap = capArgs.safeParse(args);
      const withdraw = withdrawArgs.safeParse(args);
      const modify = modifyArgs.safeParse(args);
      if (transaction.receiverId !== CORE) return { failure: NEAR_ONLY };
      if (methodName === "set_cap" && cap.success) {
        drafts.push((nonce, valid_until) => ({ method: "set_cap_signed", owner, key: cap.data.key, per_day: cap.data.per_day, nonce, valid_until }));
      } else if (methodName === "withdraw" && withdraw.success) {
        drafts.push((nonce, valid_until) => ({ method: "withdraw_signed", owner, amount: withdraw.data.amount, to: withdraw.data.to, nonce, valid_until }));
      } else if (methodName === "modify" && modify.success) {
        drafts.push((nonce, valid_until) => ({ method: "modify_signed", owner, ...modify.data, nonce, valid_until }));
      } else {
        return { failure: NEAR_ONLY };
      }
    }
  }
  const next = await api(`/api/v1/signed?owner=${owner}`, signedNonceSchema);
  if (!next.ok) return { failure: next.message };
  const validUntil = (Math.floor(Date.now() / 1000) + 600) * 1000;
  const hashes: string[] = [];
  for (const [index, draft] of drafts.entries()) {
    const order = draft(next.data.nonce + index, validUntil);
    const signature = await signText(connection, orderText(CORE, order));
    if (!signature) return { failure: null };
    const sent = await api("/api/v1/signed", signedResultSchema, { method: "POST", body: JSON.stringify({ order, signature }) });
    if (!sent.ok) return { failure: sent.message };
    if (sent.data.tx) hashes.push(sent.data.tx);
  }
  return { hashes };
}

function walletProblem(error: unknown, name: string): string {
  const failure = walletErrorSchema.safeParse(error);
  const code = failure.success ? failure.data.code : undefined;
  if (code === 4001) return `You cancelled in ${name}.`;
  if (code === -32002) return `${name} already has a request waiting. Open ${name} from your browser toolbar and answer it.`;
  return failure.success && failure.data.message ? `${name}: ${failure.data.message}` : `${name} didn't connect. Try again.`;
}

function WalletRow({ name, icon, busy, disabled, onPick }: { name: string; icon: string; busy: boolean; disabled: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-busy={busy}
      onClick={onPick}
      className={`flex h-12 w-full items-center gap-3 border border-line px-3 text-left text-[14px] text-ink transition-colors duration-150 enabled:hover:bg-hover disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS}`}
    >
      <img src={icon} alt="" width={24} height={24} className="size-6 shrink-0" />
      <span className="flex-1">{name}</span>
      {busy ? <span className="text-[12px] text-muted">Check {name}</span> : null}
    </button>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [connection, setConnection] = useState<Connection | null>(null);
  const [evmWallets, setEvmWallets] = useState<EvmWallet[]>([]);
  const [solanaWallets, setSolanaWallets] = useState<SolanaWallet[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const connector = useRef<NearConnector | null>(null);
  const live = useRef<Connection | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);

  const use = useCallback((next: Connection | null) => {
    live.current = next;
    setConnection(next);
  }, []);

  useEffect(() => {
    const network = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
    const instance = new NearConnector({ network, excludedWallets: ["ethereum-wallets"] });
    connector.current = instance;
    instance.on("wallet:signIn", ({ accounts }) => {
      const id = accounts[0]?.accountId;
      if (!id) return;
      localStorage.removeItem(STORED);
      use({ kind: "near", accountId: id });
    });
    instance.on("wallet:signOut", () => {
      if (live.current?.kind === "near") use(null);
    });

    const evm: EvmWallet[] = [];
    const solana: SolanaWallet[] = [];
    const announce = (event: Event) => {
      const found = announcedSchema.safeParse("detail" in event ? event.detail : null);
      if (!found.success || !isEip1193(found.data.provider) || evm.some((item) => item.rdns === found.data.info.rdns)) return;
      evm.push({ ...found.data.info, provider: found.data.provider });
      setEvmWallets([...evm]);
    };
    const register = (...wallets: unknown[]) => {
      for (const raw of wallets) {
        const wallet = solanaWallet(raw);
        if (!wallet || solana.some((item) => item.name === wallet.name)) continue;
        solana.push(wallet);
        setSolanaWallets([...solana]);
      }
      return () => undefined;
    };
    const registered = (event: Event) => {
      if ("detail" in event && callable(event.detail)) void event.detail({ register });
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.addEventListener("wallet-standard:register-wallet", registered);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    window.dispatchEvent(new CustomEvent("wallet-standard:app-ready", { detail: { register } }));

    const restore = async (): Promise<Connection | null> => {
      let raw: unknown = null;
      try {
        raw = JSON.parse(localStorage.getItem(STORED) ?? "null");
      } catch {
        raw = null;
      }
      const stored = storedSchema.safeParse(raw);
      if (stored.success && stored.data.kind === "evm") {
        const { rdns, address } = stored.data;
        const wallet = evm.find((item) => item.rdns === rdns);
        if (!wallet) return null;
        const accounts = addressesSchema.safeParse(await wallet.provider.request({ method: "eth_accounts" }).catch(() => null));
        return accounts.success && accounts.data.some((item) => item.toLowerCase() === address) ? { kind: "evm", wallet, address } : null;
      }
      if (stored.success && stored.data.kind === "solana") {
        const { name, address } = stored.data;
        const wallet = solana.find((item) => item.name === name);
        const account = wallet ? await solanaConnect(wallet, true).catch(() => null) : null;
        return wallet && account?.address === address ? { kind: "solana", wallet, account } : null;
      }
      const near = await instance.getConnectedWallet().catch(() => null);
      const id = near?.accounts[0]?.accountId;
      return id ? { kind: "near", accountId: id } : null;
    };
    void restore().then((found) => {
      if (found && !live.current) use(found);
    });

    return () => {
      window.removeEventListener("eip6963:announceProvider", announce);
      window.removeEventListener("wallet-standard:register-wallet", registered);
    };
  }, [use]);

  const connect = useCallback(async () => {
    setProblem(null);
    dialog.current?.showModal();
  }, []);

  const pickEvm = async (wallet: EvmWallet) => {
    setBusy(wallet.name);
    setProblem(null);
    try {
      const accounts = addressesSchema.parse(await wallet.provider.request({ method: "eth_requestAccounts" }));
      const address = accounts[0]?.toLowerCase() ?? "";
      if (!ETH_ACCOUNT.test(address)) throw new Error("no account");
      localStorage.setItem(STORED, JSON.stringify({ kind: "evm", rdns: wallet.rdns, address }));
      use({ kind: "evm", wallet, address });
      dialog.current?.close();
    } catch (error) {
      setProblem(walletProblem(error, wallet.name));
    } finally {
      setBusy(null);
    }
  };

  const pickSolana = async (wallet: SolanaWallet) => {
    setBusy(wallet.name);
    setProblem(null);
    try {
      const account = await solanaConnect(wallet, false);
      if (!account) throw new Error("no account");
      localStorage.setItem(STORED, JSON.stringify({ kind: "solana", name: wallet.name, address: account.address }));
      use({ kind: "solana", wallet, account });
      dialog.current?.close();
    } catch (error) {
      setProblem(walletProblem(error, wallet.name));
    } finally {
      setBusy(null);
    }
  };

  const pickNear = async () => {
    const instance = connector.current;
    dialog.current?.close();
    if (!instance) return;
    const connected = await instance
      .connect()
      .then(() => instance.getConnectedWallet())
      .catch(() => null);
    const id = connected?.accounts[0]?.accountId;
    if (id) {
      localStorage.removeItem(STORED);
      use({ kind: "near", accountId: id });
    }
  };

  const disconnect = useCallback(async () => {
    const current = live.current;
    const instance = connector.current;
    localStorage.removeItem(STORED);
    if (current?.kind === "near" && instance) {
      await instance
        .wallet()
        .then((wallet) => instance.disconnect(wallet))
        .catch(() => undefined);
    }
    if (current?.kind === "solana") {
      const feature = current.wallet.features["standard:disconnect"];
      if (method(feature, "disconnect")) await feature.disconnect().catch(() => undefined);
    }
    use(null);
  }, [use]);

  const sign = useCallback(async (action: string, intent: Record<string, unknown> = {}): Promise<Signed | null> => {
    const current = live.current;
    const instance = connector.current;
    if (!current || !instance) return null;
    const recipient = window.location.host;
    const message = JSON.stringify({
      domain: recipient,
      action,
      issued_at: new Date().toISOString(),
      ...intent,
    });
    try {
      if (current.kind !== "near") {
        const signature = await signText(current, message);
        return signature ? { account_id: ownerOf(current), signature, message } : null;
      }
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const signed = await (await instance.wallet()).signMessage({ message, recipient, nonce });
      return {
        account_id: signed.accountId,
        public_key: signed.publicKey,
        signature: signed.signature,
        nonce: base64(nonce),
        message,
      };
    } catch {
      return null;
    }
  }, []);

  const send = useCallback(async (transactions: NearTransaction[]): Promise<Sent> => {
    const current = live.current;
    const instance = connector.current;
    if (!current || !instance) return { failure: null };
    try {
      if (current.kind !== "near") return await relay(current, transactions);
      const outcomes = z.array(outcomeSchema).safeParse(await (await instance.wallet()).signAndSendTransactions({ transactions }));
      if (!outcomes.success) return { hashes: [] };
      if (outcomes.data.some((outcome) => typeof outcome.status === "object" && outcome.status !== null && "Failure" in outcome.status)) {
        return { failure: null };
      }
      return {
        hashes: outcomes.data.flatMap((outcome) => {
          const hash = outcome.transaction?.hash ?? outcome.transaction_outcome?.id;
          return hash ? [hash] : [];
        }),
      };
    } catch {
      return { failure: null };
    }
  }, []);

  const value = useMemo<Near>(
    () => ({
      accountId: connection ? ownerOf(connection) : null,
      address: connection ? addressOf(connection) : null,
      kind: connection?.kind ?? null,
      evmWallets,
      connect,
      disconnect,
      sign,
      send,
    }),
    [connection, evmWallets, connect, disconnect, sign, send],
  );

  const group = (title: string, rows: ReactNode) => (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h3 className="text-[12px] leading-[18px] text-muted">{title}</h3>
      {rows}
    </section>
  );
  const get = (href: string, label: string) => (
    <a href={href} target="_blank" rel="noreferrer" className={`${LINK} self-start text-[13px] text-ink`}>
      {label}
    </a>
  );

  return (
    <NearContext.Provider value={value}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="connect-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
        className="m-auto w-[calc(100vw-32px)] max-w-[400px] border border-line bg-white p-0 text-ink backdrop:bg-ink/30"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 id="connect-title" className="text-[16px] leading-6">
            Connect a wallet
          </h2>
          <button type="button" aria-label="Close" onClick={() => dialog.current?.close()} className={ICON}>
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="flex flex-col gap-5 p-5">
          {group(
            "Ethereum",
            evmWallets.length > 0
              ? evmWallets.map((wallet) => (
                  <WalletRow
                    key={wallet.rdns}
                    name={wallet.name}
                    icon={wallet.icon}
                    busy={busy === wallet.name}
                    disabled={busy !== null}
                    onPick={() => void pickEvm(wallet)}
                  />
                ))
              : get("https://metamask.io/download/", "Get MetaMask"),
          )}
          {group(
            "Solana",
            solanaWallets.length > 0
              ? solanaWallets.map((wallet) => (
                  <WalletRow
                    key={wallet.name}
                    name={wallet.name}
                    icon={wallet.icon}
                    busy={busy === wallet.name}
                    disabled={busy !== null}
                    onPick={() => void pickSolana(wallet)}
                  />
                ))
              : get("https://phantom.com/download", "Get Phantom"),
          )}
          {group(
            "NEAR",
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void pickNear()}
              className={`flex h-12 w-full items-center border border-line px-3 text-left text-[14px] text-ink transition-colors duration-150 enabled:hover:bg-hover ${FOCUS}`}
            >
              NEAR wallets
            </button>,
          )}
          {problem ? (
            <p role="status" className="text-pretty text-[13px] leading-5 text-down">
              {problem}
            </p>
          ) : null}
        </div>
      </dialog>
    </NearContext.Provider>
  );
}

export function useNear(): Near {
  const near = useContext(NearContext);
  if (!near) throw new Error("useNear must be used inside Providers");
  return near;
}
