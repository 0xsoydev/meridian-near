"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { FOCUS, ICON, Kbd } from "./kit";

type Shortcut = { keys: string; label: string; run: () => void };

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

export function Shortcuts({ items }: { items: ReadonlyArray<Shortcut> }) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const latest = useRef(items);

  useEffect(() => {
    latest.current = items;
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      if (event.key === "?") {
        event.preventDefault();
        dialog.current?.showModal();
        return;
      }
      const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
      const match = latest.current.find((item) => item.keys.split(" ").includes(key));
      if (!match) return;
      event.preventDefault();
      match.run();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        aria-label="Keyboard shortcuts"
        aria-keyshortcuts="?"
        onClick={() => dialog.current?.showModal()}
        className={`hidden h-8 w-8 items-center justify-center border border-line text-[13px] text-muted transition-colors duration-150 ease-brand hover:bg-hover hover:text-ink lg:inline-flex ${FOCUS}`}
      >
        ?
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="shortcuts-title"
        className="m-auto w-[min(92vw,360px)] border border-line bg-white p-0 text-ink backdrop:bg-ink/30"
        onClick={(event) => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <div className="flex h-12 items-center justify-between border-b border-line pl-4 pr-1">
          <h2 id="shortcuts-title" className="text-[14px]">
            Keyboard shortcuts
          </h2>
          <button type="button" aria-label="Close" onClick={() => dialog.current?.close()} className={`${ICON} border-transparent`}>
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <dl className="flex flex-col py-2">
          {[...items, { keys: "?", label: "Show this list", run: () => undefined }].map((item) => (
            <div key={item.keys} className="flex h-9 items-center justify-between gap-4 px-4 text-[13px]">
              <dt className="text-ink">{item.label}</dt>
              <dd className="flex gap-1">
                {item.keys.split(" ").map((key) => (
                  <Kbd key={key}>{key}</Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </dialog>
    </>
  );
}
