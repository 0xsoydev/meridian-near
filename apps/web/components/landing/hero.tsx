import Image from "next/image";
import Link from "next/link";
import colosseum from "../../public/images/colosseum.webp";
import { LINK } from "../kit";
import { LiveLine, TradeCta } from "./markets";
import { WRAP } from "./shared";

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className={`${WRAP} relative flex flex-col items-center pt-14 text-center sm:pt-20 lg:min-h-[calc(100svh-4rem)] lg:pt-[8vh]`}>
        <div aria-hidden className="absolute left-1/2 top-[2%] -z-10 hidden h-[62%] w-[min(860px,76%)] -translate-x-1/2 bg-white/85 blur-[40px] lg:block" />
        <h1 className="font-serif text-[clamp(52px,8vw,112px)] font-normal leading-[0.96] tracking-[-0.015em] text-ink motion-safe:animate-rise">
          Compute expires.
          <br />
          Markets don&apos;t.
        </h1>
        <p className="mt-7 max-w-[40ch] text-balance text-[17px] leading-[27px] text-ink motion-safe:animate-rise motion-safe:[animation-delay:120ms] lg:text-[19px] lg:leading-[30px]">
          Sellers list spare LLM API capacity. Agents buy it in USDC on NEAR, inside a daily limit their owner sets on chain.
        </p>
        <div className="mt-10 flex flex-col items-center gap-7 motion-safe:animate-rise motion-safe:[animation-delay:220ms] sm:flex-row sm:gap-10">
          <TradeCta />
          <Link href="/agents" className={`${LINK} text-[16px] text-ink`}>
            Connect an agent
          </Link>
        </div>
        <LiveLine className="mt-8 motion-safe:animate-rise motion-safe:[animation-delay:320ms]" />
      </div>
      <Image
        src={colosseum}
        alt=""
        aria-hidden
        sizes="(min-width: 1440px) 1440px, 100vw"
        loading="eager"
        fetchPriority="high"
        className="relative -z-20 mt-4 h-auto w-full motion-safe:animate-unveil lg:absolute lg:inset-0 lg:mt-0 lg:h-full lg:object-cover lg:object-top"
        style={{
          filter: "brightness(112%) contrast(92%)",
          maskImage: "linear-gradient(#000 calc(100% - 160px), transparent)",
        }}
      />
    </section>
  );
}
