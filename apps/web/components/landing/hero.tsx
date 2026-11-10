import Link from "next/link";
import { CommitLink, LINK } from "../kit";
import { MarketBoard } from "./market-board";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <img
        src="/images/colosseum.webp"
        alt=""
        aria-hidden
        width={3456}
        height={2368}
        fetchPriority="high"
        className="absolute inset-x-0 top-0 -z-20 h-full w-full animate-unveil object-cover object-[50%_18%] [filter:brightness(112%)_contrast(92%)] [mask-image:linear-gradient(#000_70%,transparent)] motion-reduce:animate-none lg:object-top"
      />
      <div
        aria-hidden
        className="absolute left-1/2 top-6 -z-10 h-[620px] w-[min(900px,100%)] -translate-x-1/2 bg-white/85 blur-[44px] sm:h-[460px]"
      />
      <div className="flex flex-col items-center px-6 pb-20 pt-14 text-center sm:pt-20 lg:pb-28">
        <h1 className="text-balance font-serif text-[clamp(52px,7.6vw,112px)] leading-[0.95] tracking-[-0.015em] text-ink">
          Compute expires.
          <br />
          Markets don&apos;t.
        </h1>
        <p className="mt-6 max-w-[36ch] text-pretty text-[17px] leading-[26px] text-ink lg:text-[19px] lg:leading-[29px]">
          Sell the AI capacity you won&apos;t use. Agents buy it with USDC, inside a daily limit you set on NEAR.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
          <CommitLink href="/trade">Enter the market</CommitLink>
          <Link href="/agents" className={`${LINK} flex h-11 items-center text-[16px] text-ink`}>
            Connect an agent
          </Link>
        </div>
        <div className="mt-14 flex w-full justify-center lg:mt-20">
          <MarketBoard />
        </div>
      </div>
    </section>
  );
}
