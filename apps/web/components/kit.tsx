import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const NIL = "—";
export const PAGE = "mx-auto flex w-full max-w-[1120px] flex-col gap-12 px-4 py-10 lg:px-6 lg:py-14";
export const LINK = `underline decoration-line underline-offset-[5px] transition-[text-decoration-color] duration-200 ease-brand hover:decoration-accent ${FOCUS}`;
const BOX = `inline-flex h-10 shrink-0 items-center justify-center gap-1.5 border border-control bg-white text-[13px] transition-[background-color,scale] duration-150 ease-brand enabled:hover:bg-hover enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:border-line disabled:bg-wash disabled:text-control ${FOCUS}`;
export const SECONDARY = `${BOX} px-3 text-ink`;
export const DANGER = `${BOX} px-3 text-down`;
export const ICON = `${BOX} w-10 text-ink`;
export const SMALL = `inline-flex h-8 shrink-0 items-center justify-center border border-control bg-white px-3 text-[13px] text-ink transition-[background-color,scale] duration-150 ease-brand enabled:hover:bg-hover enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:border-line disabled:bg-wash disabled:text-control ${FOCUS}`;
const FIELD =
  "w-full border border-control bg-white text-ink placeholder:text-muted disabled:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent";
export const INPUT = `${FIELD} h-11 px-3 text-[16px] tabular-nums lg:text-[14px]`;
export const INPUT_SM = `${FIELD} h-10 px-2.5 text-[16px] tabular-nums lg:text-[13px]`;
export const TH = "h-9 whitespace-nowrap px-4 text-[13px] font-normal text-muted";
export const TD = "h-10 whitespace-nowrap px-4 text-[13px] tabular-nums text-ink";
export const ROW = "border-t border-line transition-colors duration-150 ease-brand hover:bg-hover";

const TONES = {
  ink: "bg-ink enabled:hover:bg-accent",
  up: "bg-up enabled:hover:bg-up-hover",
  down: "bg-down enabled:hover:bg-down-hover",
} as const;

export function CommitButton({
  tone = "ink",
  type = "button",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof TONES }) {
  return (
    <button
      type={type}
      {...props}
      className={`inline-flex h-[46px] items-center justify-center gap-2 px-9 text-[16px] text-white transition-[background-color,scale] duration-200 ease-brand enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-disabled motion-reduce:transition-none ${FOCUS} ${TONES[tone]} ${className}`}
    >
      {children}
    </button>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center border border-line px-1 font-sans text-[12px] leading-none text-muted no-underline">
      {children}
    </kbd>
  );
}

type Choice<T extends string> = { value: T; label: string; tone?: "up" | "down"; hotkey?: string };

