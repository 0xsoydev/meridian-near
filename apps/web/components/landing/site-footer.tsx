import Link from "next/link";
import { explorer } from "../../lib/client";
import { FOCUS } from "../kit";
import { NAV_LINKS } from "../nav-links";
import { WRAP } from "./shared";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";

const GROUPS = [
  { title: "Product", links: NAV_LINKS },
  {
    title: "Docs",
    links: [
      { label: "Agent manual", href: "/skill.md" },
      { label: "Source code", href: "https://github.com/0xsoydev/meridian-near" },
    ],
  },
  {
    title: "On chain",
    links: [...(CORE ? [{ label: "Core contract", href: explorer("address", CORE) }] : []), { label: "Index receipts", href: "/receipts" }],
  },
];

const LINK = `w-fit text-[15px] leading-[24px] text-ink underline decoration-transparent underline-offset-[6px] transition-[text-decoration-color] duration-200 ease-brand hover:decoration-accent ${FOCUS}`;

export function SiteFooter() {
  return (
    <footer className="overflow-hidden border-t border-line bg-panel">
      <div className={`${WRAP} grid gap-12 py-12 sm:py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)]`}>
        <div className="flex flex-col gap-3">
          <img src="/images/namelogo.svg" alt="Meridian" width={106} height={24} className="h-6 w-fit" />
          <p className="max-w-[34ch] text-[14px] leading-[22px] text-ink/70">A market for spare LLM capacity, settled in USDC on NEAR.</p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <p className="text-[13px] leading-[20px] text-ink/70">{group.title}</p>
              {group.links.map((link) => (
                <Link key={link.label} href={link.href} className={LINK}>
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
      </div>
      <div
        aria-hidden
        className="mx-auto mb-[-2%] aspect-[57/13] w-[calc(100%-40px)] max-w-[1200px] bg-line [mask:url(/images/namelogo.svg)_center/contain_no-repeat] sm:w-[calc(100%-64px)] lg:w-[calc(100%-96px)]"
      />
    </footer>
  );
}
