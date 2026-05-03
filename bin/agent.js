#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '..', '.env') });

const { runTurn, printUsage } = await import('../src/agent.js');
const { activeModel } = await import('../src/model.js');
const { createSession, loadSession, saveSession, sessionPathForCwd } = await import('../src/session.js');
const { runRepl } = await import('../src/repl.js');
const { getReadline, closeReadline } = await import('../src/io.js');
const { loadConfig, saveConfig, setLanguage } = await import('../src/config.js');
const { t } = await import('../src/i18n.js');

const argv = process.argv.slice(2);
const flags = new Set();
const positional = [];
for (const a of argv) {
  if (a === '--yes' || a === '-y') flags.add('yes');
  else if (a === '--continue' || a === '-c') flags.add('continue');
  else if (a === '--plan') flags.add('plan');
  else if (a === '--help' || a === '-h') flags.add('help');
  else positional.push(a);
}

if (flags.has('help')) {
  console.log('Usage: agent [options] ["<task>"]');
  console.log('  --yes, -y         Auto-approve all writes/patches/commands');
  console.log('  --continue, -c    Resume the last session in this directory');
  console.log('  --plan            Enable plan-before-act mode for this session');
  console.log('  --help, -h        Show this help');
  console.log('  (no task)         Enter interactive REPL mode');
  console.log('');
  console.log('REPL commands: /help /exit /clear /model /plan /lang /cost');
  process.exit(0);
}

if (flags.has('yes')) process.env.AGENT_AUTO_APPROVE = '1';

const config = loadConfig();
let language = config.language;
if (!language) {
  if (flags.has('yes')) {
    language = 'en';
  } else {
    language = await promptLanguage();
  }
  config.language = language;
  saveConfig(config);
}
setLanguage(language);

const sessionPath = sessionPathForCwd();
let session;
if (flags.has('continue')) {
  session = loadSession(sessionPath);
  if (!session) {
    console.log('No previous session in this directory; starting fresh.');
    session = createSession({ model: activeModel() });
  } else {
    console.log(t('resumed', session.messages.length));
  }
} else {
  session = createSession({ model: activeModel() });
}

if (flags.has('plan')) session.planMode = true;

try {
  if (positional.length === 0) {
    await runRepl(session, sessionPath);
  } else {
    const task = positional.join(' ');
    console.log(`[MODEL: ${activeModel()}]`);
    console.log(`[TASK: ${task}]\n`);
    const { steps } = await runTurn(session, task);
    saveSession(session, sessionPath);
    await printUsage(steps, session.totalUsage);
  }
} catch (err) {
  console.error('Error:', err.message);
  if (err.cause) console.error('Cause:', err.cause.code || err.cause.message);
  process.exitCode = 1;
} finally {
  closeReadline();
}

async function promptLanguage() {
  const rl = getReadline();
  console.log(t('chooseLanguage'));
  while (true) {
    const ans = (await rl.question(t('chooseLanguagePrompt'))).trim().toLowerCase();
    if (ans === '1' || ans === 'en' || ans === 'english') return 'en';
    if (ans === '2' || ans === 'es' || ans === 'español' || ans === 'espanol') return 'es';
    console.log(t('invalidChoice'));
  }
}
