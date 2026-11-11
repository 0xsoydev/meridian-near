import { ChevronDown } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const PAGE = "mx-auto flex w-full max-w-[1120px] flex-col gap-12 px-4 py-10 lg:px-6 lg:py-14";
export const LINK = `underline decoration-line underline-offset-[5px] transition-[text-decoration-color] duration-200 ease-brand hover:decoration-accent ${FOCUS}`;
const BOX = `inline-flex h-10 shrink-0 items-center justify-center gap-1.5 border border-control bg-white text-[13px] transition-[background-color,scale] duration-150 ease-brand enabled:hover:bg-hover enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:text-muted ${FOCUS}`;
export const SECONDARY = `${BOX} px-3 text-ink`;
export const DANGER = `${BOX} px-3 text-down`;
export const ICON = `${BOX} w-10 text-ink`;
export const CHIP = `inline-flex h-8 min-w-0 flex-1 items-center justify-center border border-line bg-white text-[12px] tabular-nums text-ink transition-[background-color,border-color,scale] duration-150 ease-brand enabled:hover:bg-hover enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:text-muted aria-pressed:border-ink aria-pressed:bg-hover ${FOCUS}`;
const FIELD =
  "w-full border border-control bg-white text-ink placeholder:text-muted disabled:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent";
export const INPUT = `${FIELD} h-11 px-3 text-[16px] tabular-nums lg:text-[14px]`;
export const INPUT_SM = `${FIELD} h-10 px-2.5 text-[16px] tabular-nums lg:text-[13px]`;
export const TH = "h-9 whitespace-nowrap px-4 text-[12px] font-normal text-muted";
export const TD = "h-10 whitespace-nowrap px-4 text-[13px] tabular-nums text-ink";
export const ROW = "border-t border-line transition-colors duration-150 ease-brand hover:bg-hover";

const TONES = {
  ink: ["bg-ink enabled:hover:bg-accent", "border-accent"],
  up: ["bg-up enabled:hover:bg-up-hover", "border-up"],
  down: ["bg-down enabled:hover:bg-down-hover", "border-down"],
} as const;

const SPOTS = [
  "-left-[6px] -top-[6px] border-l border-t [.group:enabled:hover_&]:-translate-x-[3px] [.group:enabled:hover_&]:-translate-y-[3px]",
  "-right-[6px] -top-[6px] border-r border-t [.group:enabled:hover_&]:translate-x-[3px] [.group:enabled:hover_&]:-translate-y-[3px]",
  "-bottom-[6px] -left-[6px] border-b border-l [.group:enabled:hover_&]:-translate-x-[3px] [.group:enabled:hover_&]:translate-y-[3px]",
  "-bottom-[6px] -right-[6px] border-b border-r [.group:enabled:hover_&]:translate-x-[3px] [.group:enabled:hover_&]:translate-y-[3px]",
];

export function CommitButton({
  tone = "ink",
  type = "button",
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: keyof typeof TONES }) {
  const [fill, corner] = TONES[tone];
  return (
    <button
      type={type}
      {...props}
      className={`group relative inline-flex h-[46px] items-center justify-center gap-2 px-9 text-[16px] text-white transition-[background-color,scale] duration-200 ease-brand enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-disabled focus-visible:outline-2 focus-visible:outline-offset-[10px] focus-visible:outline-accent motion-reduce:transition-none ${fill} ${className}`}
    >
      {SPOTS.map((spot) => (
        <span
          key={spot}
          aria-hidden
          className={`absolute size-[10px] transition-transform duration-200 ease-brand motion-reduce:transition-none [.group:disabled_&]:border-control ${corner} ${spot}`}
        />
      ))}
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

export function Toggle<T extends string>({
  label,
  value,
  onChange,
  items,
  big = false,
  className = "",
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: ReadonlyArray<{ value: T; label: string; tone?: "up" | "down"; hotkey?: string }>;
  big?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={`flex items-center ${big ? "gap-7" : "gap-5"} ${className}`}>
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
            className={`${big ? "text-[16px]" : "text-[13px]"} inline-flex h-10 items-center gap-2 whitespace-nowrap transition-[color] duration-200 ease-brand ${FOCUS} ${
              active ? on : "text-muted decoration-transparent hover:text-ink"
            }`}
          >
            <span className="underline decoration-inherit underline-offset-[6px] transition-[text-decoration-color] duration-200 ease-brand">
              {item.label}
            </span>
            {item.hotkey ? (
              <span className="hidden lg:inline-flex">
                <Kbd>{item.hotkey}</Kbd>
              </span>
            ) : null}
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
  items: ReadonlyArray<{ value: T; label: string }>;
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
            className={`h-[52px] text-[14px] transition-[color,box-shadow] duration-200 ease-brand ${FOCUS} ${
              active ? "text-ink shadow-[inset_0_2px_0_var(--color-accent)]" : "text-muted"
            }`}
          >
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
      {note ? <p className={`text-pretty text-[12px] leading-[18px] ${alert ? "text-down" : "text-muted"}`}>{note}</p> : null}
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

export function MarketSelect({
  value,
  onChange,
  groups,
}: {
  value: string;
  onChange: (model: string) => void;
  groups: ReadonlyArray<{ label: string; models: ReadonlyArray<string> }>;
}) {
  return (
    <label className="group relative inline-flex h-12 min-w-0 max-w-full shrink-0 cursor-pointer items-center gap-2 has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-4 has-[select:focus-visible]:outline-accent">
      <span className="sr-only">Market</span>
      <span
        aria-hidden
        className="truncate font-serif text-[28px] leading-[1.2] text-ink underline decoration-transparent underline-offset-[6px] transition-[text-decoration-color] duration-200 ease-brand group-hover:decoration-ink"
      >
        {value || "Choose a market"}
      </span>
      <ChevronDown aria-hidden className="size-5 shrink-0 text-ink" />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {groups.map((group) =>
          group.models.length === 0 ? null : (
            <optgroup key={group.label} label={group.label}>
              {group.models.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </optgroup>
          ),
        )}
      </select>
    </label>
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
  className = "",
  children,
}: {
  label: string;
  tone?: "up" | "down" | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`flex min-w-0 flex-col gap-0.5 lg:shrink-0 ${className}`}>
      <dt className="truncate text-[12px] text-muted">{label}</dt>
      <dd className={`truncate text-[13px] tabular-nums ${tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-ink"}`}>
        {children}
      </dd>
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
                {column.label}
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
