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
      <div className="mx-auto grid max-w-[1520px] gap-12 px-6 pb-[36vw] pt-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,6fr)] lg:px-12 lg:pb-[min(25vw,440px)]">
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
      <svg
        aria-hidden
        viewBox="0 0 1000 150"
        className="pointer-events-none absolute -bottom-[1.6vw] left-10 -z-10 hidden w-[min(64vw,1280px)] select-none fill-ink/[0.08] lg:block"
      >
        <text x="0" y="140" textLength="1000" lengthAdjust="spacingAndGlyphs" className="font-sans text-[180px] font-bold">
          MERIDIAN
        </text>
      </svg>
      <img
        src="/images/goddess-1400.webp"
        alt=""
        aria-hidden
        loading="lazy"
        width={1400}
        height={700}
        className="pointer-events-none absolute -bottom-2 right-0 -z-10 w-[66vw] lg:w-[min(40vw,800px)]"
      />
    </footer>
  );
}
