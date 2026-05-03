import { callModel, activeModel, getPricing, computeCost } from './model.js';
import { tools } from './tools.js';
import { buildSystemPrompt, expandMentions, isWriteTool } from './context.js';
import { confirm } from './confirm.js';
import { createSession } from './session.js';
import { getLanguage } from './config.js';
import { t } from './i18n.js';

const MAX_STEPS = 25;

export async function runTurn(session, userInput) {
  const expanded = expandMentions(userInput, session.cwd);
  session.messages.push({ role: 'user', content: expanded });

  const planMode = !!session.planMode;
  let planApproved = false;

  const messages = [
    { role: 'system', content: buildSystemPrompt({ planMode, cwd: session.cwd, language: getLanguage() }) },
    ...session.messages
  ];

  for (let step = 1; step <= MAX_STEPS; step++) {
    process.stdout.write('\x1b[2m✻ \x1b[0m');
    let raw;
    let usage;
    try {
      const result = await callModel(messages, {
        onThought: (delta) => process.stdout.write(`\x1b[2m${delta}\x1b[0m`)
      });
      raw = result.content;
      usage = result.usage;
    } finally {
      process.stdout.write('\n');
    }

    if (usage) {
      session.totalUsage.prompt_tokens += usage.prompt_tokens || 0;
      session.totalUsage.completion_tokens += usage.completion_tokens || 0;
    }

    messages.push({ role: 'assistant', content: raw });
    session.messages.push({ role: 'assistant', content: raw });

    let parsed;
    try {
      parsed = JSON.parse(extractJson(raw));
    } catch (err) {
      const fix = `Your last response was not valid JSON (${err.message}). Reply with exactly one JSON object matching the schema.`;
      messages.push({ role: 'user', content: fix });
      session.messages.push({ role: 'user', content: fix });
      continue;
    }

    if (planMode && typeof parsed.plan === 'string') {
      console.log(`\n📋 ${t('planLabel')}:\n${parsed.plan}\n`);
      const ok = await confirm(t('approvePlan'));
      if (ok) {
        planApproved = true;
        const msg = 'Plan approved. Proceed with the implementation.';
        messages.push({ role: 'user', content: msg });
        session.messages.push({ role: 'user', content: msg });
      } else {
        const msg = 'Plan rejected by the user. Either revise it or call final to abort.';
        messages.push({ role: 'user', content: msg });
        session.messages.push({ role: 'user', content: msg });
      }
      continue;
    }

    if (typeof parsed.final === 'string') {
      console.log(`\n✔ ${parsed.final}`);
      return { final: parsed.final, steps: step };
    }

    const name = parsed.tool;
    if (!name || !Object.prototype.hasOwnProperty.call(tools, name)) {
      const fix = `Unknown or missing tool "${name}". Available: ${Object.keys(tools).join(', ')}.`;
      messages.push({ role: 'user', content: fix });
      session.messages.push({ role: 'user', content: fix });
      continue;
    }

    if (planMode && !planApproved && isWriteTool(name)) {
      const fix = `Plan mode is active and no plan has been approved yet. ${name} is a write tool. First respond with {"plan": "..."} describing what you intend to do, then wait for approval.`;
      messages.push({ role: 'user', content: fix });
      session.messages.push({ role: 'user', content: fix });
      continue;
    }

    console.log(`→ step ${step}: ${name}(${summarizeArgs(parsed.args)})`);

    let result;
    try {
      result = await tools[name](parsed.args || {});
    } catch (err) {
      result = `ERROR: ${err.message}`;
    }

    const toolMsg = `Tool result for ${name}:\n${result}`;
    messages.push({ role: 'user', content: toolMsg });
    session.messages.push({ role: 'user', content: toolMsg });
  }

  console.log(`\n✘ Reached max steps (${MAX_STEPS}) without completion.`);
  return { final: null, steps: MAX_STEPS };
}

export async function runAgent(task) {
  console.log(`[MODEL: ${activeModel()}]`);
  console.log(`[TASK: ${task}]\n`);
  const session = createSession({ model: activeModel() });
  const { steps } = await runTurn(session, task);
  await printUsage(steps, session.totalUsage);
  return session;
}

export async function printUsage(steps, usage) {
  const total = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
  if (!total) {
    console.log(`\x1b[2m[${steps} steps]\x1b[0m`);
    return;
  }
  const pricing = await getPricing(activeModel());
  const cost = computeCost(usage, pricing);
  const costStr = cost != null ? ` · $${cost.toFixed(4)}` : '';
  console.log(
    `\x1b[2m[${steps} steps · ${usage.prompt_tokens} in / ${usage.completion_tokens} out tokens${costStr}]\x1b[0m`
  );
}

function extractJson(text) {
  const trimmed = (text || '').trim();
  if (trimmed.startsWith('{')) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (fence) return fence[1];
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}

function summarizeArgs(args) {
  if (!args || typeof args !== 'object') return '';
  return Object.entries(args)
    .map(([k, v]) => {
      const s = typeof v === 'string' ? v : JSON.stringify(v);
      const short = s.length > 60 ? s.slice(0, 57) + '...' : s;
      return `${k}=${short}`;
    })
    .join(', ');
}
