import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";

type Agent = { key: string; keyId: string; model: string; rail: string; ask: bigint };
type State = "working" | "done" | "failed" | "stopped";
type Run = {
  n: number;
  agent: Agent;
  home: string;
  work: string;
  child: ChildProcess | null;
  state: State;
  started: number;
  ended: number | null;
  exit: number | null;
  spent: bigint;
  added: number;
  removed: number;
  check: "pass" | "fail" | null;
};

const USAGE = 'usage: node swarm.ts <agents> "<task>" [--budget 0.50] [--models a,b] [--minutes 60] [--check "<command>"]';
const KEY_FILE = join(homedir(), ".config", "meridian", "key");
const HOST = (process.env.MERIDIAN_URL ?? "").replace(/\/+$/, "");
const LIVE = process.stdout.isTTY === true && !process.env.NO_COLOR && process.env.TERM !== "dumb";
const RAILS: Record<string, string> = {
  "near-ai": "NEAR AI",
  openrouter: "OpenRouter",
  commandcode: "Command Code",
  zen: "OpenCode Zen",
  "opencode-go": "OpenCode Go",
  anthropic: "Anthropic",
  openai: "OpenAI",
  "claude-code": "Claude Code",
  codex: "Codex",
  stub: "Stub",
};

function say(line = ""): void {
  process.stdout.write(`${line}\n`);
}

function stop(code: number, line: string): never {
  process.stderr.write(`${line}\n`);
  process.exit(code);
}

function sleep(ms: number): Promise<void> {
  return new Promise((done) => setTimeout(done, ms));
}

function usd(micro: bigint): string {
  if (micro > 0n && micro < 100n) return "<$0.0001";
  const dollars = Number(micro) / 1e6;
  return `$${dollars.toFixed(dollars !== 0 && dollars < 1 ? 4 : 2).replace(/(\.\d\d\d*?)0+$/, "$1")}`;
}

function clock(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function microOf(value: string): bigint | null {
  const match = /^\$?(\d{1,6})(?:\.(\d{1,6}))?$/.exec(value.trim());
  if (!match) return null;
  return BigInt(match[1] ?? "0") * 1_000_000n + BigInt((match[2] ?? "").padEnd(6, "0"));
}

function fields(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function digits(value: unknown): bigint {
  const text = str(value);
  return /^\d+$/.test(text) ? BigInt(text) : 0n;
}

function message(body: Record<string, unknown>): string {
  return str(fields(body.error).message) || "Meridian refused the request.";
}

function git(cwd: string, ...args: string[]): string {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(" ")} failed`);
  return result.stdout.trim();
}

async function call(path: string, key: string | null, init: { method?: string; body?: unknown } = {}): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${HOST}${path}`, {
    method: init.method ?? "GET",
    headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
    ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
  });
  return { status: response.status, body: fields(await response.json().catch(() => null)) };
}

async function routerKey(): Promise<string> {
  const given = process.env.MERIDIAN_API_KEY;
  if (given) return given;
  if (existsSync(KEY_FILE)) return readFileSync(KEY_FILE, "utf8").trim();
  const start = await call("/api/v1/device", null, { method: "POST", body: { name: "meridian-swarm", cap_usd_micro: "5000000" } });
  if (start.status >= 300) stop(1, `Meridian didn't start the approval: ${message(start.body)}`);
  say(`Approve this agent with your NEAR wallet: ${str(start.body.verification_uri_complete)} (code ${str(start.body.user_code)})`);
  say(str(start.body.qr));
  const every = typeof start.body.interval === "number" ? start.body.interval * 1000 : 3000;
  for (;;) {
    await sleep(every);
    const poll = await call(`/api/v1/device/${str(start.body.device_code)}`, null);
    const key = str(poll.body.key);
    if (poll.body.status === "approved" && key) {
      mkdirSync(dirname(KEY_FILE), { recursive: true, mode: 0o700 });
      writeFileSync(KEY_FILE, key, { mode: 0o600 });
      say(`Approved. The key is saved in ${KEY_FILE}.`);
      return key;
    }
    if (poll.body.status === "denied" || poll.body.status === "expired") stop(1, `The approval was ${str(poll.body.status)}. Run this again for a new link.`);
  }
}

