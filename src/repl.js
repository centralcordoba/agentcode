import { runTurn } from './agent.js';
import { activeModel, getPricing, computeCost } from './model.js';
import { saveSession } from './session.js';
import { getReadline } from './io.js';
import { t } from './i18n.js';
import { setLanguage, getLanguage, languageName, loadConfig, saveConfig } from './config.js';

export async function runRepl(session, sessionPath) {
  console.log(`[MODEL: ${activeModel()}]`);
  console.log(`[CWD:   ${session.cwd}]`);
  if (session.messages.length) {
    console.log(t('resumed', session.messages.length));
  }
  console.log(t('typeTask') + '\n');

  const rl = getReadline();

  while (true) {
    let input;
    try {
      input = await rl.question('> ');
    } catch {
      break;
    }
    input = input.trim();
    if (!input) continue;

    if (input.startsWith('/')) {
      const stop = await handleCommand(input, session);
      if (stop) break;
      continue;
    }

    try {
      await runTurn(session, input);
      saveSession(session, sessionPath);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      if (err.cause) console.error(`Cause: ${err.cause.code || err.cause.message}`);
    }
    console.log();
  }
}

async function handleCommand(line, session) {
  const [cmd, ...rest] = line.split(/\s+/);
  switch (cmd) {
    case '/exit':
    case '/quit':
      return true;

    case '/clear':
      session.messages = [];
      session.totalUsage = { prompt_tokens: 0, completion_tokens: 0 };
      console.log(t('historyCleared'));
      return false;

    case '/model':
      if (rest.length === 0) {
        console.log(t('activeModel', activeModel()));
      } else {
        process.env.MODEL = rest[0];
        session.model = rest[0];
        console.log(t('modelSet', rest[0]));
      }
      return false;

    case '/plan':
      if (rest.length === 0) {
        console.log(t('planMode', !!session.planMode));
      } else if (rest[0] === 'on') {
        session.planMode = true;
        console.log(t('planMode', true));
      } else if (rest[0] === 'off') {
        session.planMode = false;
        console.log(t('planMode', false));
      } else {
        console.log(t('planModeUsage'));
      }
      return false;

    case '/lang':
      if (rest.length === 0) {
        console.log(t('activeLanguage', languageName()));
      } else if (setLanguage(rest[0])) {
        const cfg = loadConfig();
        cfg.language = rest[0];
        saveConfig(cfg);
        console.log(t('languageSet', languageName()));
      } else {
        console.log(t('languageUsage'));
      }
      return false;

    case '/cost':
      await showCost(session);
      return false;

    case '/help':
      printHelp();
      return false;

    default:
      console.log(t('unknownCommand', cmd));
      return false;
  }
}

function printHelp() {
  const dim = (s) => `\x1b[2m${s}\x1b[0m`;
  const bold = (s) => `\x1b[1m${s}\x1b[0m`;
  console.log(t('helpText', { dim, bold }));
}

async function showCost(session) {
  const total = (session.totalUsage.prompt_tokens || 0) + (session.totalUsage.completion_tokens || 0);
  if (!total) {
    console.log(t('noUsage'));
    return;
  }
  const pricing = await getPricing(activeModel());
  const cost = computeCost(session.totalUsage, pricing);
  const costStr = cost != null ? ` · $${cost.toFixed(4)}` : '';
  console.log(
    `${session.totalUsage.prompt_tokens} in / ${session.totalUsage.completion_tokens} out tokens${costStr}`
  );
}
