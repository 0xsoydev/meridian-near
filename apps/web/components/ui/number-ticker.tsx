"use client";

/**
 * Adapted from Magic UI's Number Ticker (MIT).
 * https://magicui.design/docs/components/number-ticker
 */

import { useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useEffect, useRef, useState } from "react";

function format(value: number, decimals: number, prefix: string, signed: boolean) {
  const body = Math.abs(value).toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const zero = Number(body.replace(/,/g, "")) === 0;
  const sign = zero ? "" : value < 0 ? "−" : signed ? "+" : "";
  return `${sign}${prefix}${body}`;
}

export function NumberTicker({
  value,
  decimals = 2,
  prefix = "$",
  signed = false,
  className = "",
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  signed?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const target = useMotionValue(value);
  const spring = useSpring(target, { damping: 40, stiffness: 140 });
  const [initial] = useState(() => format(value, decimals, prefix, signed));

  useEffect(() => {
    if (reduced) spring.jump(value);
    else target.set(value);
  }, [value, reduced, spring, target]);

  useEffect(
    () =>
      spring.on("change", (latest) => {
        if (ref.current) ref.current.textContent = format(latest, decimals, prefix, signed);
      }),
    [spring, decimals, prefix, signed],
  );

  return (
    <span ref={ref} className={`whitespace-nowrap tabular-nums ${className}`}>
      {initial}
    </span>
  );
}
