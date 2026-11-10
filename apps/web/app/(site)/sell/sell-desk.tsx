"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ConfirmButton } from "../../../components/confirm-button";
import {
  CommitButton,
  Empty,
  Field,
  INPUT,
  INPUT_SM,
  LINK,
  Line,
  PAGE,
  PageHeader,
  Panel,
  ROW,
  SECONDARY,
  Select,
  TD,
  Table,
} from "../../../components/kit";
import { api, explorer, percent, railName, usd } from "../../../lib/client";
import { MARKETS } from "../../../lib/markets";
import { charge, formatMicroPerMtok, formatMtok, parseUsd, sellerEarning } from "../../../lib/price";
import type { Book, SellerListing, SellerPayouts, VenueStatus } from "../../../lib/types";
import { anything, bookSchema, listingCreatedSchema, listingsSchema, payoutsSchema, statusSchema } from "../../../lib/wire";
import { useNear } from "../providers";

const TAKE_BPS = 1000n;
const ORDINALS = ["1st", "2nd", "3rd"];

type Offered = { id: string; models: ReadonlyArray<{ id: string; list: string }> };
type Notice = { tone: "up" | "down"; text: string };
type Draft = { price: string; capacity: string };
type Problem = { field: "price" | "capacity" | "key" | "send"; text: string };

function ordinal(n: number): string {
  return ORDINALS[n - 1] ?? `${n}th`;
}

function Landing({ book, index, price }: { book: Book | null; index: string | null; price: bigint | null }) {
  if (!book) return null;
  const asks = book.asks.map((ask) => ({ price: BigInt(ask.price_micro_per_mtok), tokens: BigInt(ask.tokens_left) }));
  const best = asks.reduce<bigint | null>((low, ask) => (low === null || ask.price < low ? ask.price : low), null);
  const ahead = price === null ? [] : asks.filter((ask) => ask.price <= price);
  const depth = ahead.reduce((total, ask) => total + ask.tokens, 0n);
  return (
    <dl aria-live="polite" className="flex flex-col gap-1.5 border-l-2 border-line pl-3">
      <Line label="Place in line">{price === null ? "Enter a price" : asks.length === 0 ? "First ask in the book" : `${ordinal(ahead.length + 1)} of ${asks.length + 1}`}</Line>
      <Line label="Ahead of you">{price === null ? "None" : `${formatMtok(depth)} MTok`}</Line>
      <Line label="Best ask now">{best === null ? "None" : usd(best)}</Line>
      {index !== null ? <Line label="Index">{usd(BigInt(index))}</Line> : null}
    </dl>
  );
}

function preferred(models: Offered["models"]): string {
  return (models.find((entry) => MARKETS.some((market) => market === entry.id)) ?? models[0])?.id ?? "";
}

function label(status: string): string {
  if (status === "active") return "Live";
  if (status === "executed") return "Paid";
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3">
      <span aria-hidden className="pt-px text-[13px] tabular-nums text-muted">
        {n}
      </span>
      {children}
    </li>
  );
}

