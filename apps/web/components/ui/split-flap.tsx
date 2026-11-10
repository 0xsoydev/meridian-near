"use client";

/**
 * Adapted from Kokonut UI's Split Flap Text (MIT).
 * https://kokonutui.com/docs/texts/split-flap-text
 */

import { useReducedMotion } from "motion/react";
import { type CSSProperties, type Ref, useEffect, useLayoutEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

const CHARSET = " 0123456789.-+%";
const FLIP = 56;
const STAGGER = 40;

function Half({ char, half, ref, style }: { char: string; half: "top" | "bottom"; ref?: Ref<HTMLSpanElement>; style?: CSSProperties }) {
  return (
    <span
      ref={ref}
      style={style}
      className={cn("absolute inset-x-0 h-1/2 overflow-hidden bg-inherit backface-hidden", half === "top" ? "top-0" : "bottom-0")}
    >
      <span className={cn("absolute inset-x-0 flex h-[200%] items-center justify-center", half === "top" ? "top-0" : "bottom-0")}>{char}</span>
    </span>
  );
}

function Tile({ target, delay, reduced, className }: { target: string; delay: number; reduced: boolean; className: string | undefined }) {
  const [shown, setShown] = useState(" ");
  const [flip, setFlip] = useState<{ id: number; from: string; to: string } | null>(null);
  const current = useRef(" ");
  const top = useRef<HTMLSpanElement>(null);
  const bottom = useRef<HTMLSpanElement>(null);
  const shade = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (reduced) {
      current.current = target;
      setShown(target);
      setFlip(null);
      return;
    }
    let timer: ReturnType<typeof setTimeout>;
    let id = 0;
    const step = () => {
      const from = current.current;
      if (from === target) {
        setFlip(null);
        return;
      }
      const to = CHARSET[(CHARSET.indexOf(from) + 1) % CHARSET.length] ?? " ";
      id += 1;
      setFlip({ id, from, to });
      timer = setTimeout(() => {
        current.current = to;
        setShown(to);
        step();
      }, FLIP);
    };
    timer = setTimeout(step, delay);
    return () => clearTimeout(timer);
  }, [target, delay, reduced]);

  useLayoutEffect(() => {
    if (!flip) return;
    const half = FLIP / 2;
    top.current?.animate([{ transform: "rotateX(0deg)" }, { transform: "rotateX(-90deg)" }], {
      duration: half,
      easing: "cubic-bezier(0.5, 0, 0.9, 0.6)",
      fill: "forwards",
    });
    bottom.current?.animate([{ transform: "rotateX(90deg)" }, { transform: "rotateX(0deg)" }], {
      duration: half,
      delay: half,
      easing: "cubic-bezier(0.2, 0.6, 0.3, 1)",
      fill: "both",
    });
    shade.current?.animate([{ opacity: 0 }, { opacity: 1 }, { opacity: 0 }], { duration: FLIP, easing: "linear" });
  }, [flip]);

  return (
    <span
      aria-hidden
      className={cn(
        "relative inline-block h-[1.3em] w-[0.78em] rounded-[0.08em] bg-[#2b2b2b] text-on-dark shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] [perspective:5em]",
        className,
      )}
    >
      <Half char={flip ? flip.to : shown} half="top" />
      <Half char={flip ? flip.from : shown} half="bottom" />
      <span ref={shade} className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-black/50 opacity-0" />
      {flip ? (
        <>
          <Half key={`t-${flip.id}`} ref={top} char={flip.from} half="top" style={{ transformOrigin: "50% 100%" }} />
          <Half key={`b-${flip.id}`} ref={bottom} char={flip.to} half="bottom" style={{ transformOrigin: "50% 0%", transform: "rotateX(90deg)" }} />
        </>
      ) : null}
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-black/70" />
    </span>
  );
}

export function SplitFlap({ text, length, delay = 0, className, tileClassName }: { text: string; length: number; delay?: number; className?: string; tileClassName?: string | undefined }) {
  const reduced = useReducedMotion() ?? false;
  const padded = [...text]
    .map((char) => (CHARSET.includes(char) ? char : " "))
    .join("")
    .padStart(length, " ")
    .slice(-length);
  return (
    <span className={cn("inline-flex gap-[0.08em] leading-none tabular-nums", className)}>
      <span className="sr-only">{text}</span>
      {[...padded].map((char, position) => (
        <Tile key={position} target={char} delay={delay + position * STAGGER} reduced={reduced} className={tileClassName} />
      ))}
    </span>
  );
}
