import Link from "next/link";
import type { ReactNode } from "react";

const CORNER = "absolute size-[10px] border-accent transition-transform duration-200 ease-brand motion-reduce:transition-none";
const CORNERS = [
  `${CORNER} -left-[6px] -top-[6px] border-l border-t group-hover:-translate-x-[3px] group-hover:-translate-y-[3px]`,
  `${CORNER} -right-[6px] -top-[6px] border-r border-t group-hover:translate-x-[3px] group-hover:-translate-y-[3px]`,
  `${CORNER} -bottom-[6px] -left-[6px] border-b border-l group-hover:-translate-x-[3px] group-hover:translate-y-[3px]`,
  `${CORNER} -bottom-[6px] -right-[6px] border-b border-r group-hover:translate-x-[3px] group-hover:translate-y-[3px]`,
];

export function CtaLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link
      href={href}
      className={`group relative inline-flex h-[52px] items-center justify-center bg-ink px-9 text-[16px] text-white transition-[background-color,scale] duration-200 ease-brand hover:bg-accent active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-[10px] focus-visible:outline-accent motion-reduce:transition-none ${className}`}
    >
      {CORNERS.map((corner) => (
        <span key={corner} aria-hidden className={corner} />
      ))}
      {children}
    </Link>
  );
}