async function limitLeft(key: string): Promise<bigint | null> {
  const me = await call("/api/v1/me", key);
  const left = str(fields(me.body.cap).left_usd_micro);
  return me.status === 200 && /^\d+$/.test(left) ? BigInt(left) : null;
}

async function begin(key: string, request: Record<string, unknown>, budget: bigint): Promise<{ agents: Agent[]; share: bigint }> {
  for (let attempt = 0; ; attempt += 1) {
    const answer = await call("/api/v1/swarm", key, { method: "POST", body: request });
    if (answer.status === 200) {
      const agents = (Array.isArray(answer.body.agents) ? answer.body.agents : []).map(fields).map((item) => ({
        key: str(item.key),
        keyId: str(item.key_id),
        model: str(item.model),
        rail: str(item.rail),
        ask: digits(item.ask_micro_per_mtok),
      }));
      if (agents.length === 0 || agents.some((agent) => !agent.key || !agent.keyId || !agent.model)) {
        stop(1, "Meridian answered in a shape this script doesn't know. Download the skill again.");
      }
      return { agents, share: digits(answer.body.share_usd_micro) };
    }
    const action = fields(answer.body.action);
    if (answer.status === 403 && str(fields(answer.body.error).code) === "approval_required" && attempt === 0 && str(action.url)) {
      const room = await limitLeft(key);
      say(room === null ? message(answer.body) : `Your daily limit has ${usd(room)} left and this swarm needs ${usd(budget)}.`);
      say(`Approve more at ${str(action.url)}${room !== null && room > 0n ? `, or run with --budget ${(Number(room) / 1e6).toFixed(2)}` : ""}.`);
      if (str(action.qr)) say(str(action.qr));
      say("Waiting for the approval. Ctrl-C stops waiting.");
      for (const until = Date.now() + 600_000; Date.now() < until; ) {
        await sleep(5000);
        const now = await limitLeft(key);
        if (now !== null && now >= budget) break;
      }
      continue;
    }
    stop(1, answer.status === 402 && str(action.url) ? `${message(answer.body)} ${str(action.url)}` : message(answer.body));
  }
}

