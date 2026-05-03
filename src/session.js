import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

const SESSIONS_DIR = path.join(os.homedir(), '.agentcode', 'sessions');

export function sessionsDir() {
  return SESSIONS_DIR;
}

export function sessionPathForCwd(cwd = process.cwd()) {
  const slug = path.basename(cwd).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 32) || 'root';
  const hash = crypto.createHash('sha1').update(cwd).digest('hex').slice(0, 8);
  return path.join(SESSIONS_DIR, `${slug}-${hash}.json`);
}

export function createSession({ cwd = process.cwd(), model } = {}) {
  const now = new Date().toISOString();
  return {
    version: 1,
    createdAt: now,
    updatedAt: now,
    cwd,
    model,
    messages: [],
    totalUsage: { prompt_tokens: 0, completion_tokens: 0 }
  };
}

export function loadSession(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!data.messages) data.messages = [];
    if (!data.totalUsage) data.totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
    return data;
  } catch {
    return null;
  }
}

export function saveSession(session, filePath) {
  session.updatedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(session, null, 2), 'utf8');
}
