# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A CLI-first autonomous coding agent. The user runs `agent "<task>"` (or `agent` for REPL) inside any local repo; this codebase is the agent's own implementation. The agent talks to LLMs via OpenRouter, uses a strict JSON tool-calling loop, and operates on the **CWD where it was invoked** — not on this repo.

Provider scope: OpenRouter only. Ollama support was deliberately removed; if asked to add local-model support back, do not assume the old code can be revived (`MODEL_PROVIDER`, `LOCAL_MODEL`, `OLLAMA_HOST` no longer exist).

## Commands

```bash
npm install            # one-time
npm link               # exposes `agent` globally on PATH

agent "<task>"         # one-shot mode
agent                  # interactive REPL
agent --continue       # resume last session for current CWD
agent --plan "<task>"  # require approval of a plan before write tools fire
agent --yes "<task>"   # auto-approve every write/patch/run_command (CI / scripts)
```

There is no test suite, no lint config, and no build step. To smoke-test a change, run `node -e "import('./src/<file>.js').then(...)"` against the affected module — that's how Sprint 1–3 changes were validated.

## Architecture

### Agent loop (`src/agent.js`)

`runTurn(session, userInput)` is the core. It:

1. Pre-processes input with `expandMentions` (inlines `@path` file contents).
2. Builds the system prompt via `buildSystemPrompt` (base prompt + `~/.agentcode/AGENT.md` + `<cwd>/AGENT.md` + plan-mode block when active).
3. Loops up to `MAX_STEPS = 25`:
   - Streams a model response via `callModel`, with `onThought` printing the model's `"thought"` field live (extracted from partial JSON via regex).
   - Parses one JSON object per turn. Three valid shapes: `{tool, args}`, `{plan}` (only honored in plan mode), `{final}`.
   - Dispatches tools, appends results back as `role: 'user'` messages, repeats.
4. Mutates `session.messages` and `session.totalUsage` in place. Caller saves the session.

`runAgent(task)` is a thin one-shot wrapper that creates an ephemeral session and calls `runTurn`.

### Tool protocol (`src/tools.js`)

Seven tools, all share a `safePath` sandbox that blocks paths escaping `process.cwd()`. Read-only tools (`read_file`, `list_files`, `search_repo`, `git_diff`) run unattended. Write tools (`write_file`, `edit_file`, `apply_patch`, `run_command`) call `confirm()` from `src/confirm.js` and return the string `"user declined ..."` on rejection — that string flows back to the model so it can react instead of crashing the loop. The set of "write tools" is duplicated in `src/context.js`'s `WRITE_TOOLS` for plan-mode gating; keep them in sync if you add a tool.

`run_command` blocks a hardcoded list of destructive shell patterns (`rm -rf`, `format`, `shutdown`, etc.) before even prompting.

### Model adapter (`src/model.js`)

Streaming-only against `https://openrouter.ai/api/v1/chat/completions` with `stream_options.include_usage` for token counts. Sets a global undici `Agent` with `headersTimeout: 0, bodyTimeout: 0` at module load — this is **load-bearing** because OpenRouter's first byte can lag past undici's 5-min default for large prompts. Do not remove.

`getPricing(modelId)` lazily fetches `/api/v1/models` once per process and caches per-model pricing. `computeCost(usage, pricing)` is a straight multiply. Cost tracking uses the **currently active** model's pricing for **all** accumulated usage in the session — this is wrong if the user did `/model` mid-session. Known limitation, not worth fixing yet.

### Sessions (`src/session.js`)

Persisted as JSON to `~/.agentcode/sessions/<basename>-<sha1[0:8]>.json`. The hash is over the absolute CWD, so two repos with the same name in different paths don't collide, and moving a repo loses its session (intentional trade-off). The system prompt is **not** stored — it's rebuilt per turn so AGENT.md edits and prompt changes take effect immediately on the next turn.

Save granularity is per completed turn (after `final` or hitting `MAX_STEPS`). A crash mid-turn loses that turn but keeps prior history.

### REPL (`src/repl.js`) and shared stdin (`src/io.js`)

REPL and `confirm()` share a singleton readline via `getReadline()`. Do not create a per-prompt readline anywhere — that pattern caused stdin contention on Windows and was deliberately removed.

Slash commands: `/help /exit /clear /model [slug] /plan [on|off] /cost`. `/clear` wipes `messages` + `totalUsage` in memory; the next save overwrites the session file with the empty state.

### Plan mode

Two-part enforcement:
1. The system prompt gains a "Plan mode (ACTIVE)" block via `buildSystemPrompt({ planMode: true })` instructing the model to return `{plan}` before writes.
2. Hard gate in `runTurn`: even if the model ignores the prompt, any write tool call with `planApproved === false` is rejected with a corrective message back to the model. `planApproved` resets on every new turn — approval doesn't carry over.

`session.planMode` (persisted) is the toggle; `planApproved` (per-turn local) is the gate. Don't conflate them.

### `.env` loading

`bin/agent.js` loads `.env` from the agent's own install directory (resolved via `import.meta.url`), **not** from the CWD. This is intentional: the user runs `agent` from arbitrary repos, so a CWD-relative `.env` would break. Shell environment variables still override `.env` (dotenv default).

### Tools the model is told about

The system prompt in `src/prompt.js` lists exactly the seven tools by name and signature. If you add a tool to `src/tools.js`, you must also: (a) document it in `src/prompt.js`, (b) add it to `WRITE_TOOLS` in `src/context.js` if it has side effects, (c) wire confirmation in the tool itself if it's a write.

## Conventions worth knowing

- **ESM only.** `package.json` has `"type": "module"`. Use `import`, not `require`. Built-in modules use the `node:` prefix.
- **No comments unless they explain *why*.** This code intentionally has very few comments. Don't add docstrings or running narration.
- **Match user language in `final`.** The base prompt instructs the model to reply in the user's language. Don't change this without thinking — it's how Spanish-speaking users get Spanish summaries.
- **Output truncation everywhere.** Tool results cap at 8 KB, file reads at 200 KB, mention injections at 50 KB. If you add a tool that returns text, apply the same `trim()` pattern.
- **Path sandboxing is a hard invariant.** Every path that comes from a tool arg or `@mention` goes through `safePath` (in `tools.js`) or its inline equivalent (in `context.js`). Don't bypass it.
