import { getLanguage } from './config.js';

const messages = {
  en: {
    typeTask: 'Type a task. /help for commands. /exit to quit.',
    resumed: (n) => `[Resumed: ${n} messages]`,
    historyCleared: 'History cleared.',
    activeModel: (slug) => `Active model: ${slug}`,
    modelSet: (slug) => `Model set to: ${slug}`,
    planMode: (on) => `Plan mode: ${on ? 'on' : 'off'}`,
    planModeUsage: 'Usage: /plan [on|off]',
    activeLanguage: (name) => `Language: ${name}`,
    languageSet: (name) => `Language set to: ${name}`,
    languageUsage: 'Usage: /lang [en|es]',
    noUsage: 'No usage yet in this session.',
    unknownCommand: (cmd) => `Unknown command: ${cmd}. Try /help.`,
    approvePlan: 'Approve plan?',
    planLabel: 'Plan',
    chooseLanguage: 'Language / Idioma:\n  [1] English\n  [2] Español',
    chooseLanguagePrompt: 'Choose / Elegí (1 or 2): ',
    invalidChoice: 'Invalid / Inválido. Type 1 or 2.',
    helpText: helpEn
  },

  es: {
    typeTask: 'Escribí una tarea. /help para comandos. /exit para salir.',
    resumed: (n) => `[Reanudada: ${n} mensajes]`,
    historyCleared: 'Historial borrado.',
    activeModel: (slug) => `Modelo activo: ${slug}`,
    modelSet: (slug) => `Modelo cambiado a: ${slug}`,
    planMode: (on) => `Modo plan: ${on ? 'activado' : 'desactivado'}`,
    planModeUsage: 'Uso: /plan [on|off]',
    activeLanguage: (name) => `Idioma: ${name}`,
    languageSet: (name) => `Idioma cambiado a: ${name}`,
    languageUsage: 'Uso: /lang [en|es]',
    noUsage: 'Todavía no hay uso en esta sesión.',
    unknownCommand: (cmd) => `Comando desconocido: ${cmd}. Probá /help.`,
    approvePlan: '¿Aprobar plan?',
    planLabel: 'Plan',
    chooseLanguage: 'Language / Idioma:\n  [1] English\n  [2] Español',
    chooseLanguagePrompt: 'Choose / Elegí (1 or 2): ',
    invalidChoice: 'Invalid / Inválido. Type 1 or 2.',
    helpText: helpEs
  }
};

export function t(key, ...args) {
  const lang = getLanguage();
  const entry = messages[lang]?.[key] ?? messages.en?.[key];
  if (typeof entry === 'function') return entry(...args);
  return entry ?? key;
}

function helpEn({ dim, bold }) {
  return `
${bold('COMMANDS')}
  /help                 show this help
  /exit, /quit          exit the REPL
  /clear                clear conversation history (session stays open)
  /model [slug]         show or change the active model
                        ${dim('e.g.: /model anthropic/claude-sonnet-4.6')}
  /plan [on|off]        plan-before-act: agent proposes a plan and waits for approval
  /lang [en|es]         change UI and model response language (works mid-session)
  /cost                 show tokens used and accumulated cost

${bold('SPECIAL SYNTAX')}
  ${dim('@<file>')}               inject the file's contents into your prompt
                        ${dim('e.g.: > review the bug in @src/auth.js using @package.json')}

${bold('WHAT THE AGENT CAN DO')}
  Reads, searches and modifies code. Runs commands. Applies patches.
  Asks for confirmation before any change (unless you use --yes).

  Internal tools:
    read_file, list_files, search_repo, git_diff   ${dim('(read-only, no prompt)')}
    edit_file, write_file, apply_patch             ${dim('(modify files, ask y/N)')}
    run_command                                    ${dim('(run shell, asks y/N)')}

${bold('EXAMPLES')}
  ${dim('# explore')}
  > describe this repo in 3 lines
  > where is the database configured?
  > what does @src/agent.js do

  ${dim('# modify code')}
  > add a JSDoc comment to the main function in @src/index.js
  > refactor @src/utils.js to use async/await
  > run the tests and fix the ones that fail

  ${dim('# plan mode (recommended for big changes)')}
  > /plan on
  > migrate the auth system to JWT
  ${dim('  the agent reads relevant files, proposes a plan, you approve')}
  ${dim('  only then can it modify files')}

  ${dim('# switch model as needed')}
  > /model anthropic/claude-haiku-4.5    ${dim('# fast and cheap')}
  > /model anthropic/claude-sonnet-4.6   ${dim('# more capable')}

  ${dim('# switch language mid-session')}
  > /lang es
  ${dim('  next turn responds in Spanish; previous history stays unchanged')}

${bold('PERSISTENT CONTEXT')}
  This session is saved in ~/.agentcode/sessions/
  Resume later with: ${dim('agent --continue')}

  If an ${dim('AGENT.md')} file exists in the repo or in ~/.agentcode/,
  it loads automatically as project instructions.
`;
}

function helpEs({ dim, bold }) {
  return `
${bold('COMANDOS')}
  /help                 muestra esta ayuda
  /exit, /quit          salir del REPL
  /clear                borra el historial de la sesión (queda abierta)
  /model [slug]         muestra o cambia el modelo activo
                        ${dim('ej: /model anthropic/claude-sonnet-4.6')}
  /plan [on|off]        plan-before-act: el agente propone un plan y espera aprobación
  /lang [en|es]         cambia idioma de UI y respuestas del modelo (funciona a mitad de sesión)
  /cost                 muestra tokens usados y costo acumulado

${bold('SINTAXIS ESPECIAL')}
  ${dim('@<archivo>')}            inyecta el contenido del archivo en tu prompt
                        ${dim('ej: > revisá el bug en @src/auth.js usando @package.json')}

${bold('QUÉ HACE EL AGENTE')}
  Lee, busca y modifica código. Corre comandos. Aplica patches.
  Pide confirmación antes de cualquier cambio (a menos que uses --yes).

  Tools internas:
    read_file, list_files, search_repo, git_diff   ${dim('(lectura, sin confirmación)')}
    edit_file, write_file, apply_patch             ${dim('(modifican archivos, piden y/N)')}
    run_command                                    ${dim('(corre shell, pide y/N)')}

${bold('EJEMPLOS')}
  ${dim('# explorar')}
  > describe este repo en 3 líneas
  > ¿dónde se configura la base de datos?
  > qué hace @src/agent.js

  ${dim('# modificar código')}
  > agregá un comentario JSDoc a la función main de @src/index.js
  > refactorizá @src/utils.js para usar async/await
  > corré los tests y arreglá los que fallan

  ${dim('# plan mode (recomendado para cambios grandes)')}
  > /plan on
  > migrá el sistema de auth a JWT
  ${dim('  el agente lee archivos relevantes, propone un plan, vos aprobás')}
  ${dim('  recién ahí puede modificar archivos')}

  ${dim('# cambiar modelo según necesidad')}
  > /model anthropic/claude-haiku-4.5    ${dim('# rápido y barato')}
  > /model anthropic/claude-sonnet-4.6   ${dim('# más capacidad')}

  ${dim('# cambiar idioma a mitad de sesión')}
  > /lang en
  ${dim('  el próximo turno responde en inglés; el historial previo queda igual')}

${bold('CONTEXTO PERSISTENTE')}
  Esta sesión se guarda en ~/.agentcode/sessions/
  Reanudá con: ${dim('agent --continue')}

  Si existe un archivo ${dim('AGENT.md')} en el repo o en ~/.agentcode/,
  se carga automáticamente como instrucciones del proyecto.
`;
}
