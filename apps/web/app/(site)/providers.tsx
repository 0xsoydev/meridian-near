"use client";

import { NearConnector } from "@hot-labs/near-connect";
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
import { ETH_ACCOUNT, api, nearAmount } from "../../lib/client";
import { walletSchema } from "../../lib/wire";

const outcomeSchema = z.object({
  status: z.unknown().optional(),
  transaction: z.object({ hash: z.string() }).optional(),
  transaction_outcome: z.object({ id: z.string() }).optional(),
});

const announcedSchema = z.object({ info: z.object({ uuid: z.string(), name: z.string(), icon: z.string() }), provider: z.unknown() });
const addressesSchema = z.array(z.string());
const signatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/);

const OVERHEAD_GAS = 25_000_000_000_000n;
const GAS_PRICE = 100_000_000n;

export type Signed =
  | { account_id: string; public_key: string; signature: string; nonce: string; message: string }
  | { account_id: string; signature: string; message: string };

export type NearAction = {
  type: "FunctionCall";
  params: { methodName: string; args: object; gas: string; deposit: string };
};

export type NearTransaction = { receiverId: string; actions: NearAction[] };

export type Sent = { hashes: string[] } | { failure: string | null };

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

export type EvmWallet = { uuid: string; name: string; icon: string; provider: Eip1193 };

type Near = {
  accountId: string | null;
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

function isEip1193(value: unknown): value is Eip1193 {
  return typeof value === "object" && value !== null && "request" in value && typeof value.request === "function";
}

function hex(text: string): string {
  return `0x${Array.from(new TextEncoder().encode(text), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function personalSign(wallets: EvmWallet[], address: string, message: string): Promise<string | null> {
  for (const method of ["eth_accounts", "eth_requestAccounts"]) {
    for (const wallet of wallets) {
      const accounts = addressesSchema.safeParse(await wallet.provider.request({ method }).catch(() => null));
      if (!accounts.success || !accounts.data.some((item) => item.toLowerCase() === address)) continue;
      const signature = signatureSchema.safeParse(await wallet.provider.request({ method: "personal_sign", params: [hex(message), address] }));
      return signature.success ? signature.data : null;
    }
  }
  return null;
}

export function nearFee(transactions: NearTransaction[]): bigint {
  return transactions
    .flatMap((transaction) => transaction.actions)
    .reduce((sum, action) => sum + (BigInt(action.params.gas) + OVERHEAD_GAS) * GAS_PRICE + BigInt(action.params.deposit), 0n);
}

export function Providers({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [evmWallets, setEvmWallets] = useState<EvmWallet[]>([]);
  const connector = useRef<NearConnector | null>(null);
  const evm = useRef<EvmWallet[]>([]);

  useEffect(() => {
    const network = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
    const instance = new NearConnector({ network });
    connector.current = instance;
    void instance.whenManifestLoaded.then(() => {
      const ethereum = instance.wallets.find((wallet) => wallet.manifest.id === "ethereum-wallets");
      if (!ethereum) return;
      ethereum.manifest.name = "MetaMask and other Ethereum wallets";
      instance.wallets = [ethereum, ...instance.wallets.filter((wallet) => wallet !== ethereum)];
    });
    instance.on("wallet:signIn", ({ accounts }) => setAccountId(accounts[0]?.accountId ?? null));
    instance.on("wallet:signOut", () => setAccountId(null));
    instance
      .getConnectedWallet()
      .then(({ accounts }) => setAccountId(accounts[0]?.accountId ?? null))
      .catch(() => undefined);
    const announce = (event: Event) => {
      const found = announcedSchema.safeParse("detail" in event ? event.detail : null);
      if (!found.success || !isEip1193(found.data.provider)) return;
      const wallet = { ...found.data.info, provider: found.data.provider };
      if (evm.current.some((item) => item.uuid === wallet.uuid)) return;
      evm.current = [...evm.current, wallet];
      setEvmWallets(evm.current);
    };
    window.addEventListener("eip6963:announceProvider", announce);
    window.dispatchEvent(new Event("eip6963:requestProvider"));
    return () => window.removeEventListener("eip6963:announceProvider", announce);
  }, []);

  const connect = useCallback(async () => {
    const instance = connector.current;
    if (!instance) return;
    const connected = await instance
      .connect()
      .then(() => instance.getConnectedWallet())
      .catch(() => null);
    if (connected) setAccountId(connected.accounts[0]?.accountId ?? null);
  }, []);

  const disconnect = useCallback(async () => {
    const instance = connector.current;
    if (!instance) return;
    await instance
      .wallet()
      .then((wallet) => instance.disconnect(wallet))
      .catch(() => undefined);
    setAccountId(null);
  }, []);

  const sign = useCallback(async (action: string, intent: Record<string, unknown> = {}): Promise<Signed | null> => {
    const instance = connector.current;
    if (!instance) return null;
    const recipient = window.location.host;
    const message = JSON.stringify({
      domain: recipient,
      action,
      issued_at: new Date().toISOString(),
      ...intent,
    });
    try {
      const { wallet, accounts } = await instance.getConnectedWallet();
      const account = accounts[0]?.accountId ?? "";
      if (ETH_ACCOUNT.test(account)) {
        const signature = await personalSign(evm.current, account, message);
        return signature ? { account_id: account, signature, message } : null;
      }
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const signed = await wallet.signMessage({ message, recipient, nonce });
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
    const instance = connector.current;
    if (!instance) return { failure: null };
    try {
      const { wallet, accounts } = await instance.getConnectedWallet();
      const account = accounts[0]?.accountId ?? "";
      if (ETH_ACCOUNT.test(account)) {
        const balance = await api(`/api/v1/wallet?account=${account}`, walletSchema);
        const needed = nearFee(transactions);
        const has = balance.ok ? BigInt(balance.data.near_yocto) : null;
        if (has !== null && has < needed) {
          return {
            failure: `Network fees on NEAR are paid from your account ${account}. It has ${nearAmount(has)} NEAR and this needs about ${nearAmount(needed)}. Send it a little NEAR, such as 0.05, then try again.`,
          };
        }
      }
      const outcomes = z.array(outcomeSchema).safeParse(await wallet.signAndSendTransactions({ transactions }));
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
    () => ({ accountId, evmWallets, connect, disconnect, sign, send }),
    [accountId, evmWallets, connect, disconnect, sign, send],
  );

  return <NearContext.Provider value={value}>{children}</NearContext.Provider>;
}

export function useNear(): Near {
  const near = useContext(NearContext);
  if (!near) throw new Error("useNear must be used inside Providers");
  return near;
}
