"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { FOCUS, SECONDARY } from "./kit";

const DARK = `inline-flex h-8 shrink-0 items-center gap-1.5 border border-white/25 px-2.5 text-[12px] text-[#f5f5f5] transition-[background-color,scale] duration-150 ease-brand hover:bg-white/10 active:scale-[0.96] ${FOCUS}`;

export function CopyButton({ value, label = "Copy", dark = false }: { value: string; label?: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={dark ? DARK : SECONDARY}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check aria-hidden className="size-3.5" /> : <Copy aria-hidden className="size-3.5" />}
      <span aria-live="polite">{copied ? "Copied" : label}</span>
    </button>
  );
}