export function Toggle<T extends string>({
  label,
  value,
  onChange,
  items,
  className = "",
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: ReadonlyArray<Choice<T>>;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`flex items-center gap-5 ${className}`}>
      {items.map((item) => {
        const active = item.value === value;
        const on =
          item.tone === "up"
            ? "text-up decoration-up"
            : item.tone === "down"
              ? "text-down decoration-down"
              : "text-ink decoration-accent";
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            aria-keyshortcuts={item.hotkey}
            onClick={() => onChange(item.value)}
            title={item.hotkey ? `Shortcut: ${item.hotkey}` : undefined}
            className={`group inline-flex h-10 items-center gap-2 whitespace-nowrap text-[13px] transition-[color] duration-200 ease-brand ${FOCUS} ${
              active ? on : "text-muted decoration-transparent hover:text-ink"
            }`}
          >
            <span className="underline decoration-inherit underline-offset-[6px] transition-[text-decoration-color] duration-200 ease-brand">
              {item.label}
            </span>
            {item.hotkey ? (
              <span className="hidden opacity-0 transition-opacity duration-150 ease-brand group-hover:opacity-100 group-focus-visible:opacity-100 lg:inline-flex">
                <Kbd>{item.hotkey}</Kbd>
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  items,
  className = "",
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: ReadonlyArray<Choice<T>>;
  className?: string;
}) {
  const at = Math.max(0, items.findIndex((item) => item.value === value));
  const tone = items[at]?.tone;
  return (
    <div
      role="group"
      aria-label={label}
      className={`relative grid h-11 border border-control bg-white p-[3px] ${className}`}
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className={`absolute inset-y-[3px] left-[3px] transition-[translate,background-color] duration-200 ease-brand motion-reduce:transition-none ${
          tone === "up" ? "bg-up" : tone === "down" ? "bg-down" : "bg-ink"
        }`}
        style={{ width: `calc((100% - 6px) / ${items.length})`, translate: `${at * 100}%` }}
      />
      {items.map((item) => {
        const active = item.value === value;
        const hover = item.tone === "up" ? "hover:text-up" : item.tone === "down" ? "hover:text-down" : "hover:text-ink";
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            aria-keyshortcuts={item.hotkey}
            onClick={() => onChange(item.value)}
            className={`relative whitespace-nowrap text-[14px] tabular-nums transition-[color,background-color] duration-200 ease-brand ${FOCUS} ${
              active ? "text-white" : `text-muted hover:bg-hover ${hover}`
            }`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function MobileTabs<T extends string>({
  value,
  onChange,
  items,
}: {
  value: T;
  onChange: (value: T) => void;
  items: ReadonlyArray<{ value: T; label: string; icon: LucideIcon }>;
}) {
  return (
    <div
      role="group"
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-40 grid border-t border-line bg-white lg:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={`flex h-[52px] flex-col items-center justify-center gap-1 text-[12px] leading-4 transition-[color,box-shadow] duration-200 ease-brand ${FOCUS} ${
              active ? "text-ink shadow-[inset_0_2px_0_var(--color-accent)]" : "text-muted"
            }`}
          >
            <item.icon aria-hidden className="size-4" />
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function Field({
  label,
  note,
  alert = false,
  className = "",
  children,
}: {
  label: string;
  note?: ReactNode;
  alert?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">{label}</span>
        {children}
      </label>
      {note ? <p className={`text-pretty text-[13px] leading-[19px] ${alert ? "text-down" : "text-muted"}`}>{note}</p> : null}
    </div>
  );
}

export function Select({ className = "", children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <span className={`relative flex ${className}`}>
      <select {...props} className={`${INPUT} cursor-pointer appearance-none pr-9`}>
        {children}
      </select>
      <ChevronDown aria-hidden className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
    </span>
  );
}

export function Panel({
  title,
  aside,
  inset = false,
  className = "",
  bodyClassName = "",
  children,
}: {
  title: string;
  aside?: ReactNode;
  inset?: boolean;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={`flex min-h-0 min-w-0 flex-col ${className}`}>
      <div className={`flex h-10 shrink-0 items-center justify-between gap-3 border-b border-line ${inset ? "px-4" : ""}`}>
        <h2 className="whitespace-nowrap text-[13px] text-ink">
          <span aria-hidden>[ </span>
          {title}
          <span aria-hidden> ]</span>
        </h2>
        {aside}
      </div>
      <div className={`relative min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

export function PageHeader({ title, aside, children }: { title: string; aside?: ReactNode; children?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-8">
      <div className="flex max-w-[640px] flex-col gap-3">
        <h1 className="text-balance font-serif text-[34px] leading-[1.06] tracking-[-0.01em] text-ink lg:text-[44px]">{title}</h1>
        {children ? <p className="text-pretty text-[16px] leading-[24px] text-ink">{children}</p> : null}
      </div>
      {aside}
    </header>
  );
}

export function Stat({
  label,
  tone,
  big = false,
  className = "",
  children,
}: {
  label: string;
  tone?: "up" | "down" | undefined;
  big?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 lg:shrink-0 ${className}`}>
      <dt className="truncate text-[13px] text-muted">{label}</dt>
      <dd
        className={`truncate tabular-nums ${big ? "font-serif text-[22px] leading-[26px] lg:text-[28px] lg:leading-[32px]" : "text-[13px]"} ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}`}
      >
        {children}
      </dd>
    </div>
  );
}

export function Pair({ label, tone, children }: { label: string; tone?: "up" | "down" | undefined; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <dt className="text-muted">{label}</dt>
      <dd className={tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}>{children}</dd>
    </div>
  );
}

export function Line({
  label,
  tone,
  children,
}: {
  label: string;
  tone?: "up" | "down" | "muted" | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd
        className={`text-right tabular-nums ${
          tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "muted" ? "text-muted" : "text-ink"
        }`}
      >
        {children}
      </dd>
    </div>
  );
}

export function Empty({ action, start = false, children }: { action?: ReactNode; start?: boolean; children: ReactNode }) {
  return (
    <div
      className={`flex flex-col gap-3 text-[13px] text-muted ${start ? "items-start py-2" : "items-center justify-center px-6 py-10 text-center"}`}
    >
      <p className={start ? "max-w-[60ch] text-pretty" : "max-w-[40ch] text-balance"}>{children}</p>
      {action}
    </div>
  );
}

export function Table({
  columns,
  minWidth = 640,
  children,
}: {
  columns: ReadonlyArray<{ label: string; end?: boolean }>;
  minWidth?: number;
  children: ReactNode;
}) {
  return (
    <div tabIndex={0} className={`overflow-x-auto ${FOCUS}`}>
      <table className="w-full border-collapse" style={{ minWidth }}>
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={`${column.label}-${index}`} scope="col" className={`${TH} ${column.end ? "text-right" : "text-left"}`}>
                {column.label || <span className="sr-only">Actions</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block bg-hover motion-safe:animate-pulse ${className}`} />;
}
