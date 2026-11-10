"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { FOCUS, ICON, SECONDARY } from "./kit";
import { NAV_LINKS } from "./nav-links";

export function LandingNav() {
  const menu = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const shut = (event: Event) => {
      const details = menu.current;
      if (!details?.open) return;
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !(event.target instanceof Node && details.contains(event.target))) {
        details.open = false;
      }
    };
    document.addEventListener("click", shut);
    document.addEventListener("keydown", shut);
    return () => {
      document.removeEventListener("click", shut);
      document.removeEventListener("keydown", shut);
    };
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white">
      <div className="mx-auto flex h-16 max-w-[1520px] items-center gap-12 px-6 lg:px-12">
        <Link href="/" className={`flex shrink-0 items-center ${FOCUS}`}>
          <img src="/images/namelogo.svg" alt="Meridian" width={110} height={25} className="h-[22px] w-auto" />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-8 text-[15px] text-ink lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`underline decoration-transparent underline-offset-[6px] transition-[text-decoration-color] duration-200 ease-brand hover:decoration-ink ${FOCUS}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:block">
            <Link href="/trade" className={SECONDARY}>
              Enter the market
            </Link>
          </span>
          <details ref={menu} className="group relative lg:hidden">
            <summary aria-label="Menu" className={`${ICON} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>
              <Menu aria-hidden className="size-4" />
            </summary>
            <nav aria-label="Main" className="absolute right-0 top-full z-50 mt-2 w-60 border border-line bg-white py-1">
              {[...NAV_LINKS, { label: "Enter the market", href: "/trade" }].map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => {
                    if (menu.current) menu.current.open = false;
                  }}
                  className={`flex h-11 items-center px-4 text-[15px] text-ink transition-colors duration-150 ease-brand hover:bg-hover ${FOCUS}`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
