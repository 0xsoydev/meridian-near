"use client";

import { Pause, Play } from "lucide-react";
import { useReducedMotion } from "motion/react";
import { useState } from "react";
import { CopyButton } from "../copy-button";
import {
  type TabContent,
  TerminalAnimationCommandBar,
  TerminalAnimationOutput,
  TerminalAnimationRoot,
  TerminalAnimationTabList,
  TerminalAnimationTabTrigger,
  TerminalAnimationTrailingPrompt,
} from "../ui/terminal-animation";
import { H2, LEDE, WRAP } from "./shared";

const OK = "text-[#2EBD85]";
const ROUTE = "text-[#8FA2FF]";
const MUTED = "text-[#9A9A9A]";

const STEPS: TabContent[] = [
  {
    label: "approve",
    command: `curl -X POST $MERIDIAN/api/v1/device -d '{"name":"claude-code","cap_usd_micro":"5000000"}'`,
    lines: [
      { text: "← 201 Created, device code and a QR", color: ROUTE, delay: 450 },
      { text: "  open $MERIDIAN/a/7KQ2XM with a NEAR wallet", color: MUTED, delay: 300 },
      { text: "  set_cap(key, $5/day) on core.<team>.near", color: MUTED, delay: 900 },
      { text: "✓ key minted, the agent never sees the wallet", color: OK, delay: 900 },
    ],
  },
  {
    label: "buy",
    command: `curl -X POST $MERIDIAN/api/v1/trades -d '{"model":"glm-5.3-flash","tokens":"100000"}'`,
    lines: [
      { text: "  best ask 0.175 USD/MTok on the NEAR AI rail", color: MUTED, delay: 450 },
      { text: "  quote 0.1 MTok for $0.0175", color: ROUTE, delay: 500 },
      { text: "✓ filled 0.1 MTok for $0.0175 in 1 fill", color: OK, delay: 800 },
    ],
  },
  {
    label: "inference",
    command: 'curl $MERIDIAN/api/v1/chat/completions -H "Authorization: Bearer $KEY" -d @prompt.json',
    lines: [
      { text: "  routed to the NEAR AI rail at the cheapest live ask", color: ROUTE, delay: 500 },
      { text: "  paid from the MTokens just bought", color: MUTED, delay: 400 },
      { text: "✓ 200 answer streamed, 1,400 tokens used", color: OK, delay: 1000 },
    ],
  },
  {
    label: "sell",
    command: `curl -X POST $MERIDIAN/api/v1/sells -d '{"model":"glm-5.3-flash","tokens":"98600"}'`,
    lines: [
      { text: "  holding 0.0986 MTok after the answer", color: MUTED, delay: 450 },
      { text: "  best bid 0.15 USD/MTok", color: MUTED, delay: 400 },
      { text: "✓ sold 0.0986 MTok at market for $0.0148", color: OK, delay: 800 },
      { text: "  received $0.0133 after the 10% venue fee", color: ROUTE, delay: 400 },
    ],
  },
];

const AGENTS = [
  { name: "Claude Code", logo: "/images/rails/claudecode.svg" },
  { name: "Codex", logo: "/images/rails/codex.svg" },
  { name: "OpenCode", logo: "/images/rails/opencode.svg" },
];

