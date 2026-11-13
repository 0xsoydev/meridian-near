"use client";

import { ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import { FOCUS, SECONDARY } from "../kit";

export type Sequence = ReturnType<typeof useSequence>;

export function useSequence(ref: RefObject<Element | null>, holds: readonly number[]) {
  const last = holds.length - 1;
  const reduced = useReducedMotion();
  const near = useInView(ref, { margin: "0px 0px 320px 0px" });
  const inView = useInView(ref, { amount: 0.35 });
  const primed = useRef(false);
  const [step, setStep] = useState(last);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    if (reduced || primed.current || !near) return;
    primed.current = true;
    if (inView) return;
    setStep(0);
    setPlaying(true);
  }, [reduced, near, inView]);

  useEffect(() => {
    if (!playing || !inView) return;
    if (step >= last) {
      setPlaying(false);
      return;
    }
    const id = window.setTimeout(() => setStep(step + 1), holds[step]);
    return () => window.clearTimeout(id);
  }, [playing, inView, step, last, holds]);

  return {
    step,
    last,
    playing,
    running: playing && inView && step < last,
    hold: holds[step] ?? 0,
    go(next: number) {
      setPlaying(false);
      setStep(next);
    },
    toggle() {
      if (playing) {
        setPlaying(false);
        return;
      }
      if (step >= last) setStep(0);
      setPlaying(true);
    },
  };
}

export function PlayButton({ seq, className = "" }: { seq: Sequence; className?: string }) {
  const done = !seq.playing && seq.step >= seq.last;
  const Icon = seq.playing ? Pause : done ? RotateCcw : Play;
  return (
    <button type="button" onClick={seq.toggle} className={`${SECONDARY} gap-2 ${className}`}>
      <Icon aria-hidden className="size-3.5" />
      {seq.playing ? "Pause" : done ? "Replay" : "Play"}
    </button>
  );
}

const MARKS = [
  "-left-px -top-px border-l border-t",
  "-right-px -top-px border-r border-t",
  "-bottom-px -left-px border-b border-l",
  "-bottom-px -right-px border-b border-r",
];

export function Stage({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`blueprint relative border border-line bg-white ${className}`}>
      {MARKS.map((mark) => (
        <span key={mark} aria-hidden className={`absolute size-3 border-accent ${mark}`} />
      ))}
      <span aria-hidden className="absolute right-3 top-2 text-[12px] leading-[18px] text-muted">
        [ example ]
      </span>
      {children}
    </div>
  );
}

export function Actor({
  title,
  meta,
  logo,
  children,
  className = "",
}: {
  title: string;
  meta?: ReactNode;
  logo?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`relative flex min-w-0 flex-col gap-4 border border-line bg-white p-4 ${className}`}>
      <div className="flex items-center gap-2.5">
        {logo ? <img src={logo} alt="" width={20} height={20} className="size-5 shrink-0 object-contain" /> : null}
        <p className="min-w-0 flex-1 truncate text-[14px] leading-[20px] text-ink">{title}</p>
        {meta ? <span className="shrink-0 text-[12px] leading-[18px] text-muted">{meta}</span> : null}
      </div>
      {children}
    </div>
  );
}

export function Connector({ label }: { label: string }) {
  return (
    <div aria-hidden className="flex items-center justify-center gap-3 py-3 lg:flex-col lg:gap-2 lg:px-1 lg:py-0">
      <span className="order-2 text-[13px] leading-[17px] text-muted lg:order-1 lg:text-center">{label}</span>
      <span className="order-1 flex flex-col items-center text-accent lg:order-2 lg:w-full lg:flex-row">
        <span className="h-6 border-l border-dashed border-accent/70 lg:h-0 lg:w-full lg:border-l-0 lg:border-t" />
        <ChevronRight className="-mt-1 size-3.5 rotate-90 lg:-ml-1.5 lg:mt-0 lg:rotate-0" />
      </span>
    </div>
  );
}

export type TileKind = "used" | "spare" | "listed" | "bought";

const TILE: Record<TileKind, string> = {
  used: "border-ink bg-ink",
  spare: "border-dashed border-accent/70 bg-white",
  listed: "border-accent bg-accent/15",
  bought: "border-accent bg-accent",
};

const TILE_SIZE = "size-3.5 xl:size-4";

export function Tile({ id, kind, delay = 0 }: { id: string; kind: TileKind; delay?: number }) {
  return (
    <motion.span
      layoutId={id}
      transition={{ layout: { type: "spring", stiffness: 190, damping: 26, delay } }}
      className={`relative z-10 block border transition-[background-color,border-color] duration-500 ease-brand ${TILE_SIZE} ${TILE[kind]}`}
    />
  );
}

export function Slot() {
  return <span className={`block border border-line/80 ${TILE_SIZE}`} />;
}

export function Swatch({ kind }: { kind: TileKind }) {
  return <span aria-hidden className={`block size-3 shrink-0 border ${TILE[kind]}`} />;
}

export function Steps({
  items,
  active,
  seq,
  progress = false,
  grid,
  className = "",
}: {
  items: ReadonlyArray<{ title: string; body?: string; frame: number }>;
  active: number;
  seq: Sequence;
  progress?: boolean;
  grid: string;
  className?: string;
}) {
  const caption = items[active]?.body;
  return (
    <div className={className}>
      <ol className={`grid gap-x-2 sm:gap-x-6 ${grid}`}>
        {items.map((item, index) => {
          const on = index === active;
          const filling = on && progress && seq.running;
          return (
            <li key={item.title} className="min-w-0">
              <button
                type="button"
                aria-current={on ? "step" : undefined}
                onClick={() => seq.go(item.frame)}
                className={`flex h-full w-full flex-col gap-2 px-3 pb-4 pt-4 text-left transition-[background-color] duration-200 ease-brand hover:bg-hover ${FOCUS}`}
              >
                <span aria-hidden className="relative block h-0.5 w-full overflow-hidden bg-line">
                  <span
                    key={filling ? `fill-${seq.step}` : "still"}
                    className={`absolute inset-0 origin-left bg-accent ${
                      filling ? "animate-grow" : index < active || on ? "scale-x-100" : "scale-x-0"
                    } transition-transform duration-300 ease-brand`}
                    style={filling ? { animationDuration: `${seq.hold}ms` } : undefined}
                  />
                </span>
                <span className="flex items-baseline gap-2.5 pt-1 text-[16px] leading-[22px]">
                  <span className={`tabular-nums transition-colors duration-200 ${on ? "text-accent" : "text-muted"}`}>{index + 1}</span>
                  <span className="text-ink">{item.title}</span>
                </span>
                {item.body ? <span className="hidden text-pretty text-[14px] leading-[21px] text-muted lg:block">{item.body}</span> : null}
              </button>
            </li>
          );
        })}
      </ol>
      {caption ? (
        <p aria-live="polite" className="min-h-[63px] text-pretty px-3 pt-1 text-[15px] leading-[21px] text-muted lg:hidden">
          {caption}
        </p>
      ) : null}
    </div>
  );
}
