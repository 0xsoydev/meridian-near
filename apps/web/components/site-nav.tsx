"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_LINKS = [
  { label: "Trade", href: "/trade" },
  { label: "Perps", href: "/perps" },
  { label: "Sell", href: "/sell" },
  { label: "Wallet", href: "/wallet" },
  { label: "Agents", href: "/agents" },
  { label: "Receipts", href: "/receipts" },
];

export function NavLinks() {
  const pathname = usePathname();
  return (
    <>
      {NAV_LINKS.map((link) => {
        const active = pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`underline underline-offset-[6px] transition-[text-decoration-color] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1743FF] ${
              active ? "decoration-[#1743FF]" : "decoration-transparent hover:decoration-[#1E1E1E]"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </>
  );
}
