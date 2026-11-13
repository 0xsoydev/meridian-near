import Link from "next/link";
import { CopyButton } from "../../../components/copy-button";
import { LINK, PAGE, PageHeader } from "../../../components/kit";
import { AgentsTerminal } from "../../../components/landing/agents-terminal";

const HOST = (process.env.PUBLIC_HOST ?? "http://localhost:3000").replace(/\/+$/, "");
const DEMO = process.env.DEMO_KEYS === "1";

const STEPS = [
  {
    title: "Ask your human for a key",
    body: "Start the device flow with a name they will recognise and the daily limit you want. Show them the link or the QR it returns.",
    code: `export MERIDIAN=${HOST}
curl -sS -X POST $MERIDIAN/api/v1/device \\
  -H 'content-type: application/json' \\
  -d '{"name":"claude-code on my laptop","cap_usd_micro":"5000000"}'`,
  },
  {
    title: "Wait for the approval",
    body: "They open the link with a NEAR wallet and set your daily limit on chain. Poll every interval seconds. The key arrives once, so store it.",
    code: `curl -sS $MERIDIAN/api/v1/device/$DEVICE_CODE
{"status":"approved","key":"rk_...","key_id":"..."}`,
  },
  {
    title: "Point your client at Meridian",
    body: "The router speaks the OpenAI Chat Completions API and takes the cheapest live ask for the model you name.",
    code: `export OPENAI_BASE_URL=$MERIDIAN/api/v1
export OPENAI_API_KEY=rk_...
curl -sS $OPENAI_BASE_URL/chat/completions \\
  -H "authorization: Bearer $OPENAI_API_KEY" \\
  -H 'content-type: application/json' \\
  -d '{"model":"glm-5.3","messages":[{"role":"user","content":"hello"}]}'`,
  },
  {
    title: "Buy ahead, sell what you don't use",
    body: "Lock in today's price with a buy. Requests spend those MTokens first, and whatever is left sells back into the bids.",
    code: `curl -sS -X POST $MERIDIAN/api/v1/trades \\
  -H "authorization: Bearer $OPENAI_API_KEY" -H 'content-type: application/json' \\
  -d '{"model":"glm-5.3","tokens":"1000000"}'
curl -sS -X POST $MERIDIAN/api/v1/sells \\
  -H "authorization: Bearer $OPENAI_API_KEY" -H 'content-type: application/json' \\
  -d '{"model":"glm-5.3","tokens":"500000"}'`,
  },
] as const;

function Code({ code }: { code: string }) {
  return (
    <div className="flex min-w-0 flex-col bg-terminal">
      <div className="flex h-11 items-center justify-end border-b border-white/10 px-3">
        <CopyButton value={code} dark />
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[12px] leading-[20px] text-[#F5F5F5] [scrollbar-color:rgba(255,255,255,0.2)_transparent]">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function AgentsPage() {
  return (
    <div className={PAGE}>
      <PageHeader title="Agents">
        An agent needs a base URL, a router key and one approval from you. It never holds a NEAR key, and it can&apos;t spend past the daily limit
        you set on chain.
      </PageHeader>

      <AgentsTerminal />

      <ol className="flex flex-col">
        {STEPS.map((step, index) => (
          <li key={step.title} className="grid gap-5 border-t border-line py-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-12">
            <div className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3">
              <span aria-hidden className="pt-[3px] text-[13px] tabular-nums text-muted">
                {index + 1}
              </span>
              <div className="flex flex-col gap-2">
                <h2 className="text-[18px] leading-[24px] text-ink">{step.title}</h2>
                <p className="text-pretty text-[14px] leading-[22px] text-muted">{step.body}</p>
              </div>
            </div>
            <Code code={step.code} />
          </li>
        ))}
      </ol>

      {DEMO ? (
        <section className="-mt-12 grid gap-5 border-t border-line py-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-12">
          <div className="flex flex-col gap-2 pl-8">
            <h2 className="text-[18px] leading-[24px] text-ink">Try it without a wallet</h2>
            <p className="text-pretty text-[14px] leading-[22px] text-muted">
              This deployment hands out demo keys at once. They spend from a shared house wallet under one daily limit for everyone.
            </p>
          </div>
          <Code
            code={`curl -sS -X POST $MERIDIAN/api/v1/device \\
  -H 'content-type: application/json' \\
  -d '{"name":"trying meridian","demo":true}'
{"key":"rk_...","key_id":"..."}`}
          />
        </section>
      ) : null}

      <section className="-mt-12 grid gap-5 border-y border-line py-10 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:gap-12">
        <div className="flex flex-col gap-2 pl-8">
          <h2 className="text-[18px] leading-[24px] text-ink">When the money runs out</h2>
          <p className="text-pretty text-[14px] leading-[22px] text-muted">
            The router answers 403 when today&apos;s limit is spent and 402 when the wallet is empty, each with a link and a QR. Show it to your
            human, poll until it clears, then retry. Never ask them for a private key.
          </p>
        </div>
        <p className="text-pretty text-[14px] leading-[22px] text-ink">
          Every endpoint, field and error is in{" "}
          <a href="/skill.md" className={LINK}>
            skill.md
          </a>
          , written for agents to read. Humans approve agents and set limits on the{" "}
          <Link href="/keys" className={LINK}>
            Wallet
          </Link>{" "}
          page.
        </p>
      </section>
    </div>
  );
}
