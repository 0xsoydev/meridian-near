"use client";

import { motion, useReducedMotion, useScroll } from "motion/react";
import { type ReactNode, useRef } from "react";

export function Frame({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const reduced = useReducedMotion();

  return (
    <div ref={ref} className="relative mx-auto max-w-[1520px] lg:border-x lg:border-line">
      {reduced ? null : (
        <motion.span
          aria-hidden
          style={{ scaleY: scrollYProgress }}
          className="pointer-events-none absolute -left-px top-0 z-30 hidden h-full w-px origin-top bg-accent lg:block"
        />
      )}
      {children}
    </div>
  );
}