function configure(home: string, model: string): void {
  const ref = `meridian/${model}`;
  mkdirSync(join(home, ".opencode"), { recursive: true });
  writeFileSync(
    join(home, ".opencode", "opencode.json"),
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        model: ref,
        agents: { title: { model: ref }, summary: { model: ref }, compaction: { model: ref } },
        providers: {
          meridian: {
            name: "Meridian",
            env: ["MERIDIAN_SWARM_KEY"],
            package: "@opencode/ai/providers/openai-compatible",
            settings: { baseURL: `${HOST}/api/v1` },
            models: { [model]: { name: model } },
          },
        },
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      budget: { type: "string", default: "0.50" },
      models: { type: "string" },
      minutes: { type: "string", default: "60" },
      check: { type: "string" },
    },
  });
  const models = values.models ? values.models.split(",").map((model) => model.trim()).filter(Boolean) : null;
  const count = models ? null : Number(positionals[0]);
  const task = (models ? positionals.join(" ") : positionals.slice(1).join(" ")).trim();
  const budget = microOf(values.budget);
  const minutes = Number(values.minutes);
  if (!task || budget === null || budget === 0n || !Number.isInteger(minutes) || (count !== null && (!Number.isInteger(count) || count < 1 || count > 8))) {
    stop(2, USAGE);
  }
  if (!HOST) stop(1, "Set MERIDIAN_URL to your Meridian host, like https://meridian.example, then run this again.");
  if (spawnSync("opencode", ["--version"], { stdio: "ignore" }).status !== 0) {
    stop(1, "OpenCode runs the sub-agents. Install it from https://opencode.ai, then run this again.");
  }
  let root = "";
  try {
    root = git(process.cwd(), "rev-parse", "--show-toplevel");
  } catch {
    stop(1, "Run this inside a git repository.");
  }

  const key = await routerKey();
  const room = await limitLeft(key);
  const size = models ? models.length : count;
  say(`Swarm of ${size}, budget ${usd(budget)}.${room === null ? "" : ` Your daily limit has ${usd(room)} left.`}`);
  const { agents, share } = await begin(
    key,
    { ...(models ? { models } : { agents: count }), budget_usd_micro: budget.toString(), minutes },
    budget,
  );
  const width = Math.max(...agents.map((agent) => agent.model.length));
  agents.forEach((agent, index) => {
    say(`  ${String(index + 1).padStart(2)}  ${agent.model.padEnd(width)}  ${usd(agent.ask).padStart(8)} per MTok  ${RAILS[agent.rail] ?? agent.rail}`);
  });
  if (count !== null && agents.length < count) say(`Only ${agents.length} models have live asks. Running ${agents.length}.`);

  const runId = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, "");
  const dir = join(root, ".swarm", runId);
  const runs: Run[] = agents.map((agent, index) => ({
    n: index + 1,
    agent,
    home: join(dir, String(index + 1)),
    work: join(dir, String(index + 1), "work"),
    child: null,
    state: "working",
    started: Date.now(),
    ended: null,
    exit: null,
    spent: 0n,
    added: 0,
    removed: 0,
    check: null,
  }));
  const ids = agents.map((agent) => agent.keyId);
  const endSwarm = () => call("/api/v1/swarm", key, { method: "DELETE", body: { key_ids: ids } });

  let base = "";
  try {
    base = git(root, "stash", "create") || git(root, "rev-parse", "HEAD");
    const exclude = resolve(root, git(root, "rev-parse", "--git-path", "info/exclude"));
    mkdirSync(dirname(exclude), { recursive: true });
    if (!existsSync(exclude) || !readFileSync(exclude, "utf8").split("\n").includes(".swarm/")) appendFileSync(exclude, "\n.swarm/\n");
    for (const run of runs) {
      mkdirSync(run.home, { recursive: true });
      configure(run.home, run.agent.model);
      git(root, "worktree", "add", "--detach", run.work, base);
    }
  } catch (error) {
    await endSwarm();
    stop(1, `Couldn't prepare the worktrees, so the swarm was ended and its budget returned: ${error instanceof Error ? error.message : String(error)}`);
  }
  say(`Each agent works in its own copy of the repository under ${relative(root, dir)}/.`);
  say();

  let drawn = 0;
  const line = (run: Run) =>
    `  ${String(run.n).padStart(2)}  ${run.agent.model.padEnd(width)}  ${run.state.padEnd(8)}  ${clock((run.ended ?? Date.now()) - run.started).padStart(5)}  ${usd(run.spent).padStart(8)}`;
  const draw = () => {
    if (!LIVE) return;
    if (drawn > 0) process.stdout.write(`\x1b[${drawn}A`);
    for (const run of runs) process.stdout.write(`\x1b[2K${line(run)}\n`);
    drawn = runs.length;
  };
  const refresh = async () => {
    const view = await call("/api/v1/swarm", key);
    for (const item of (Array.isArray(view.body.agents) ? view.body.agents : []).map(fields)) {
      const run = runs.find((candidate) => candidate.agent.keyId === str(item.key_id));
      if (run) run.spent = digits(item.spent_usd_micro);
    }
  };

  let finished = 0;
  let interrupted = false;
  let wrapping: Promise<void> | null = null;
  const wrapUp = async () => {
    const ended = await endSwarm();
    await refresh();
    draw();
    const spent = runs.reduce((sum, run) => sum + run.spent, 0n);
    const returned = digits(ended.body.returned_usd_micro);
    say();
    say(`Done in ${clock(Date.now() - Math.min(...runs.map((run) => run.started)))}. Spent ${usd(spent)} of ${usd(share * BigInt(runs.length))}. Returned ${usd(returned)} to your key.`);
    for (const run of runs) {
      const result = run.state === "done" ? "finished" : run.state === "stopped" ? "stopped" : `failed (exit ${run.exit ?? "?"})`;
      const change = run.added + run.removed === 0 ? "no changes" : `+${run.added} -${run.removed}`;
      const check = run.check === null ? "" : `  check ${run.check}`;
      say(`  ${String(run.n).padStart(2)}  ${run.agent.model.padEnd(width)}  ${result.padEnd(16)}  ${change.padEnd(12)}${check}  ${usd(run.spent)}`);
    }
    const sample = runs.find((run) => run.added + run.removed > 0);
    if (sample) say(`Apply one from the repository root: git apply ${relative(root, join(sample.home, "change.patch"))}`);
    say(`Logs are in ${relative(root, dir)}/<n>/opencode.log. Clean up later with: rm -rf ${relative(root, dir)} && git worktree prune`);
    say(
      JSON.stringify({
        swarm: {
          run: runId,
          agents: runs.map((run) => ({
            n: run.n,
            model: run.agent.model,
            state: run.state,
            exit: run.exit,
            patch: relative(root, join(run.home, "change.patch")),
            added: run.added,
            removed: run.removed,
            check: run.check,
            cost_usd_micro: run.spent.toString(),
            seconds: Math.round(((run.ended ?? Date.now()) - run.started) / 1000),
          })),
          spent_usd_micro: spent.toString(),
          returned_usd_micro: returned.toString(),
        },
      }),
    );
    process.exit(0);
  };

  const settle = (run: Run, code: number | null) => {
    if (run.ended !== null) return;
    run.ended = Date.now();
    run.exit = code;
    if (run.state === "working") run.state = code === 0 ? "done" : "failed";
    try {
      git(run.work, "add", "-A", "--", ".", ":(exclude).opencode");
      writeFileSync(join(run.home, "change.patch"), spawnSync("git", ["diff", "--cached", "--binary", base], { cwd: run.work }).stdout);
      for (const row of git(run.work, "diff", "--cached", "--numstat", base).split("\n")) {
        const [added, removed] = row.split("\t");
        run.added += Number(added) || 0;
        run.removed += Number(removed) || 0;
      }
      if (values.check) run.check = spawnSync(values.check, { cwd: run.work, shell: true, stdio: "ignore", timeout: 600_000 }).status === 0 ? "pass" : "fail";
    } catch {
      run.state = "failed";
    }
    if (!LIVE) say(line(run));
    finished += 1;
    if (finished === runs.length) wrapping ??= wrapUp();
  };

  process.on("SIGINT", () => {
    if (interrupted) process.exit(130);
    interrupted = true;
    say("Stopping the agents and returning the rest of the budget. Ctrl-C again quits at once.");
    for (const run of runs) {
      if (run.ended !== null || !run.child?.pid) continue;
      run.state = "stopped";
      try {
        process.kill(-run.child.pid, "SIGTERM");
      } catch {
        settle(run, null);
      }
    }
  });

  for (const run of runs) {
    const log = openSync(join(run.home, "opencode.log"), "a");
    const child = spawn("opencode", ["run", "--standalone", "--auto", "--model", `meridian/${run.agent.model}`, task], {
      cwd: run.work,
      env: { ...process.env, PWD: run.work, MERIDIAN_SWARM_KEY: run.agent.key },
      stdio: ["ignore", log, log],
      detached: true,
    });
    run.child = child;
    child.on("exit", (code) => settle(run, code));
    child.on("error", () => settle(run, null));
    if (!LIVE) say(line(run));
  }
  draw();
  while (finished < runs.length) {
    await sleep(2000);
    await refresh().catch(() => undefined);
    draw();
  }
  await wrapping;
}

void main();
