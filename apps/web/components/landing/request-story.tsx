"use client";

import { motion } from "motion/react";
import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatedBeam } from "../ui/animated-beam";
import { PlayButton, Stage, Steps, useSequence } from "./blueprint";
import { H2, LEDE, WRAP } from "./shared";

const EASE = [0.22, 1, 0.36, 1] as const;
const CORNERS = [
  "-left-[6px] -top-[6px] border-l border-t",
  "-right-[6px] -top-[6px] border-r border-t",
  "-bottom-[6px] -left-[6px] border-b border-l",
  "-bottom-[6px] -right-[6px] border-b border-r",
];

const WIDE = "(min-width: 1280px)";

function useWide(): boolean {
  return useSyncExternalStore(
    (change) => {
      const query = window.matchMedia(WIDE);
      query.addEventListener("change", change);
      return () => query.removeEventListener("change", change);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

const AGENTS = [
  { name: "Claude Code", logo: "/images/rails/claudecode.svg" },
  { name: "OpenCode", logo: "/images/rails/opencode.svg" },
  { name: "Codex", logo: "/images/rails/codex.svg" },
];

const SELLERS = [
  { name: "NEAR AI", logo: "/images/rails/near.svg", price: "0.1800" },
  { name: "OpenRouter", logo: "/images/rails/openrouter.svg", price: "0.1840" },
  { name: "Command Code", logo: "/images/rails/commandcode.svg", price: "0.1990" },
  { name: "OpenCode Zen", logo: "/images/rails/opencode.svg", price: "0.2150" },
];

const STEPS = [
  {
    title: "Fund once, set a limit",
    body: "Deposit USDC into your Meridian wallet and give each agent a daily limit. The limit is stored in the NEAR contract, so only you can raise it.",
    log: "set_cap  claude-code  $5.00 a day",
  },
  {
    title: "Your agent sends a normal request",
    body: "Point the agent at Meridian with its router key. It asks for a model the way it always does, and never sees your wallet.",
    log: "POST /api/v1/chat/completions  glm-5.3  48,000 tokens",
  },
  {
    title: "The cheapest seller serves it",
    body: "Meridian routes to the lowest live ask for that model and pulls USDC from your wallet, never past today's limit.",
    log: "NEAR AI at $0.1800  pulled $0.0086 from your wallet",
  },
  {
    title: "The answer streams back, the seller is paid",
    body: "Tokens stream to your agent as usual. The seller keeps 90% and is paid in USDC on NEAR in the daily payout.",
    log: "200 streamed  NEAR AI earns $0.0078 after the 10% fee",
  },
];
const HOLDS = [3000, 3000, 3200, 0] as const;

function Node({
  nodeRef,
  logo,
  name,
  on,
  detail,
  tone = "text-muted",
}: {
  nodeRef: RefObject<HTMLDivElement | null>;
  logo: string;
  name: string;
  on: boolean;
  detail?: string;
  tone?: string;
}) {
  return (
    <div
      ref={nodeRef}
      className={`relative z-10 flex min-h-11 items-center gap-2 border bg-white px-2.5 py-1.5 transition-[border-color,color] duration-300 ease-brand sm:gap-2.5 sm:px-3 ${
        on ? "border-ink text-ink" : "border-line text-muted"
      }`}
    >
      <img
        src={logo}
        alt=""
        width={20}
        height={20}
        className={`size-4 shrink-0 object-contain transition-opacity duration-300 ease-brand sm:size-5 ${on ? "" : "opacity-45"}`}
      />
      <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-3">
        <span className="truncate text-[13px] sm:text-[14px]">{name}</span>
        {detail ? <span className={`shrink-0 text-[12px] tabular-nums sm:text-[13px] ${tone}`}>{detail}</span> : null}
      </span>
    </div>
  );
}

function Diagram({ step }: { step: number }) {
  const container = useRef<HTMLDivElement>(null);
  const hub = useRef<HTMLDivElement>(null);
  const wallet = useRef<HTMLDivElement>(null);
  const agents = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const sellers = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const spent = step >= 2;
  const wide = useWide();
  const across = wide ? "x" : "y";

  return (
    <div
      ref={container}
      aria-hidden
      className="relative flex flex-col items-center gap-12 xl:grid xl:grid-cols-[minmax(152px,1fr)_auto_minmax(0,1.6fr)] xl:items-center xl:gap-x-6"
    >
      <div className="flex flex-wrap justify-center gap-2 xl:flex-col xl:gap-3">
        {AGENTS.map((agent, index) => (
          <Node key={agent.name} nodeRef={agents[index]!} logo={agent.logo} name={agent.name} on={index === 0 && (step === 1 || step === 3)} />
        ))}
      </div>

      <div className="flex items-center gap-4 sm:gap-10 xl:flex-col xl:gap-16">
        <div
          ref={hub}
          className={`relative z-10 flex h-[72px] w-[124px] items-center justify-center border bg-white transition-colors duration-300 ease-brand sm:w-[160px] xl:h-[80px] ${
            step >= 1 ? "border-ink" : "border-line"
          }`}
        >
          {CORNERS.map((corner) => (
            <span key={corner} className={`absolute size-[10px] border-accent ${corner}`} />
          ))}
          <img src="/images/namelogo.svg" alt="" width={120} height={27} className="h-auto w-[92px] sm:w-[116px]" />
        </div>

        <div
          ref={wallet}
          className={`relative z-10 flex w-[200px] items-center gap-3 border bg-white p-3 transition-colors duration-300 ease-brand sm:w-[228px] sm:p-4 ${
            step === 0 || step === 2 ? "border-ink" : "border-line"
          }`}
        >
          <svg viewBox="0 0 40 40" className="size-10 shrink-0 -rotate-90 sm:size-12">
            <circle cx="20" cy="20" r="16" fill="none" stroke="var(--color-accent)" strokeWidth="3" />
            <motion.circle
              cx="20"
              cy="20"
              r="16"
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth="3"
              initial={false}
              animate={{ pathLength: spent ? 0.06 : 0 }}
              transition={{ duration: 0.6, ease: EASE }}
            />
          </svg>
          <div className="flex min-w-0 flex-col gap-0.5 text-left">
            <span className="text-[11px] text-muted sm:text-[12px]">Your wallet on NEAR</span>
            <span className="text-[16px] tabular-nums text-ink sm:text-[20px]">{spent ? "$24.99" : "$25.00"}</span>
            <span className="text-[11px] tabular-nums text-muted sm:text-[12px]">{spent ? "$0.0086" : "$0.00"} of $5.00 today</span>
          </div>
        </div>
      </div>

      <div className="grid w-full grid-cols-2 gap-2 xl:flex xl:flex-col xl:gap-3">
        {SELLERS.map((seller, index) => {
          const chosen = index === 0 && step >= 2;
          return (
            <Node
              key={seller.name}
              nodeRef={sellers[index]!}
              logo={seller.logo}
              name={seller.name}
              on={chosen || step === 2}
              detail={index === 0 && step === 3 ? "+$0.0078" : seller.price}
              tone={chosen ? "text-accent" : "text-muted"}
            />
          );
        })}
      </div>

      {agents.map((ref, index) => (
        <AnimatedBeam
          key={AGENTS[index]?.name}
          containerRef={container}
          fromRef={ref}
          toRef={hub}
          axis={across}
          idle={wide}
          active={index === 0 && (step === 1 || step === 3)}
          reverse={step === 3}
        />
      ))}
      {sellers.map((ref, index) => (
        <AnimatedBeam key={SELLERS[index]?.name} containerRef={container} fromRef={hub} toRef={ref} axis={across} idle={wide} active={index === 0 && step >= 2} reverse={step === 3} />
      ))}
      <AnimatedBeam containerRef={container} fromRef={wallet} toRef={hub} axis={wide ? "y" : "x"} idle={wide} active={step === 2} />
    </div>
  );
}

export function RequestStory() {
  const ref = useRef<HTMLDivElement>(null);
  const seq = useSequence(ref, HOLDS);
  const wide = useWide();
  const [scrolled, setScrolled] = useState(0);
  const step = wide ? scrolled : seq.step;
  const items = useRef<Array<HTMLLIElement | null>>([]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setScrolled(Number((entry.target as HTMLElement).dataset.step));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );
    for (const item of items.current) if (item) observer.observe(item);
    return () => observer.disconnect();
  }, []);

  const current = STEPS[step] ?? STEPS[0]!;

  return (
    <section aria-labelledby="request-title" className="border-t border-line py-16 sm:py-24 lg:py-32 xl:pb-16">
      <div className={`${WRAP} grid gap-12 xl:grid-cols-[minmax(0,7fr)_minmax(0,16fr)] xl:gap-16`}>
        <div className="flex flex-col gap-5">
          <h2 id="request-title" className={H2}>
            One request, start to finish
          </h2>
          <p className={LEDE}>What happens when your agent asks a model for an answer, where the money moves, and who gets paid.</p>
          <ol className="mt-2 hidden xl:block">
            {STEPS.map((item, index) => (
              <li
                key={item.title}
                ref={(element) => {
                  items.current[index] = element;
                }}
                data-step={index}
                aria-current={step === index ? "step" : undefined}
                className={`flex min-h-[26vh] flex-col justify-center gap-2 border-l-2 pl-6 transition-[border-color] duration-300 ease-brand ${
                  step === index ? "border-accent" : "border-line"
                }`}
              >
                <h3 className="flex items-baseline gap-2.5 text-[20px] leading-[28px] text-ink">
                  <span className={`tabular-nums transition-colors duration-300 ${step === index ? "text-accent" : "text-muted"}`}>{index + 1}</span>
                  {item.title}
                </h3>
                <p className="max-w-[40ch] text-pretty text-[15px] leading-[23px] text-muted">{item.body}</p>
              </li>
            ))}
          </ol>
        </div>

        <div ref={ref} className="flex min-w-0 flex-col xl:sticky xl:top-[calc(50vh-200px)] xl:self-start">
          <Stage className="flex flex-col gap-6 px-4 pb-6 pt-12 sm:px-6 lg:px-8 lg:pb-8 xl:px-6">
            <Diagram step={step} />
            <p
              aria-hidden
              className="flex min-h-[60px] items-center border border-line bg-wash px-3 py-2.5 font-mono text-[12px] leading-[18px] text-ink sm:min-h-12 sm:overflow-x-auto sm:whitespace-nowrap sm:px-4 sm:py-0 sm:text-[13px]"
            >
              <span className="flex gap-3">
                <span className="text-accent">{step + 1}/4</span>
                <span>{current.log}</span>
              </span>
            </p>
          </Stage>
          <div className="mt-2 flex flex-col gap-4 lg:flex-row lg:items-start xl:hidden">
            <Steps items={STEPS.map((item, frame) => ({ ...item, frame }))} active={step} seq={seq} progress grid="grid-cols-2 lg:grid-cols-4" className="flex-1" />
            <PlayButton seq={seq} className="mt-4 self-start lg:mt-5" />
          </div>
        </div>
      </div>
    </section>
  );
}
