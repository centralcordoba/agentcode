import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { confirm, previewWrite, previewPatch } from './confirm.js';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '.venv', '__pycache__']);
const MAX_READ_BYTES = 200_000;
const MAX_OUTPUT_CHARS = 8_000;

const DESTRUCTIVE = [
  /\brm\s+-rf?\b/i,
  /\bdel\s+\/[sq]/i,
  /\bformat\s+[a-z]:/i,
  /\bmkfs\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  />\s*\/dev\/sd/i
];

function safePath(p) {
  if (typeof p !== 'string' || !p.length) throw new Error('path must be a non-empty string');
  const abs = path.resolve(ROOT, p);
  const rel = path.relative(ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Path escapes repo root: ${p}`);
  }
  return abs;
}

function trim(str) {
  if (str.length <= MAX_OUTPUT_CHARS) return str;
  return str.slice(0, MAX_OUTPUT_CHARS) + `\n... [truncated, ${str.length - MAX_OUTPUT_CHARS} chars omitted]`;
}

export const tools = {
  read_file({ path: p }) {
    const abs = safePath(p);
    const stat = fs.statSync(abs);
    if (stat.size > MAX_READ_BYTES) {
      const fd = fs.openSync(abs, 'r');
      const buf = Buffer.alloc(MAX_READ_BYTES);
      fs.readSync(fd, buf, 0, MAX_READ_BYTES, 0);
      fs.closeSync(fd);
      return buf.toString('utf8') + `\n... [truncated, file is ${stat.size} bytes]`;
    }
    return fs.readFileSync(abs, 'utf8');
  },

  async write_file({ path: p, content }) {
    if (typeof content !== 'string') throw new Error('content must be a string');
    const abs = safePath(p);
    previewWrite(abs, content);
    if (!(await confirm(`Apply write to ${p}?`))) return 'user declined write';
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    return `wrote ${p} (${Buffer.byteLength(content, 'utf8')} bytes)`;
  },

  async edit_file({ path: p, old_string, new_string }) {
    if (typeof old_string !== 'string' || !old_string.length) throw new Error('old_string must be a non-empty string');
    if (typeof new_string !== 'string') throw new Error('new_string must be a string');
    const abs = safePath(p);
    const original = fs.readFileSync(abs, 'utf8');
    const occurrences = original.split(old_string).length - 1;
    if (occurrences === 0) return `ERROR: old_string not found in ${p}`;
    if (occurrences > 1) return `ERROR: old_string matches ${occurrences} times in ${p}; include more surrounding context to make it unique`;
    const updated = original.replace(old_string, new_string);
    previewWrite(abs, updated);
    if (!(await confirm(`Apply edit to ${p}?`))) return 'user declined edit';
    fs.writeFileSync(abs, updated, 'utf8');
    return `edited ${p}`;
  },

  list_files({ path: p = '.' } = {}) {
    const abs = safePath(p);
    const entries = fs.readdirSync(abs, { withFileTypes: true });
    const lines = entries
      .filter((e) => !IGNORE_DIRS.has(e.name))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .map((e) => `${e.isDirectory() ? 'd' : 'f'} ${e.name}`);
    return lines.join('\n') || '(empty)';
  },

  search_repo({ query }) {
    if (typeof query !== 'string' || !query.length) throw new Error('query must be a non-empty string');
    const results = [];
    walk(ROOT, (file, rel) => {
      let content;
      try {
        content = fs.readFileSync(file, 'utf8');
      } catch {
        return;
      }
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(query)) {
          results.push(`${rel}:${i + 1}: ${lines[i].trim().slice(0, 200)}`);
          if (results.length >= 200) return false;
        }
      }
    });
    return trim(results.join('\n') || '(no matches)');
  },

  async run_command({ cmd }) {
    if (typeof cmd !== 'string' || !cmd.length) throw new Error('cmd must be a non-empty string');
    if (DESTRUCTIVE.some((r) => r.test(cmd))) {
      throw new Error(`Refusing destructive command: ${cmd}`);
    }
    if (!(await confirm(`Run command: ${cmd}\n?`))) return 'user declined command';
    try {
      const out = execSync(cmd, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60_000,
        maxBuffer: 10 * 1024 * 1024
      });
      return trim(`exit=0\n${out}`);
    } catch (err) {
      const stdout = err.stdout?.toString() ?? '';
      const stderr = err.stderr?.toString() ?? '';
      return trim(`exit=${err.status ?? 1}\n${stdout}${stderr}`);
    }
  },

  git_diff() {
    try {
      const out = execSync('git diff', {
        cwd: ROOT,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });
      return trim(out || '(no unstaged changes)');
    } catch (err) {
      return `git_diff failed: ${err.message}`;
    }
  },

  async apply_patch({ diff }) {
    if (typeof diff !== 'string' || !diff.length) throw new Error('diff must be a non-empty string');
    previewPatch(diff);
    if (!(await confirm('Apply this patch?'))) return 'user declined patch';
    const tmp = path.join(os.tmpdir(), `agent-patch-${Date.now()}.diff`);
    fs.writeFileSync(tmp, diff, 'utf8');
    try {
      execSync(`git apply --whitespace=nowarn "${tmp}"`, { cwd: ROOT, stdio: 'pipe' });
      return 'patch applied';
    } catch (err) {
      const stderr = err.stderr?.toString() ?? err.message;
      return `patch failed: ${stderr}`;
    } finally {
      try { fs.unlinkSync(tmp); } catch {}
    }
  }
};

function walk(dir, visit) {
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (IGNORE_DIRS.has(e.name)) continue;
      const full = path.join(cur, e.name);
      const rel = path.relative(ROOT, full);
      if (e.isDirectory()) {
        stack.push(full);
      } else if (e.isFile()) {
        const r = visit(full, rel);
        if (r === false) return;
      }
    }
  }
}
