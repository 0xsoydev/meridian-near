import { Account, JsonRpcProvider, type KeyPairString } from "near-api-js";
import { verifyMessage } from "near-api-js/nep413";

const RPC = {
  mainnet: ["https://free.rpc.fastnear.com"],
  testnet: ["https://test.rpc.fastnear.com", "https://near-testnet.drpc.org"],
} as const;

export type NearNetwork = keyof typeof RPC;

export function nearNetwork(): NearNetwork {
  return process.env.NEAR_NETWORK === "mainnet" ? "mainnet" : "testnet";
}

export function rpcUrls(): readonly string[] {
  const listed = (process.env.NEAR_RPC_URL ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
  return listed.length > 0 ? listed : RPC[nearNetwork()];
}

const UNAVAILABLE = new Set([408, 429, 500, 502, 503]);

function unavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return UNAVAILABLE.has(Number((error as { cause?: unknown }).cause)) || /fetch failed/i.test(error.message);
}

export function failoverProvider(urls: readonly string[]): JsonRpcProvider {
  const provider = new JsonRpcProvider({ url: urls[0] ?? "" });
  const send = provider.sendJsonRpc.bind(provider);
  provider.sendJsonRpc = (async (method: Parameters<typeof send>[0], params: Parameters<typeof send>[1]) => {
    for (let attempt = 1; ; attempt += 1) {
      const url = provider.connection.url;
      try {
        return await send(method, params);
      } catch (error) {
        if (attempt >= urls.length || !unavailable(error)) throw error;
        if (provider.connection.url === url) provider.connection.url = urls[(urls.indexOf(url) + 1) % urls.length] ?? url;
      }
    }
  }) as typeof send;
  return provider;
}

let shared: JsonRpcProvider | null = null;

export function nearProvider(): JsonRpcProvider {
  if (!shared) shared = failoverProvider(rpcUrls());
  return shared;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

export function coreId(): string {
  return required("NEAR_CORE_ID");
}

export function usdcId(): string {
  return required("NEAR_USDC_ID");
}

export function ownerId(): string {
  return required("NEAR_OWNER_ID");
}

export function opsId(): string {
  return required("NEAR_OPS_ID");
}

export function opsKey(): KeyPairString {
  return required("NEAR_WEB_KEY") as KeyPairString;
}

export function relayKey(): KeyPairString {
  return required("NEAR_RELAY_KEY") as KeyPairString;
}

export function faucetId(): string {
  return required("NEAR_FAUCET_ID");
}

export function faucetKey(): KeyPairString {
  return required("NEAR_FAUCET_KEY") as KeyPairString;
}

export function keeperId(): string {
  return required("NEAR_OPS_ID");
}

export function keeperKey(): KeyPairString {
  return required("NEAR_KEEPER_KEY") as KeyPairString;
}

export async function view<T>(method: string, args: Record<string, unknown> = {}, contractId = coreId()): Promise<T> {
  return (await nearProvider().callFunction({ contractId, method, args })) as T;
}

export type Call = {
  accountId: string;
  privateKey: KeyPairString;
  method: string;
  args?: Record<string, unknown>;
  contractId?: string;
  gas?: string;
  deposit?: bigint;
};

export async function call(options: Call) {
  const account = new Account(options.accountId, nearProvider(), options.privateKey);
  return account.callFunctionRaw({
    contractId: options.contractId ?? coreId(),
    methodName: options.method,
    args: options.args ?? {},
    gas: options.gas ?? "30000000000000",
    deposit: options.deposit ?? 0n,
    waitUntil: "FINAL",
  });
}

export async function txOutcome(txHash: string, signerId: string) {
  return nearProvider().viewTransactionStatus({ txHash, accountId: signerId, waitUntil: "FINAL" });
}

export async function verifyNearSignature(input: {
  accountId: string;
  publicKey: string;
  signature: string;
  nonce: string;
  message: string;
  recipient: string;
}): Promise<boolean> {
  try {
    await verifyMessage({
      signerAccountId: input.accountId,
      signerPublicKey: input.publicKey,
      signature: new Uint8Array(Buffer.from(input.signature, "base64")),
      payload: {
        message: input.message,
        recipient: input.recipient,
        nonce: new Uint8Array(Buffer.from(input.nonce, "base64")),
      },
      provider: nearProvider(),
    });
    return true;
  } catch {
    return false;
  }
}
