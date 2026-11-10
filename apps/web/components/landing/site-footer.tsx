import { ChevronRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { explorer } from "../../lib/client";
import goddess from "../../public/images/goddess.webp";
import { FOCUS } from "../kit";
import { H2, WRAP } from "./shared";

const PATHS = [
  { title: "Sell spare capacity", body: "List a key you already pay for, at or under list price. Paid out daily.", href: "/sell" },
  { title: "Give an agent a budget", body: "Fund your Meridian wallet and set a daily limit for each agent key.", href: "/wallet" },
  { title: "Trade and hedge", body: "Buy MTokens ahead, sell back what you won't use, or lock a price with perps.", href: "/trade" },
];

const CORE = process.env.NEXT_PUBLIC_NEAR_CORE_ID ?? "";

const LINKS = [
  { label: "Plan", href: "https://github.com/0xsoydev/meridian-near/blob/develop/docs/plan.md" },
  { label: "README", href: "https://github.com/0xsoydev/meridian-near" },
  { label: "skill.md", href: "/skill.md" },
  { label: "Receipts", href: "/receipts" },
  ...(CORE ? [{ label: "Contract on NearBlocks", href: explorer("address", CORE) }] : []),
];

const LINK = `w-fit underline decoration-transparent underline-offset-[6px] transition-[text-decoration-color] duration-200 ease-brand hover:decoration-accent ${FOCUS}`;

export function SiteFooter() {
  return (
    <footer className="overflow-hidden border-t border-line">
      <div className={`${WRAP} pt-16 sm:pt-24 lg:pb-32 lg:pt-32`}>
        <h2 className={H2}>Pick your side of the market</h2>
        <ul className="mt-10 max-w-[760px] border-t border-line lg:mt-14">
          {PATHS.map((path) => (
            <li key={path.href} className="border-b border-line">
              <Link
                href={path.href}
                className={`group -mx-3 flex items-center gap-6 px-3 py-6 transition-[background-color] duration-200 ease-brand hover:bg-hover ${FOCUS}`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="font-serif text-[26px] leading-[32px] text-ink lg:text-[30px] lg:leading-[36px]">{path.title}</span>
                  <span className="text-pretty text-[15px] leading-[23px] text-muted">{path.body}</span>
                </span>
                <ChevronRight
                  aria-hidden
                  className="size-5 shrink-0 text-ink transition-transform duration-200 ease-brand group-hover:translate-x-1 motion-reduce:transition-none"
                />
              </Link>
            </li>
          ))}
        </ul>
        <Image
          src={goddess}
          alt=""
          sizes="(min-width: 640px) 640px, 100vw"
          className="pointer-events-none -mx-5 mt-12 w-[calc(100%+2.5rem)] max-w-none sm:mx-auto sm:w-full sm:max-w-[640px] lg:hidden"
        />
      </div>

      <div className="border-t border-line bg-panel">
        <div className={`${WRAP} flex flex-col gap-8 py-12 sm:flex-row sm:items-start sm:justify-between`}>
          <div className="flex flex-col gap-3">
            <img src="/images/namelogo.svg" alt="Meridian" width={106} height={24} className="h-6 w-fit" />
            <p className="max-w-[34ch] text-[14px] leading-[22px] text-muted">A market for spare LLM capacity, settled in USDC on NEAR.</p>
          </div>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-[15px] text-ink">
            {LINKS.map((link) => (
              <Link key={link.label} href={link.href} className={LINK}>
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <div aria-hidden className="relative mx-auto w-full max-w-[1440px] lg:h-[min(38vw,460px)]">
          <p className="-mb-[0.18em] select-none whitespace-nowrap text-center font-sans text-[17.5vw] font-bold leading-none tracking-[-0.045em] text-muted/20 lg:absolute lg:bottom-[-0.12em] lg:left-1/2 lg:mb-0 lg:-translate-x-1/2 min-[1440px]:text-[252px]">
            MERIDIAN
          </p>
          <Image
            src={goddess}
            alt=""
            sizes="920px"
            className="absolute bottom-0 right-0 hidden h-full w-auto max-w-none lg:block"
          />
        </div>
      </div>
    </footer>
  );
}
