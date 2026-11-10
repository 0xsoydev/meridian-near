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

const outcomeSchema = z.object({
  status: z.unknown().optional(),
  transaction: z.object({ hash: z.string() }).optional(),
  transaction_outcome: z.object({ id: z.string() }).optional(),
});

export type Signed = {
  account_id: string;
  public_key: string;
  signature: string;
  nonce: string;
  message: string;
};

export type NearAction = {
  type: "FunctionCall";
  params: { methodName: string; args: object; gas: string; deposit: string };
};

export type NearTransaction = { receiverId: string; actions: NearAction[] };

type Near = {
  accountId: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sign: (action: string, intent?: Record<string, unknown>) => Promise<Signed | null>;
  send: (transactions: NearTransaction[]) => Promise<string[] | null>;
};

const NearContext = createContext<Near | null>(null);

function base64(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return btoa(text);
}

export function Providers({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState<string | null>(null);
  const connector = useRef<NearConnector | null>(null);

  useEffect(() => {
    const network = process.env.NEXT_PUBLIC_NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
    const instance = new NearConnector({ network });
    connector.current = instance;
    instance.on("wallet:signIn", ({ accounts }) => setAccountId(accounts[0]?.accountId ?? null));
    instance.on("wallet:signOut", () => setAccountId(null));
    instance
      .getConnectedWallet()
      .then(({ accounts }) => setAccountId(accounts[0]?.accountId ?? null))
      .catch(() => undefined);
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

  const sign = useCallback(async (action: string, intent: Record<string, unknown> = {}) => {
    const instance = connector.current;
    if (!instance) return null;
    const recipient = window.location.host;
    const message = JSON.stringify({
      domain: recipient,
      action,
      issued_at: new Date().toISOString(),
      ...intent,
    });
    const nonce = crypto.getRandomValues(new Uint8Array(32));
    try {
      const wallet = await instance.wallet();
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

  const send = useCallback(async (transactions: NearTransaction[]) => {
    const instance = connector.current;
    if (!instance) return null;
    try {
      const wallet = await instance.wallet();
      const outcomes = z.array(outcomeSchema).safeParse(await wallet.signAndSendTransactions({ transactions }));
      if (!outcomes.success) return [];
      if (outcomes.data.some((outcome) => typeof outcome.status === "object" && outcome.status !== null && "Failure" in outcome.status)) {
        return null;
      }
      return outcomes.data.flatMap((outcome) => {
        const hash = outcome.transaction?.hash ?? outcome.transaction_outcome?.id;
        return hash ? [hash] : [];
      });
    } catch {
      return null;
    }
  }, []);

  const value = useMemo<Near>(
    () => ({ accountId, connect, disconnect, sign, send }),
    [accountId, connect, disconnect, sign, send],
  );

  return <NearContext.Provider value={value}>{children}</NearContext.Provider>;
}

export function useNear(): Near {
  const near = useContext(NearContext);
  if (!near) throw new Error("useNear must be used inside Providers");
  return near;
}
