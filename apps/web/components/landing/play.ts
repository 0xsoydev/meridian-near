"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";

export const EASE = [0.22, 1, 0.36, 1] as const;

export function usePlayOnce(beats: ReadonlyArray<number>, amount = 0.45) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount });
  const reduced = useReducedMotion() ?? false;
  const [phase, setPhase] = useState(0);
  const timers = useRef<number[]>([]);

  const play = useCallback(() => {
    for (const timer of timers.current) window.clearTimeout(timer);
    setPhase(0);
    timers.current = beats.map((at, index) => window.setTimeout(() => setPhase(index + 1), at));
  }, [beats]);

  useEffect(() => {
    if (reduced) setPhase(beats.length);
    else if (seen) play();
    return () => {
      for (const timer of timers.current) window.clearTimeout(timer);
    };
  }, [seen, reduced, play, beats.length]);

  return { ref, phase, play, reduced, done: phase >= beats.length };
}
