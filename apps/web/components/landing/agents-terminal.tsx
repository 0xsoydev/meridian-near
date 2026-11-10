"use client";

import { useEffect, useState } from "react";
import {
  type TabContent,
  TerminalAnimationCommandBar,
  TerminalAnimationOutput,
  TerminalAnimationRoot,
  TerminalAnimationTabList,
  TerminalAnimationTabTrigger,
  TerminalAnimationTrailingPrompt,
} from "../ui/terminal-animation";

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

export function AgentsTerminal({ onStep, plain = false }: { onStep?: (step: number) => void; plain?: boolean }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    onStep?.(step);
  }, [step, onStep]);

  const terminal = (
    <TerminalAnimationRoot
      tabs={STEPS}
      activeTab={step}
      onActiveTabChange={setStep}
      onComplete={() => setStep((current) => (current + 1) % STEPS.length)}
      className={`flex flex-col border border-white/10 bg-[#1A1A1A] ${plain ? "h-full" : "absolute inset-x-4 bottom-0 top-12 rounded-t-[6px] border-b-0"}`}
    >
      <div className="min-h-0 flex-1 overflow-x-auto whitespace-pre px-4 pb-4 pt-5 font-mono text-[12px] leading-[22px] text-[#F5F5F5] [scrollbar-color:rgba(255,255,255,0.2)_transparent] lg:px-6 lg:text-[13px] lg:leading-[24px]">
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
      <TerminalAnimationTabList className="mx-auto mb-4 flex rounded-[8px] border border-white/10 bg-white/5 p-1 font-mono text-[12px]">
        {STEPS.map((item, index) => (
          <TerminalAnimationTabTrigger
            key={item.label}
            index={index}
            className="rounded-[6px] px-2.5 py-1 text-[#9A9A9A] transition-colors duration-200 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8FA2FF] data-[state=active]:bg-[#EDEDED] data-[state=active]:text-[#1E1E1E] sm:px-3"
          >
            {item.label}
          </TerminalAnimationTabTrigger>
        ))}
      </TerminalAnimationTabList>
    </TerminalAnimationRoot>
  );

  if (plain) return terminal;

  return (
    <div className="relative h-[440px] overflow-hidden bg-[#56595D]">
      <img
        src="/images/terminal-rays.webp"
        alt=""
        aria-hidden
        loading="lazy"
        width={1217}
        height={768}
        className="absolute inset-0 size-full object-cover object-bottom"
      />
      {terminal}
    </div>
  );
}
