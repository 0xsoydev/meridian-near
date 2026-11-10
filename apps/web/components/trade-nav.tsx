"use client";

import { ChevronDown, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useNear } from "../app/(site)/providers";
import { FOCUS, ICON, SECONDARY } from "./kit";
import { NAV_LINKS } from "./nav-links";

const MENU_ITEM = `flex h-11 w-full items-center px-4 text-left text-[15px] transition-colors duration-150 ease-brand hover:bg-hover ${FOCUS}`;

function close(target: EventTarget) {
  if (target instanceof Element) target.closest("details")?.removeAttribute("open");
}

export function TradeNav() {
  const { accountId, connect, disconnect } = useNear();
  const pathname = usePathname();

  useEffect(() => {
    const shut = (keep: Node | null) => {
      for (const node of document.querySelectorAll("header details[open]")) {
        if (!keep || !node.contains(keep)) node.removeAttribute("open");
      }
    };
    const onClick = (event: MouseEvent) => shut(event.target instanceof Node ? event.target : null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") shut(null);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="flex h-14 items-center gap-10 px-4 lg:px-6">
        <Link href="/" className={`flex shrink-0 items-center ${FOCUS}`}>
          <img src="/images/namelogo.svg" alt="Meridian" className="h-[22px] w-auto" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-8 text-[15px] text-ink lg:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`underline underline-offset-[6px] transition-[text-decoration-color] duration-200 ease-brand ${FOCUS} ${
                  active ? "decoration-accent" : "decoration-transparent hover:decoration-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {accountId ? (
            <details className="group relative">
              <summary className={`${SECONDARY} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                <span className="max-w-[132px] truncate lg:max-w-[180px]">{accountId}</span>
                <ChevronDown aria-hidden className="size-4 transition-transform duration-200 ease-brand group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 top-full z-50 mt-2 w-48 border border-line bg-white py-1">
                <Link href="/wallet" onClick={(event) => close(event.currentTarget)} className={MENU_ITEM}>
                  Wallet
                </Link>
                <button
                  type="button"
                  onClick={(event) => {
                    close(event.currentTarget);
                    void disconnect();
                  }}
                  className={MENU_ITEM}
                >
                  Disconnect
                </button>
              </div>
            </details>
          ) : (
            <button type="button" onClick={() => void connect()} className={SECONDARY}>
              Connect wallet
            </button>
          )}
          <details className="group relative lg:hidden">
            <summary aria-label="Menu" className={`${ICON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              <Menu aria-hidden className="size-4" />
            </summary>
            <nav aria-label="Main" className="absolute right-0 top-full z-50 mt-2 w-56 border border-line bg-white py-1">
              {NAV_LINKS.map((link) => {
                const active = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    onClick={(event) => close(event.currentTarget)}
                    className={`${MENU_ITEM} ${active ? "text-accent" : "text-ink"}`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
