"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { FOCUS } from "./kit";

const LOGOS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^claude/, "claude.svg"],
  [/^(gpt|o\d|whisper)/, "openai.svg"],
  [/^deepseek/, "deepseek.svg"],
  [/^gemini/, "gemini.svg"],
  [/^grok/, "grok.svg"],
  [/^glm/, "zhipu.svg"],
  [/^qwen/, "qwen.svg"],
  [/^kimi/, "kimi.svg"],
  [/^minimax/, "minimax.svg"],
  [/^mimo/, "mimo.svg"],
  [/^step/, "stepfun.svg"],
  [/^nemotron/, "nvidia.svg"],
  [/^hy\d/, "hunyuan.svg"],
  [/^longcat/, "longcat.svg"],
  [/^ling/, "ling.svg"],
  [/^flux/, "flux.svg"],
  [/^muse/, "meta.svg"],
  [/^fugu/, "sakana.svg"],
  [/^inkling/, "thinkingmachines.png"],
  [/^sage/, "levanto.png"],
];

export function ModelLogo({ model, size }: { model: string; size: number }) {
  const file = LOGOS.find(([pattern]) => pattern.test(model))?.[1];
  return file ? (
    <img src={`/images/models/${file}`} alt="" width={size} height={size} className="shrink-0 object-contain" style={{ width: size, height: size }} />
  ) : (
    <span
      aria-hidden
      className="inline-flex shrink-0 items-center justify-center border border-line text-[11px] uppercase leading-none text-muted"
      style={{ width: size, height: size }}
    >
      {model.slice(0, 1)}
    </span>
  );
}

export type MarketGroup = { label: string; models: ReadonlyArray<{ id: string; price: string | null }> };

export function MarketPicker({ value, onChange, groups }: { value: string; onChange: (model: string) => void; groups: ReadonlyArray<MarketGroup> }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const total = groups.reduce((count, group) => count + group.models.length, 0);
  const searchable = total > 8;
  const wanted = query.trim().toLowerCase();
  const shown = groups
    .map((group) => ({ ...group, models: group.models.filter((model) => model.id.includes(wanted)) }))
    .filter((group) => group.models.length > 0);
  const flat = shown.flatMap((group) => group.models);
  const option = (model: string) => `${id}-${model}`;
  const current = flat[active];

  useEffect(() => {
    if (!open) return;
    const away = (event: MouseEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    (searchable ? search.current : list.current)?.focus();
    return () => document.removeEventListener("mousedown", away);
  }, [open, searchable]);

  useEffect(() => {
    if (open) list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const show = () => {
    setQuery("");
    setActive(Math.max(0, groups.flatMap((group) => group.models).findIndex((model) => model.id === value)));
    setOpen(true);
  };

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };

  const choose = (model: string) => {
    onChange(model);
    close();
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 8, PageUp: -8 };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      setActive((index) => Math.min(flat.length - 1, Math.max(0, index + move)));
    } else if (!searchable && (event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      setActive(event.key === "Home" ? 0 : flat.length - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (current) choose(current.id);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div ref={root} className="relative min-w-0 max-w-full shrink-0">
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        className={`group inline-flex h-12 min-w-0 max-w-full items-center gap-2.5 ${FOCUS}`}
      >
        <span className="sr-only">Market: </span>
        {value ? <ModelLogo model={value} size={22} /> : null}
        <span className="truncate font-serif text-[28px] leading-[1.2] text-ink underline decoration-transparent underline-offset-[6px] transition-[text-decoration-color] duration-200 ease-brand group-hover:decoration-ink">
          {value || "Choose a market"}
        </span>
        <ChevronDown aria-hidden className={`size-5 shrink-0 text-ink transition-transform duration-200 ease-brand ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div
          onKeyDown={onKey}
          className="absolute left-0 top-full z-50 mt-2 flex w-[min(420px,calc(100vw-2rem))] flex-col border border-line bg-white shadow-[0_16px_40px_-16px_rgb(30_30_30/0.28)]"
        >
          {searchable ? (
            <label className="flex h-11 shrink-0 items-center gap-2 border-b border-line px-3">
              <Search aria-hidden className="size-4 shrink-0 text-muted" />
              <span className="sr-only">Search models</span>
              <input
                ref={search}
                role="combobox"
                aria-expanded="true"
                aria-controls={`${id}-list`}
                aria-autocomplete="list"
                aria-activedescendant={current ? option(current.id) : undefined}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setActive(0);
                }}
                placeholder={`Search ${total} models`}
                autoComplete="off"
                spellCheck={false}
                className="h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-muted lg:text-[14px]"
              />
            </label>
          ) : null}
          <ul
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-label="Markets"
            tabIndex={-1}
            aria-activedescendant={!searchable && current ? option(current.id) : undefined}
            className="max-h-[min(60vh,440px)] overflow-y-auto pb-1 outline-none"
          >
            {shown.length === 0 ? (
              <li role="presentation" className="px-3 py-6 text-center text-[13px] text-muted">
                No model matches {query.trim()}.
              </li>
            ) : (
              shown.map((group) => (
                <li key={group.label} role="presentation">
                  <p aria-hidden className="sticky top-0 z-10 bg-white px-3 pb-1 pt-3 text-[12px] text-muted">
                    {group.label}
                  </p>
                  <ul role="group" aria-label={group.label}>
                    {group.models.map((model) => {
                      const index = flat.indexOf(model);
                      const selected = model.id === value;
                      return (
                        <li
                          key={model.id}
                          id={option(model.id)}
                          role="option"
                          aria-selected={selected}
                          data-index={index}
                          onMouseMove={() => setActive(index)}
                          onClick={() => choose(model.id)}
                          className={`flex h-10 cursor-pointer items-center gap-3 px-3 transition-colors duration-100 ease-brand ${index === active ? "bg-hover" : ""}`}
                        >
                          <ModelLogo model={model.id} size={18} />
                          <span className="min-w-0 flex-1 truncate font-serif text-[18px] leading-none text-ink">{model.id}</span>
                          {model.price === null ? null : <span className="shrink-0 text-[13px] tabular-nums text-muted">{model.price}</span>}
                          <Check aria-hidden className={`size-4 shrink-0 text-accent ${selected ? "" : "invisible"}`} />
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
