import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SYSTEM_PROMPT } from './prompt.js';
import { languageName } from './config.js';

const MAX_MENTION_BYTES = 50_000;

const WRITE_TOOLS = new Set(['write_file', 'edit_file', 'apply_patch', 'run_command']);

export function isWriteTool(name) {
  return WRITE_TOOLS.has(name);
}

function tryReadFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    const len = Math.min(stat.size, MAX_MENTION_BYTES);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, 0);
    fs.closeSync(fd);
    let text = buf.toString('utf8');
    if (stat.size > MAX_MENTION_BYTES) {
      text += `\n... [truncated, file is ${stat.size} bytes]`;
    }
    return text;
  } catch {
    return null;
  }
}

export function loadAgentMd(cwd = process.cwd()) {
  const userMd = tryReadFile(path.join(os.homedir(), '.agentcode', 'AGENT.md'));
  const projectMd = tryReadFile(path.join(cwd, 'AGENT.md'));
  return { userMd, projectMd };
}

export function buildSystemPrompt({ planMode = false, cwd = process.cwd(), language } = {}) {
  let prompt = SYSTEM_PROMPT;
  if (language) {
    prompt += `\n\n# Language\nAlways write the "final" field and any user-facing text in ${languageName(language)}. Tool arguments stay in their original technical form.`;
  }
  const { userMd, projectMd } = loadAgentMd(cwd);
  if (userMd) {
    prompt += `\n\n# User instructions (~/.agentcode/AGENT.md)\n${userMd}`;
  }
  if (projectMd) {
    prompt += `\n\n# Project instructions (./AGENT.md)\n${projectMd}`;
  }
  if (planMode) {
    prompt += `\n\n# Plan mode (ACTIVE)
Before calling any write tool (write_file, edit_file, apply_patch, run_command), you MUST first respond with:
{"thought": "<brief reasoning>", "plan": "<numbered or bullet list of what you intend to do>"}
You may freely call read-only tools (read_file, list_files, search_repo, git_diff) to gather information before producing the plan.
After the user approves, you'll receive a message "Plan approved. Proceed." — only then can you call write tools.
If the user rejects, revise the plan or return {"final": "..."} to abort.`;
  }
  return prompt;
}

export function expandMentions(input, cwd = process.cwd()) {
  const matches = [...input.matchAll(/@([\w./\\-]+)/g)];
  if (matches.length === 0) return input;
  const seen = new Set();
  const blocks = [];
  for (const m of matches) {
    const rel = m[1];
    if (seen.has(rel)) continue;
    const abs = path.resolve(cwd, rel);
    const relCheck = path.relative(cwd, abs);
    if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) continue;
    const content = tryReadFile(abs);
    if (content == null) continue;
    seen.add(rel);
    blocks.push(`--- @${rel} ---\n${content}\n--- end @${rel} ---`);
  }
  if (blocks.length === 0) return input;
  return `${input}\n\n[Referenced files:]\n${blocks.join('\n\n')}`;
}
