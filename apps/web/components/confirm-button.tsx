"use client";

import { useEffect, useRef, useState } from "react";
import { DANGER, SECONDARY } from "./kit";

export function ConfirmButton({
  label,
  confirmLabel,
  question,
  busy,
  disabled = false,
  onConfirm,
}: {
  label: string;
  confirmLabel: string;
  question: string;
  busy: string | null;
  disabled?: boolean;
  onConfirm: () => void;
}) {
  const [armed, setArmed] = useState(false);
  const keep = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (armed) keep.current?.focus();
  }, [armed]);

  if (busy) {
    return (
      <button type="button" disabled className={DANGER}>
        {busy}
      </button>
    );
  }
  if (!armed) {
    return (
      <button type="button" disabled={disabled} onClick={() => setArmed(true)} className={DANGER}>
        {label}
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label={question}
      onKeyDown={(event) => {
        if (event.key === "Escape") setArmed(false);
      }}
      className="flex items-center justify-end gap-2"
    >
      <span className="whitespace-normal text-right text-[12px] leading-[16px] text-ink">{question}</span>
      <button
        type="button"
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        className={DANGER}
      >
        {confirmLabel}
      </button>
      <button ref={keep} type="button" onClick={() => setArmed(false)} className={SECONDARY}>
        Keep
      </button>
    </div>
  );
}
