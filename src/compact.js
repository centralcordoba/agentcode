import { callModel } from './model.js';

const MAX_PER_MESSAGE_CHARS = 1000;

export async function compactSession(session, { keep = 30 } = {}) {
  if (session.messages.length <= keep + 4) {
    return { skipped: true, reason: 'too few messages' };
  }

  const toSummarize = session.messages.slice(0, session.messages.length - keep);
  const tail = session.messages.slice(-keep);

  const transcript = toSummarize
    .map((m, i) => {
      const c = m.content.length > MAX_PER_MESSAGE_CHARS
        ? m.content.slice(0, MAX_PER_MESSAGE_CHARS) + ' …[truncated]'
        : m.content;
      return `[${i + 1}] role=${m.role}\n${c}`;
    })
    .join('\n\n---\n\n');

  const prompt = [
    {
      role: 'system',
      content:
        'You compact coding-agent conversations. Read the transcript and produce a terse bullet-list summary that preserves: ' +
        'files read/created/modified (with paths), key findings about the codebase, decisions made, errors encountered, ' +
        "and the user's evolving intent. Drop tool-call mechanics, redundant content, and full file contents. " +
        'Aim for under 1500 tokens. ' +
        'Respond with JSON: {"summary": "<bullet list as a single string with \\n between bullets>"}'
    },
    {
      role: 'user',
      content: `Summarize this conversation transcript:\n\n${transcript}`
    }
  ];

  const result = await callModel(prompt);

  let summary;
  try {
    summary = JSON.parse(result.content)?.summary;
  } catch {
    return { skipped: true, reason: 'summarizer returned invalid JSON' };
  }
  if (typeof summary !== 'string' || !summary.trim()) {
    return { skipped: true, reason: 'summarizer returned empty summary' };
  }

  const synthetic = {
    role: 'user',
    content:
      `[CONTEXT SUMMARY: ${toSummarize.length} earlier messages compacted via /compact]\n\n` +
      `${summary.trim()}\n\n` +
      `[end of summary — conversation continues below]`
  };

  const before = session.messages.length;
  session.messages = [synthetic, ...tail];

  if (result.usage) {
    session.totalUsage.prompt_tokens += result.usage.prompt_tokens || 0;
    session.totalUsage.completion_tokens += result.usage.completion_tokens || 0;
  }

  return {
    skipped: false,
    before,
    after: session.messages.length,
    summarized: toSummarize.length,
    kept: tail.length,
    summarizerUsage: result.usage
  };
}