export function SellDesk({ rails }: { rails: ReadonlyArray<Offered> }) {
  const { accountId, connect, sign } = useNear();
  const [rail, setRail] = useState(rails[0]?.id ?? "");
  const [model, setModel] = useState(preferred(rails[0]?.models ?? []));
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("20");
  const [apiKey, setApiKey] = useState("");
  const [source, setSource] = useState("");
  const [listings, setListings] = useState<SellerListing[] | null>(null);
  const [payouts, setPayouts] = useState<SellerPayouts | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [tableNotice, setTableNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [book, setBook] = useState<Book | null>(null);
  const [status, setStatus] = useState<VenueStatus | null>(null);
  const priceRef = useRef<HTMLInputElement | null>(null);
  const capacityRef = useRef<HTMLInputElement | null>(null);
  const keyRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(async () => {
    if (!accountId) return;
    const [listed, paid] = await Promise.all([
      api(`/api/listings?seller=${encodeURIComponent(accountId)}`, listingsSchema),
      api(`/api/v1/payouts?seller=${encodeURIComponent(accountId)}`, payoutsSchema),
    ]);
    setListings(listed.ok ? listed.data.listings : []);
    if (paid.ok) setPayouts(paid.data);
  }, [accountId]);

  useEffect(() => {
    setListings(null);
    setPayouts(null);
    void load();
  }, [load]);

  useEffect(() => {
    void api("/api/v1/status", statusSchema).then((result) => {
      if (result.ok) setStatus(result.data);
    });
  }, []);

  useEffect(() => {
    if (!model) return;
    let alive = true;
    setBook(null);
    const read = () =>
      void api(`/api/v1/book?model=${encodeURIComponent(model)}`, bookSchema).then((result) => {
        if (alive && result.ok) setBook(result.data);
      });
    read();
    const id = window.setInterval(read, 15_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [model]);

  const models = rails.find((entry) => entry.id === rail)?.models ?? [];
  const chosen = models.find((entry) => entry.id === model) ?? null;
  const list = chosen ? BigInt(chosen.list) : null;
  const micro = price.trim() === "" ? null : parseUsd(price);
  const mtok = /^\d{1,9}$/.test(capacity.trim()) ? BigInt(capacity.trim()) : 0n;
  const above = micro !== null && list !== null && micro > list;
  const ceiling = micro !== null && mtok > 0n ? sellerEarning(charge(mtok * 1_000_000n, micro), TAKE_BPS) : null;
  const reusable = (listings ?? []).filter((listing) => listing.rail === rail && listing.status !== "cancelled");
  const provider = railName(rail);
  const index = status?.markets.find((market) => market.model === model)?.index_micro_per_mtok ?? null;

  const flag = (field: Problem["field"], text: string) => {
    setProblem({ field, text });
    if (field === "price") priceRef.current?.focus();
    if (field === "capacity") capacityRef.current?.focus();
    if (field === "key") keyRef.current?.focus();
  };

  const submit = async () => {
    if (!accountId) {
      await connect();
      return;
    }
    setNotice(null);
    if (!chosen) return flag("send", "Pick a model this provider serves.");
    if (micro === null || micro === 0n) return flag("price", "Enter a price in USD per MTok, like 0.17.");
    if (above && list !== null) return flag("price", `Price it at or below ${provider}'s list price of ${usd(list)}.`);
    if (mtok === 0n) return flag("capacity", "Enter the capacity in whole MTok, like 20.");
    if (!source && apiKey.trim() === "") return flag("key", `Paste your ${provider} API key, or reuse one you listed before.`);
    setBusy("list");
    setProblem(null);
    const signed = await sign("list", {
      rail,
      model: chosen.id,
      capacity_mtok: mtok.toString(),
      price_micro_per_mtok: micro.toString(),
      client_nonce: crypto.randomUUID(),
    });
    if (!signed) {
      setBusy(null);
      flag("send", "The wallet didn't sign, so nothing was listed.");
      return;
    }
    const result = await api("/api/listings", listingCreatedSchema, {
      method: "POST",
      body: JSON.stringify({ signed, credential: source ? { kind: "stored", listing_id: source } : { kind: "key", key: apiKey.trim() } }),
    });
    setBusy(null);
    if (!result.ok) {
      flag(source ? "send" : "key", result.message);
      return;
    }
    setApiKey("");
    setNotice({ tone: "up", text: `Listed ${formatMtok(mtok * 1_000_000n)} MTok of ${chosen.id} at ${usd(micro)}. It is in the book now.` });
    await load();
  };

  const draftFor = (listing: SellerListing): Draft =>
    drafts[listing.listing_id] ?? {
      price: formatMicroPerMtok(BigInt(listing.price_micro_per_mtok)),
      capacity: (BigInt(listing.capacity_tokens) / 1_000_000n).toString(),
    };

  const amend = async (listing: SellerListing) => {
    const draft = draftFor(listing);
    const next = parseUsd(draft.price);
    if (next === null || next === 0n || !/^\d{1,9}$/.test(draft.capacity)) {
      setTableNotice({ tone: "down", text: "Enter a price in USD per MTok and a capacity in whole MTok." });
      return;
    }
    setBusy(`amend-${listing.listing_id}`);
    const signed = await sign("amend", {
      listing_id: listing.listing_id,
      price_micro_per_mtok: next.toString(),
      capacity_mtok: draft.capacity,
      client_nonce: crypto.randomUUID(),
    });
    if (!signed) {
      setBusy(null);
      setTableNotice({ tone: "down", text: "The wallet didn't sign, so the listing is unchanged." });
      return;
    }
    const result = await api(`/api/listings/${listing.listing_id}`, anything, { method: "PATCH", body: JSON.stringify({ signed }) });
    setBusy(null);
    setTableNotice(
      result.ok ? { tone: "up", text: `Saved ${listing.model} at ${usd(next)} for ${draft.capacity} MTok.` } : { tone: "down", text: result.message },
    );
    if (result.ok) await load();
  };

  const delist = async (listing: SellerListing) => {
    setBusy(`delist-${listing.listing_id}`);
    const signed = await sign("cancel", { listing_id: listing.listing_id, client_nonce: crypto.randomUUID() });
    if (!signed) {
      setBusy(null);
      setTableNotice({ tone: "down", text: "The wallet didn't sign, so the listing stays live." });
      return;
    }
    const result = await api(`/api/listings/${listing.listing_id}`, anything, { method: "DELETE", body: JSON.stringify({ signed }) });
    setBusy(null);
    setTableNotice(result.ok ? { tone: "up", text: `Delisted ${listing.model}.` } : { tone: "down", text: result.message });
    if (result.ok) await load();
  };

  const paid = (payouts?.data ?? []).filter((payout) => payout.status === "executed");
  const paidTotal = paid.reduce((total, payout) => total + BigInt(payout.amount_usd_micro), 0n);

  return (
    <div className={PAGE}>
      <PageHeader title="Sell spare capacity">
        List a provider key you don&apos;t fully use. Buyers pay in USDC below list price, and the key stays sealed until a request spends it.
      </PageHeader>

      <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Panel title="New listing" bodyClassName="flex flex-col gap-6 pt-6">
          {rails.length === 0 ? (
            <Empty start>No providers are open for listing right now.</Empty>
          ) : (
            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              className="flex flex-col gap-6"
            >
              <ol className="flex max-w-[560px] flex-col gap-6">
                <Step n={1}>
                  <Field label="Provider">
                    <Select
                      value={rail}
                      onChange={(event) => {
                        const next = event.target.value;
                        setRail(next);
                        setModel(preferred(rails.find((entry) => entry.id === next)?.models ?? []));
                        setSource("");
                      }}
                    >
                      {rails.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {railName(entry.id)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </Step>
                <Step n={2}>
                  <Field label="Model" note={list !== null ? `${provider} lists it at ${usd(list)} per MTok, blended three input to one output.` : undefined}>
                    <Select value={model} onChange={(event) => setModel(event.target.value)}>
                      {models.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.id}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </Step>
                <Step n={3}>
                  <div className="flex flex-col gap-3">
                  <Field
                    label="Your price (USD per MTok)"
                    alert={above || problem?.field === "price"}
                    note={
                      problem?.field === "price"
                        ? problem.text
                        : list === null
                        ? undefined
                        : micro === null
                          ? `At or below ${usd(list)}. Lower asks fill first.`
                          : above
                            ? `Above ${provider}'s list price of ${usd(list)}. Buyers can't be charged more than list.`
                            : `${percent(list - micro, list)} below ${provider}'s list price. Lower asks fill first.`
                    }
                  >
                    <input
                      ref={priceRef}
                      value={price}
                      onChange={(event) => setPrice(event.target.value)}
                      placeholder={list === null ? "0.17" : formatMicroPerMtok(list)}
                      inputMode="decimal"
                      autoComplete="off"
                      aria-invalid={above || problem?.field === "price"}
                      className={INPUT}
                    />
                  </Field>
                  <Landing book={book} index={index} price={micro} />
                  </div>
                </Step>
                <Step n={4}>
                  <Field
                    label="Capacity (MTok)"
                    alert={problem?.field === "capacity"}
                    note={
                      problem?.field === "capacity"
                        ? problem.text
                        : ceiling === null
                          ? "The most buyers can draw before you top it up."
                          : `Up to ${usd(ceiling)} if it all sells, after the 10% venue fee.`
                    }
                  >
                    <input
                      ref={capacityRef}
                      value={capacity}
                      onChange={(event) => setCapacity(event.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      aria-invalid={problem?.field === "capacity"}
                      className={INPUT}
                    />
                  </Field>
                </Step>
                <Step n={5}>
                  <div className="flex flex-col gap-3">
                    {reusable.length > 0 ? (
                      <Field label="Key">
                        <Select value={source} onChange={(event) => setSource(event.target.value)}>
                          <option value="">Paste a new key</option>
                          {reusable.map((listing) => (
                            <option key={listing.listing_id} value={listing.listing_id}>
                              Reuse the key from {listing.model}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    ) : null}
                    {source === "" ? (
                      <Field
                        label={`${provider} API key`}
                        alert={problem?.field === "key"}
                        note={
                          problem?.field === "key"
                            ? problem.text
                            : "Checked with one tiny request, then stored encrypted. It's opened only to serve a buyer's request."
                        }
                      >
                        <input
                          ref={keyRef}
                          aria-invalid={problem?.field === "key"}
                          type="password"
                          value={apiKey}
                          onChange={(event) => setApiKey(event.target.value)}
                          autoComplete="off"
                          spellCheck={false}
                          className={`${INPUT} font-mono text-[13px]`}
                        />
                      </Field>
                    ) : null}
                  </div>
                </Step>
              </ol>
              <div className="flex flex-col gap-3 pl-8">
                <CommitButton type="submit" disabled={busy !== null} aria-busy={busy === "list"} className="self-start">
                  {busy === "list"
                    ? "Checking the key"
                    : !accountId
                      ? "Connect wallet to list"
                      : micro !== null && mtok > 0n
                        ? `List ${mtok} MTok at ${usd(micro)}`
                        : "List capacity"}
                </CommitButton>
                {notice ? (
                  <p role="status" className={`text-[13px] leading-[20px] ${notice.tone === "up" ? "text-up" : "text-down"}`}>
                    {notice.text}
                  </p>
                ) : null}
                {problem?.field === "send" ? (
                  <p role="status" className="text-[13px] leading-[20px] text-down">
                    {problem.text}
                  </p>
                ) : null}
              </div>
            </form>
          )}
        </Panel>

        <Panel title="Earnings" bodyClassName="flex flex-col gap-5 pt-6">
          {!accountId ? (
            <p className="text-[13px] leading-[20px] text-muted">Connect your wallet to see what you&apos;ve earned. Payouts land in your NEAR account daily.</p>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-[13px] text-muted">Unpaid</p>
                <p className="text-[28px] leading-none tabular-nums text-ink">{payouts ? usd(BigInt(payouts.unpaid_usd_micro)) : "Reading"}</p>
              </div>
              <dl className="flex flex-col gap-1.5">
                <Line label="Paid so far">{usd(paidTotal)}</Line>
                <Line label="Last payout">{paid[0]?.day ?? "None yet"}</Line>
                <Line label="Paid to">{accountId}</Line>
              </dl>
              {(payouts?.data ?? []).length > 0 ? (
                <ol className="flex flex-col border-t border-line">
                  {(payouts?.data ?? []).slice(0, 8).map((payout) => (
                    <li
                      key={`${payout.day}-${payout.tx_hash ?? "pending"}`}
                      className="grid h-10 grid-cols-[1fr_auto_64px] items-center gap-4 border-b border-line text-[13px] tabular-nums"
                    >
                      <span className="text-muted">{payout.day}</span>
                      <span className="text-ink">{usd(BigInt(payout.amount_usd_micro))}</span>
                      {payout.tx_hash ? (
                        <a href={explorer("txns", payout.tx_hash)} target="_blank" rel="noreferrer" className={`${LINK} justify-self-end text-ink`}>
                          {label(payout.status)}
                        </a>
                      ) : (
                        <span className="justify-self-end text-muted">{label(payout.status)}</span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-[13px] leading-[20px] text-muted">Earnings settle once a day, after the venue fee.</p>
              )}
            </>
          )}
          {MARKETS.some((market) => market === model) ? (
            <p className="text-[13px] leading-[20px] text-muted">
              Your earnings fall if the price of {model} falls.{" "}
              <Link href={`/perps?model=${encodeURIComponent(model)}&side=short`} className={`${LINK} text-ink`}>
                Short the index to hedge
              </Link>
            </p>
          ) : null}
        </Panel>
      </div>

      <Panel title="Your listings" bodyClassName="flex flex-col gap-4 pt-2">
        {!accountId ? (
          <Empty start
            action={
              <button type="button" onClick={() => void connect()} className={SECONDARY}>
                Connect wallet
              </button>
            }
          >
            Connect your wallet to manage what you&apos;ve listed.
          </Empty>
        ) : listings === null ? (
          <Empty start>Reading your listings.</Empty>
        ) : listings.length === 0 ? (
          <Empty start>Nothing listed yet. Your first listing shows up here with its usage.</Empty>
        ) : (
          <Table
            minWidth={880}
            columns={[
              { label: "Model" },
              { label: "Provider" },
              { label: "Status" },
              { label: "Used (MTok)" },
              { label: "Price (USD)" },
              { label: "Capacity (MTok)" },
              { label: "" },
            ]}
          >
            {listings.map((listing) => {
              const draft = draftFor(listing);
              const used = BigInt(listing.used_tokens);
              const total = BigInt(listing.capacity_tokens);
              const live = listing.status !== "cancelled";
              const change = (patch: Partial<Draft>) => setDrafts((all) => ({ ...all, [listing.listing_id]: { ...draft, ...patch } }));
              return (
                <tr key={listing.listing_id} className={ROW}>
                  <td className={TD}>{listing.model}</td>
                  <td className={TD}>{railName(listing.rail)}</td>
                  <td className={`${TD} ${listing.status === "active" ? "text-up" : "text-muted"}`}>{label(listing.status)}</td>
                  <td className={TD}>
                    <div className="flex items-center gap-2">
                      <span aria-hidden className="relative h-1 w-16 bg-hover">
                        <span
                          className="absolute inset-y-0 left-0 bg-accent"
                          style={{ width: `${total > 0n ? Math.min(100, Number((used * 100n) / total)) : 0}%` }}
                        />
                      </span>
                      <span>
                        {formatMtok(used)} of {formatMtok(total)}
                      </span>
                    </div>
                  </td>
                  <td className={TD}>
                    {live ? (
                      <input
                        value={draft.price}
                        onChange={(event) => change({ price: event.target.value })}
                        inputMode="decimal"
                        aria-label={`Price for ${listing.model}, USD per MTok`}
                        className={`${INPUT_SM} w-24`}
                      />
                    ) : (
                      usd(BigInt(listing.price_micro_per_mtok))
                    )}
                  </td>
                  <td className={TD}>
                    {live ? (
                      <input
                        value={draft.capacity}
                        onChange={(event) => change({ capacity: event.target.value })}
                        inputMode="numeric"
                        aria-label={`Capacity for ${listing.model}, in MTok`}
                        className={`${INPUT_SM} w-20`}
                      />
                    ) : (
                      formatMtok(total)
                    )}
                  </td>
                  <td className={`${TD} text-right`}>
                    {live ? (
                      <div className="flex justify-end gap-2">
                        <button type="button" disabled={busy !== null} onClick={() => void amend(listing)} className={SECONDARY}>
                          {busy === `amend-${listing.listing_id}` ? "Signing" : "Save"}
                        </button>
                        <ConfirmButton
                          label="Delist"
                          confirmLabel="Delist"
                          question="Buyers stop drawing on it. Earnings so far are still paid."
                          busy={busy === `delist-${listing.listing_id}` ? "Delisting" : null}
                          disabled={busy !== null}
                          onConfirm={() => void delist(listing)}
                        />
                      </div>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
        {tableNotice ? (
          <p role="status" className={`text-[13px] leading-[20px] ${tableNotice.tone === "up" ? "text-up" : "text-down"}`}>
            {tableNotice.text}
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
