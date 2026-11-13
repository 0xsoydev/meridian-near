"use client";

import { useId, useRef, type ComponentProps, type CSSProperties, type ReactNode } from "react";
import { FOCUS } from "./kit";

export function Amount({
  label,
  unit,
  note,
  alert = false,
  end,
  id,
  className = "",
  ...props
}: ComponentProps<"input"> & { label: string; unit?: string; note?: ReactNode; alert?: boolean; end?: ReactNode }) {
  const auto = useId();
  const field = id ?? auto;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <div
        className={`flex h-11 items-center gap-3 border bg-white pl-3 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:-outline-offset-1 has-[input:focus-visible]:outline-accent ${
          end ? "pr-1" : "pr-3"
        } ${alert ? "border-down" : "border-control"}`}
      >
        <label htmlFor={field} className="shrink-0 cursor-text text-[13px] text-muted">
          {label}
          {unit ? <span className="sr-only"> in {unit}</span> : null}
        </label>
        <input
          id={field}
          {...props}
          aria-invalid={alert}
          className="h-full min-w-0 flex-1 bg-transparent text-right text-[16px] tabular-nums text-ink outline-none placeholder:text-muted lg:text-[14px]"
        />
        {unit ? (
          <span aria-hidden className="shrink-0 text-[13px] text-muted">
            {unit}
          </span>
        ) : null}
        {end}
      </div>
      {note ? <p className={`text-pretty text-[13px] leading-[19px] ${alert ? "text-down" : "text-muted"}`}>{note}</p> : null}
    </div>
  );
}

const STOPS = [0, 25, 50, 75, 100] as const;

export function Portion({ value, label, onChange }: { value: number; label: string; onChange: (percent: number) => void }) {
  const dragging = useRef(false);
  const fill: CSSProperties & Record<"--fill", string> = { "--fill": `${value}%` };
  const at = (stop: number) => ({ left: `calc(7px + (100% - 14px) * ${stop / 100})` });
  return (
    <div className="flex flex-col gap-1">
      <div className="relative flex h-5 items-center">
        {STOPS.map((stop) => (
          <span
            key={stop}
            aria-hidden
            className={`absolute size-[6px] -translate-x-1/2 transition-colors duration-150 ease-brand ${value >= stop ? "bg-accent" : "bg-line"}`}
            style={at(stop)}
          />
        ))}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          aria-label={label}
          aria-valuetext={`${value}%`}
          onPointerDown={() => {
            dragging.current = true;
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
          onChange={(event) => {
            const raw = Number(event.target.value);
            onChange(dragging.current ? (STOPS.find((stop) => Math.abs(stop - raw) <= 2) ?? raw) : raw);
          }}
          style={fill}
          className={`range relative h-5 w-full ${FOCUS}`}
        />
      </div>
      <div aria-hidden className="relative h-5 text-[12px] leading-5 tabular-nums">
        {STOPS.map((stop) => (
          <button
            key={stop}
            type="button"
            tabIndex={-1}
            onClick={() => onChange(stop)}
            style={stop === 0 || stop === 100 ? undefined : at(stop)}
            className={`absolute top-0 transition-colors duration-150 ease-brand hover:text-ink ${
              stop === 0 ? "left-0" : stop === 100 ? "right-0" : "-translate-x-1/2"
            } ${value === stop ? "text-ink" : "text-muted"}`}
          >
            {stop === 100 ? "Max" : `${stop}%`}
          </button>
        ))}
      </div>
    </div>
  );
}
