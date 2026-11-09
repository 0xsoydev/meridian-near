export default function AgentsPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-12">
      <header>
        <h1 className="text-3xl font-semibold">Agents</h1>
        <p className="text-[#555]">An agent needs two environment variables and one approval. It never holds a NEAR key.</p>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">1. Ask for a key</h2>
        <pre className="overflow-x-auto rounded-[8px] bg-[#111] p-4 text-xs text-white">
{`curl -sS -X POST $MERIDIAN/api/v1/device \\
  -H 'content-type: application/json' \\
  -d '{"name":"claude-code on my laptop","cap_usd_micro":"5000000"}'`}
        </pre>
        <p className="text-sm text-[#555]">
          Show the link and the QR to the human. Poll <code>/api/v1/device/&lt;device_code&gt;</code> every 3 seconds; the key arrives once,
          after the human sets the on-chain limit.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">2. Point the agent at the router</h2>
        <pre className="overflow-x-auto rounded-[8px] bg-[#111] p-4 text-xs text-white">
{`OPENAI_BASE_URL=$MERIDIAN/api/v1
OPENAI_API_KEY=rk_…`}
        </pre>
        <p className="text-sm text-[#555]">
          Any OpenAI-compatible client works. The router pulls from the owner&apos;s wallet when the float runs low, inside the daily limit.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">3. Check the budget</h2>
        <pre className="overflow-x-auto rounded-[8px] bg-[#111] p-4 text-xs text-white">{`curl $MERIDIAN/api/v1/me?format=text -H "authorization: Bearer $OPENAI_API_KEY"`}</pre>
        <p className="text-sm text-[#555]">
          A 403 carries an <code>action</code> with the approval link, a QR and the <code>near</code> command. Show it to the human and poll{" "}
          <code>/api/v1/me</code> until the limit has room.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">4. Buy or sell MTokens</h2>
        <pre className="overflow-x-auto rounded-[8px] bg-[#111] p-4 text-xs text-white">
{`curl -X POST $MERIDIAN/api/v1/trades -H "authorization: Bearer $OPENAI_API_KEY" \\
  -d '{"model":"glm-5.3-flash","tokens":"1000000"}'
curl -X POST $MERIDIAN/api/v1/sells  -H "authorization: Bearer $OPENAI_API_KEY" \\
  -d '{"model":"glm-5.3-flash","tokens":"500000"}'`}
        </pre>
      </section>

      <p className="text-sm text-[#777]">Never ask a human for a private key. The agent only ever holds an rk_ router key.</p>
    </main>
  );
}
