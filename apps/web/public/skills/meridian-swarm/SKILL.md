---
name: meridian-swarm
description: Run one coding task on several models at once through Meridian, each model as its own OpenCode sub-agent in its own git worktree, paid from a Meridian key inside its owner's daily limit. Use when the user asks for a swarm, for several models or agents at once, or to compare how the cheapest models solve a task.
---

# Meridian swarm

Runs the task on the cheapest models with a live ask on Meridian, or on the models the user names. Each model gets its own OpenCode sub-agent in its own git worktree, and its own key with an even share of the budget. You get one patch per model back. Nothing is applied to the user's files.

## Run it

It needs Node 22.18 or newer, git, OpenCode (`opencode` on the PATH) and `MERIDIAN_URL` set to the Meridian host. Run it from inside the user's repository:

```sh
node <this skill's directory>/swarm.ts <agents> "<task>" [--budget 0.50] [--models a,b] [--minutes 60] [--check "<command>"]
```

- `<agents>`: 1 to 8. The cheapest distinct models with a live ask are used. If fewer models are live, fewer agents run, and the output says so.
- `--models`: comma-separated Meridian model ids to use instead of the cheapest ones. Leave out `<agents>` when you pass it.
- `--budget`: the most the whole swarm can spend, in USD, split evenly between the agents. Default 0.50.
- `--check`: a command run in each worktree after its agent finishes, such as `pnpm test`. Pass or fail is reported per agent.
- `--minutes`: how long the agents' keys live. Default 60.

The first run without `MERIDIAN_API_KEY` prints a link and a QR code. The user approves it with their NEAR wallet and sets a daily limit, and the key is kept in `~/.config/meridian/key`. If today's limit can't cover the budget, the script prints the approval link and waits for the user to raise it.

Show the user the plan and the progress lines as they come. Ctrl-C stops the agents, ends the swarm and returns the unspent budget.

## Read the result

The last line of output is JSON:

```json
{"swarm":{"run":"…","agents":[{"n":1,"model":"…","state":"done","exit":0,"patch":".swarm/…/1/change.patch","added":3,"removed":1,"check":"pass","cost_usd_micro":"2100","seconds":91}],"spent_usd_micro":"…","returned_usd_micro":"…"}}
```

1. Read the patches of the agents that finished (`state: "done"`), preferring `check: "pass"`.
2. Pick the best one, or combine them, and tell the user which and why, with what each cost.
3. Apply it with `git apply <patch>` from the repository root only after the user agrees.

Changes under `.opencode/` are left out of patches. Exit code 0 means the swarm ran, 1 means it couldn't start (the message says what to do), and 2 means the arguments were wrong.
