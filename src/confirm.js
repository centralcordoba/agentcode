import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { getReadline } from './io.js';

let stickyApprove = false;

export function autoApprove() {
  return process.env.AGENT_AUTO_APPROVE === '1' || stickyApprove;
}

export function clearStickyApprove() {
  stickyApprove = false;
}

export async function confirm(prompt) {
  if (autoApprove()) return true;
  const rl = getReadline();
  const answer = (await rl.question(`${prompt} [y/N/a=all]: `)).trim().toLowerCase();
  if (answer === 'a' || answer === 'all') {
    stickyApprove = true;
    console.log('\x1b[2m· auto-approve enabled for the rest of this session (cleared by /clear)\x1b[0m');
    return true;
  }
  return answer === 'y' || answer === 'yes';
}

export function previewWrite(absPath, newContent) {
  if (!fs.existsSync(absPath)) {
    const lines = newContent.split('\n');
    console.log(`\n--- new file: ${absPath} (${lines.length} lines) ---`);
    console.log(lines.slice(0, 30).join('\n'));
    if (lines.length > 30) console.log(`... [${lines.length - 30} more lines]`);
    console.log('--- end preview ---\n');
    return;
  }
  const tmp = path.join(os.tmpdir(), `agent-preview-${Date.now()}`);
  fs.writeFileSync(tmp, newContent, 'utf8');
  console.log(`\n--- diff for ${absPath} ---`);
  try {
    execSync(`git --no-pager diff --no-index --no-color -- "${absPath}" "${tmp}"`, { stdio: 'inherit' });
  } catch {
    // git diff --no-index returns 1 when files differ; nothing to do
  } finally {
    try { fs.unlinkSync(tmp); } catch {}
  }
  console.log('--- end diff ---\n');
}

export function previewPatch(diff) {
  console.log('\n--- patch ---');
  console.log(diff.length > 4000 ? diff.slice(0, 4000) + '\n... [truncated]' : diff);
  console.log('--- end patch ---\n');
}
