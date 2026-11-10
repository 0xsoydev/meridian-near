"use client";

/**
 * Adapted from Magic UI's Animated Beam (MIT).
 * https://magicui.design/docs/components/animated-beam
 */

import { motion, useReducedMotion } from "motion/react";
import { type RefObject, useEffect, useState } from "react";

type Box = { left: number; right: number; top: number; bottom: number };

function route(a: Box, b: Box, axis: "x" | "y" | undefined): string {
  const gapX = Math.max(b.left - a.right, a.left - b.right);
  const gapY = Math.max(b.top - a.bottom, a.top - b.bottom);
  if (axis ? axis === "y" : gapY > gapX) {
    const down = b.top >= a.bottom;
    const x1 = (a.left + a.right) / 2;
    const x2 = (b.left + b.right) / 2;
    const y1 = down ? a.bottom : a.top;
    const y2 = down ? b.top : b.bottom;
    const mid = (y1 + y2) / 2;
    return `M ${x1},${y1} C ${x1},${mid} ${x2},${mid} ${x2},${y2}`;
  }
  const right = b.left >= a.right;
  const x1 = right ? a.right : a.left;
  const x2 = right ? b.left : b.right;
  const y1 = (a.top + a.bottom) / 2;
  const y2 = (b.top + b.bottom) / 2;
  const mid = (x1 + x2) / 2;
  return `M ${x1},${y1} C ${mid},${y1} ${mid},${y2} ${x2},${y2}`;
}

export function AnimatedBeam({
  containerRef,
  fromRef,
  toRef,
  axis,
  idle = true,
  active = true,
  reverse = false,
}: {
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  axis?: "x" | "y";
  idle?: boolean;
  active?: boolean;
  reverse?: boolean;
}) {
  const reduced = useReducedMotion();
  const [path, setPath] = useState("");
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    const from = fromRef.current;
    const to = toRef.current;
    if (!container || !from || !to) return;
    const update = () => {
      const box = container.getBoundingClientRect();
      const scale = box.width / container.offsetWidth || 1;
      const local = (element: HTMLElement): Box => {
        const rect = element.getBoundingClientRect();
        return {
          left: (rect.left - box.left) / scale,
          right: (rect.right - box.left) / scale,
          top: (rect.top - box.top) / scale,
          bottom: (rect.bottom - box.top) / scale,
        };
      };
      setSize({ width: container.offsetWidth, height: container.offsetHeight });
      setPath(route(local(from), local(to), axis));
    };
    const observer = new ResizeObserver(update);
    for (const element of [container, from, to]) observer.observe(element);
    update();
    return () => observer.disconnect();
  }, [containerRef, fromRef, toRef, axis]);

  if (!active && !idle) return null;

  return (
    <svg
      aria-hidden
      fill="none"
      width={size.width}
      height={size.height}
      viewBox={`0 0 ${size.width} ${size.height}`}
      className="pointer-events-none absolute left-0 top-0"
    >
      <path d={path} stroke={active ? "#1743FF" : "#CECECE"} strokeOpacity={active ? 0.35 : 1} strokeWidth={1.25} strokeLinecap="round" />
      {active && !reduced && path ? (
        <motion.path
          key={`${path}-${reverse}`}
          d={path}
          pathLength={1}
          stroke="#1743FF"
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray="0.22 1"
          initial={{ strokeDashoffset: reverse ? -1 : 0.22 }}
          animate={{ strokeDashoffset: reverse ? 0.22 : -1 }}
          transition={{ duration: 1.6, ease: "linear", repeat: Infinity, repeatDelay: 0.25 }}
        />
      ) : null}
    </svg>
  );
}
