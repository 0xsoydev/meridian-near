"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { FOCUS, ICON } from "../kit";
import { NAV_LINKS } from "../nav-links";
import { NavLinks } from "../site-nav";
import { useTradeHref } from "./markets";

const MENU_ITEM = `flex h-11 w-full items-center px-4 text-[15px] text-ink transition-colors duration-150 ease-brand hover:bg-hover ${FOCUS}`;

export function LandingHeader() {
  const menu = useRef<HTMLDetailsElement>(null);
  const tradeHref = useTradeHref();

  useEffect(() => {
    const shut = (event: MouseEvent | KeyboardEvent) => {
      const node = menu.current;
      if (!node?.open) return;
      const outside = event instanceof MouseEvent && !(event.target instanceof Node && node.contains(event.target));
      if (outside || (event instanceof KeyboardEvent && event.key === "Escape")) node.open = false;
    };
    document.addEventListener("click", shut);
    document.addEventListener("keydown", shut);
    return () => {
      document.removeEventListener("click", shut);
      document.removeEventListener("keydown", shut);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-white">
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-3 px-5 sm:px-8 lg:gap-8 lg:px-12">
        <Link href="/" className={`flex shrink-0 items-center ${FOCUS}`}>
          <img src="/images/namelogo.svg" alt="Meridian" width={106} height={24} className="h-6 w-auto" />
        </Link>
        <nav aria-label="Main" className="ml-auto hidden items-center gap-8 text-[15px] text-ink lg:flex">
          <NavLinks />
        </nav>
        <Link
          href={tradeHref}
          className={`inline-flex h-10 shrink-0 items-center bg-ink px-4 text-[14px] text-white transition-[background-color,scale] duration-200 ease-brand hover:bg-accent active:scale-[0.96] motion-reduce:transition-none ${FOCUS} max-lg:ml-auto`}
        >
          Enter the market
        </Link>
        <details ref={menu} className="relative lg:hidden">
          <summary aria-label="Menu" className={`${ICON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
            <Menu aria-hidden className="size-4" />
          </summary>
          <nav aria-label="Main" className="absolute right-0 top-full z-50 mt-2 w-56 border border-line bg-white py-1">
            {NAV_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className={MENU_ITEM}>
                {link.label}
              </Link>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