export function AgentsTerminal({ variant, host = "" }: { variant: "section" | "bare"; host?: string }) {
  const section = variant === "section";
  const [step, setStep] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotion();

  const terminal = (
    <div className={`relative overflow-hidden bg-[#56595D] ${section ? "h-[400px] lg:h-[420px]" : "h-[440px]"}`}>
      <img
        src="/images/terminal-rays.webp"
        alt=""
        aria-hidden
        loading="lazy"
        width={1217}
        height={768}
        className="absolute inset-0 size-full object-cover object-bottom"
      />
      <TerminalAnimationRoot
        tabs={STEPS}
        activeTab={step}
        onActiveTabChange={setStep}
        onComplete={() => setStep((current) => (current + 1) % STEPS.length)}
        primed
        paused={paused}
        className={`absolute bottom-0 flex flex-col rounded-t-[6px] border border-b-0 border-white/10 bg-[#1A1A1A] ${
          section ? "inset-x-4 top-10 sm:inset-x-8 lg:left-1/2 lg:right-auto lg:top-[56px] lg:w-[min(1000px,86%)] lg:-translate-x-1/2" : "inset-x-4 top-12"
        }`}
      >
        <div
          tabIndex={0}
          role="region"
          aria-label="Terminal output"
          className={`min-h-0 flex-1 overflow-x-auto whitespace-pre font-mono focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[#8FA2FF] text-[#F5F5F5] [scrollbar-color:rgba(255,255,255,0.2)_transparent] ${
            section ? "px-4 pb-4 pt-5 text-[12px] leading-[22px] lg:px-10 lg:pb-6 lg:pt-9 lg:text-[15px] lg:leading-[28px]" : "px-4 pb-4 pt-5 text-[12px] leading-[22px]"
          }`}
        >
          <div className="flex">
            <span className={MUTED}>$ </span>
            <TerminalAnimationCommandBar />
          </div>
          <TerminalAnimationOutput />
          <TerminalAnimationTrailingPrompt>
            <span className={MUTED}>$ </span>
            <span aria-hidden className={MUTED}>
              ▌
            </span>
          </TerminalAnimationTrailingPrompt>
        </div>
        <div className={`mb-4 flex items-stretch justify-center gap-2 ${section ? "lg:mb-7" : ""}`}>
          <TerminalAnimationTabList
            className={`flex rounded-[8px] border border-white/10 bg-white/5 p-1 font-mono text-[12px] ${section ? "lg:text-[15px]" : ""}`}
          >
            {STEPS.map((item, index) => (
              <TerminalAnimationTabTrigger
                key={item.label}
                index={index}
                className={`rounded-[6px] px-2.5 py-1 text-[#9A9A9A] transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8FA2FF] data-[state=active]:bg-[#EDEDED] data-[state=active]:text-[#1E1E1E] ${
                  section ? "lg:px-4 lg:py-1.5" : ""
                }`}
              >
                {item.label}
              </TerminalAnimationTabTrigger>
            ))}
          </TerminalAnimationTabList>
          {reduced ? null : (
            <button
              type="button"
              aria-label={paused ? "Play the demo" : "Pause the demo"}
              onClick={() => setPaused((value) => !value)}
              className="flex aspect-square items-center justify-center rounded-[8px] border border-white/10 bg-white/5 text-[#9A9A9A] transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8FA2FF]"
            >
              {paused ? <Play aria-hidden className="size-3.5" /> : <Pause aria-hidden className="size-3.5" />}
            </button>
          )}
        </div>
      </TerminalAnimationRoot>
    </div>
  );

  if (!section) return terminal;

  const prompt = `Read ${host}/skill.md and get a Meridian router key.`;

  return (
    <section aria-labelledby="agents-title" className="border-t border-line py-16 sm:py-24 lg:py-32">
      <div className={WRAP}>
        <div className="flex flex-col gap-5">
          <h2 id="agents-title" className={H2}>
            Point your agent at Meridian
          </h2>
          <p className={LEDE}>
            Paste this into your coding agent. It reads the manual, asks you for one approval, then buys inference on its own.
          </p>
        </div>
        <div className="mt-10 flex max-w-[760px] flex-col items-start gap-3 border border-line bg-white p-4 sm:flex-row sm:items-center sm:py-2 sm:pr-2">
          <code className="min-w-0 flex-1 break-words font-mono text-[13px] leading-[20px] text-ink sm:truncate">{prompt}</code>
          <CopyButton value={prompt} label="Copy prompt" />
        </div>
        <ul className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 text-[14px] text-muted">
          <li>Works with</li>
          {AGENTS.map((agent) => (
            <li key={agent.name} className="flex items-center gap-2 text-ink">
              <img src={agent.logo} alt="" width={20} height={20} className="size-5 object-contain" />
              {agent.name}
            </li>
          ))}
        </ul>
        <div className="mt-12 lg:mt-16">{terminal}</div>
      </div>
    </section>
  );
}
