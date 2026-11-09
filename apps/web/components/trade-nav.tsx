"use client";

import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useNear } from "../app/(site)/providers";
import { FOCUS, SECONDARY } from "./kit";

const LINKS = [
  { label: "Trade", href: "/trade" },
  { label: "Perps", href: "/perps" },
  { label: "Sell", href: "/sell" },
  { label: "Wallet", href: "/keys" },
  { label: "Agents", href: "/agents" },
  { label: "Receipts", href: "/receipts" },
];

function Links() {
  const pathname = usePathname();
  return LINKS.map((link) => {
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
  });
}

export function TradeNav() {
  const { accountId, connect, disconnect } = useNear();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="flex h-14 items-center gap-10 px-4 lg:px-6">
        <Link href="/" className={`flex shrink-0 items-center ${FOCUS}`}>
          <img src="/images/namelogo.svg" alt="Meridian" className="h-[22px] w-auto" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-8 text-[15px] text-ink lg:flex">
          <Links />
        </nav>
        <div className="ml-auto">
          {accountId ? (
            <details className="group relative">
              <summary className={`${SECONDARY} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
                <span className="max-w-[180px] truncate">{accountId}</span>
                <ChevronDown aria-hidden className="size-4 transition-transform duration-200 ease-brand group-open:rotate-180" />
              </summary>
              <div className="absolute right-0 top-full z-50 mt-2 w-48 border border-line bg-white py-1 text-[14px]">
                <Link
                  href="/keys"
                  onClick={(event) => event.currentTarget.closest("details")?.removeAttribute("open")}
                  className={`block px-4 py-2 transition-colors duration-150 ease-brand hover:bg-hover ${FOCUS}`}
                >
                  Wallet
                </Link>
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest("details")?.removeAttribute("open");
                    void disconnect();
                  }}
                  className={`block w-full px-4 py-2 text-left transition-colors duration-150 ease-brand hover:bg-hover ${FOCUS}`}
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
        </div>
      </div>
      <nav
        aria-label="Main"
        className="flex items-center gap-x-4 overflow-x-auto whitespace-nowrap border-t border-line px-4 py-1 text-[15px] text-ink *:py-2.5 lg:hidden"
      >
        <Links />
      </nav>
    </header>
  );
}
