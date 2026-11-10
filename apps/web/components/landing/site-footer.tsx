import Link from "next/link";
import { explorer } from "../../lib/client";
import { FOCUS } from "../kit";
import { NAV_LINKS } from "../nav-links";

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";
const LINK = `w-fit text-[15px] leading-[24px] text-ink underline decoration-transparent underline-offset-[6px] transition-[text-decoration-color] duration-200 ease-brand hover:decoration-accent ${FOCUS}`;

const GROUPS = [
  { title: "Product", links: NAV_LINKS },
  {
    title: "Docs",
    links: [
      { label: "Agent manual", href: "/skill.md" },
      { label: "Plan", href: "https://github.com/0xsoydev/meridian-near/blob/develop/docs/plan.md" },
      { label: "README", href: "https://github.com/0xsoydev/meridian-near" },
    ],
  },
  {
    title: "On chain",
    links: [
      ...(CORE ? [{ label: "Core contract", href: explorer("address", CORE) }] : []),
      { label: "Index receipts", href: "/receipts" },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="relative isolate overflow-hidden border-t border-line bg-panel">
      <div className="mx-auto grid max-w-[1520px] gap-12 px-6 pb-[260px] pt-16 sm:pb-[340px] lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:px-12 lg:pb-[420px]">
        <div className="flex flex-col gap-4">
          <img src="/images/namelogo.svg" alt="Meridian" width={120} height={27} className="h-6 w-auto self-start" />
          <p className="max-w-[34ch] text-pretty text-[15px] leading-[24px] text-ink">
            A market for spare LLM capacity, settled in USDC on NEAR. Running on testnet for the NEAR hackathon.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-3">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <p className="text-[13px] text-ink/70">{group.title}</p>
              {group.links.map((link) =>
                link.href.startsWith("http") ? (
                  <a key={link.label} href={link.href} target="_blank" rel="noreferrer" className={LINK}>
                    {link.label}
                  </a>
                ) : (
                  <Link key={link.label} href={link.href} className={LINK}>
                    {link.label}
                  </Link>
                ),
              )}
            </div>
          ))}
        </nav>
      </div>
      <p
        aria-hidden
        className="pointer-events-none absolute -bottom-[0.18em] left-1/2 -z-10 -translate-x-1/2 select-none whitespace-nowrap font-sans text-[26vw] font-black leading-none text-ink/[0.07] lg:text-[21vw]"
      >
        MERIDIAN
      </p>
      <img
        src="/images/goddess.webp"
        alt=""
        aria-hidden
        loading="lazy"
        width={1774}
        height={887}
        className="pointer-events-none absolute -bottom-2 right-0 -z-10 w-[min(100%,560px)] sm:w-[640px] lg:w-[860px]"
      />
    </footer>
  );
}
