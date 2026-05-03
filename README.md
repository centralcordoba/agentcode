# agentcode

Un agente de coding por consola, mínimo y hackeable. Le pedís en lenguaje
natural lo que querés y lee, busca, modifica código y corre comandos en tu
repo local — siempre pidiendo confirmación antes de cualquier cambio.

```
$ agent "agregá tests al modulo de auth y corré la suite"
[MODEL: anthropic/claude-haiku-4.5]
[TASK: agregá tests al modulo de auth y corré la suite]

✻ Voy a leer auth.js para entender la estructura
→ step 1: read_file(path=src/auth.js)
✻ Genero tests/auth.test.js
→ step 2: write_file(path=tests/auth.test.js, ...)
Apply write to tests/auth.test.js? [y/N]: y
→ step 3: run_command(cmd=npm test)
Run command: npm test? [y/N]: y

✔ Tests creados y pasando (3/3 verde).
[3 steps · 4.812 in / 482 out tokens · $0.0021]
```

---

## Qué hace

- **Loop autónomo** estilo "plan → actuá → observá": vos escribís una tarea,
  el modelo decide qué herramienta usar, ejecuta, ve el resultado, decide la
  siguiente, hasta terminar.
- **Siete tools** sobre el filesystem y el shell: leer/listar/buscar/editar
  archivos, ver `git diff`, aplicar patches, correr comandos.
- **Confirmación humana** antes de cualquier cosa con efectos secundarios.
  Las lecturas pasan directo; las escrituras te muestran un diff y piden y/N.
- **REPL persistente** (`agent` sin args) con historial guardado en
  `~/.agentcode/sessions/`. Volvés con `agent --continue`.
- **`@mentions`**: referenciá archivos en línea (`@src/auth.js`) y el agente
  los inyecta automáticamente al contexto.
- **`AGENT.md`** opcional en el repo o en `~/.agentcode/` con instrucciones
  específicas del proyecto/usuario, cargadas en el system prompt.
- **Plan mode**: para cambios grandes, el agente primero propone un plan,
  vos aprobás, recién entonces puede modificar archivos.
- **Costo en tiempo real**: cada tarea termina con tokens consumidos y costo
  en USD según el modelo activo de OpenRouter.
- **Bilingüe**: la primera vez te pregunta inglés o español. Tanto la
  interfaz como las respuestas del modelo se ajustan al idioma elegido.

---

## Quick start

Requisitos: Node.js ≥ 18, una cuenta en [OpenRouter](https://openrouter.ai/)
con crédito (basta con USD 5 para empezar).

```bash
git clone <este-repo> agentcode
cd agentcode
npm install
npm link                              # expone `agent` global

cp .env.example .env                  # editá y pegá tu key
# .env:
#   MODEL=anthropic/claude-haiku-4.5
#   OPENROUTER_API_KEY=sk-or-v1-...

agent                                 # primera vez te pregunta el idioma
```

Listo. Ahora andá a cualquier repo tuyo:

```bash
cd C:\algun\proyecto
agent "describí este repo en 3 líneas"
```

---

## Modos de uso

### One-shot

```bash
agent "tu tarea acá"
agent --plan "refactor grande"        # propone plan, espera aprobación
agent --yes "tarea sin confirmar"     # auto-aprueba todo (CI, scripts)
agent --continue "y ahora seguí con X" # retoma la última sesión del repo
```

### REPL interactivo

```bash
agent
```

```
[MODEL: anthropic/claude-haiku-4.5]
[CWD:   C:\repositories\tradingApp]
Escribí una tarea. /help para comandos. /exit para salir.

> describí este repo
...

> ahora agregale tests al modulo de auth
...

> /cost
12.304 in / 1.520 out tokens · $0.0182

> /exit
```

### Slash commands del REPL

| Comando | Qué hace |
|---|---|
| `/help` | Ayuda completa con ejemplos |
| `/exit`, `/quit` | Salir |
| `/clear` | Borrar el historial (la sesión queda abierta) |
| `/model [slug]` | Ver/cambiar modelo: `/model anthropic/claude-sonnet-4.6` |
| `/plan [on\|off]` | Activar/desactivar plan-before-act |
| `/lang [en\|es]` | Cambiar idioma de interfaz y respuestas |
| `/cost` | Ver tokens y costo acumulado |

### Sintaxis especial

**`@archivo`** — inyectá contenido directo:

```
> revisá el bug en @src/auth.js usando @package.json como referencia
```

El agente lee ambos archivos y los pone en el contexto antes de responder.
Ahorra varios pasos del loop. Si el path no existe (ej. `user@gmail.com`),
queda como texto literal. Si intenta escapar del repo, se bloquea.

**`AGENT.md`** — instrucciones persistentes:

```markdown
# Convenciones del proyecto
- Usá TypeScript estricto
- Tests con vitest, nunca jest
- Las llamadas a Binance van en src/exchanges/binance.ts
- NO inventes precios ni pares; preguntá si no estás seguro
```

Si existe en la raíz del repo, se carga al system prompt cada turno.
También respeta `~/.agentcode/AGENT.md` para defaults globales.

---

## Stack técnico

```
Node.js (ESM, ≥18)
   ├── undici          streaming HTTP, sin timeouts para LLMs lentos
   ├── dotenv          configuración por archivo
   └── node:readline   REPL interactivo (singleton compartido)

Provider:  OpenRouter (cualquier modelo de su catálogo)
Persistencia:  archivos JSON en ~/.agentcode/
```

Cero dependencias UI, cero bundlers, cero TypeScript. Todo el código
del agente cabe en **menos de 1.000 líneas** repartidas en 10 archivos
pequeños.

### Por qué OpenRouter y no provider directo

- Un solo API key te da acceso a Anthropic, OpenAI, Google, Meta, DeepSeek, etc.
- Cambiás de modelo con `/model` sin tocar credenciales.
- Tracking de costo unificado (precio se consulta a `/api/v1/models`).
- Trade-off: latencia un poquito mayor que ir directo, pero a cambio
  abstrae el provider y permite probar modelos en segundos.

---

## Arquitectura

### El loop

```
runTurn(session, userInput)
   │
   ├─ expandMentions(input)            ← inyecta archivos @mencionados
   ├─ buildSystemPrompt(...)           ← prompt base + AGENT.md + plan mode + idioma
   │
   └─ for step in 1..MAX_STEPS:
         ├─ callModel(messages, onThought)    ← stream SSE de OpenRouter
         ├─ parse JSON (1 objeto por turno)
         │
         ├─ {plan} en plan mode → confirmación → continue
         ├─ {final} → fin del turno
         ├─ {tool, args}
         │     ├─ gate write tools si plan mode sin aprobar
         │     ├─ tools[name](args)    ← ejecutá; pide confirmación si write
         │     └─ append result al historial
         │
         └─ next step
```

### Las tools

Las siete tools comparten un **sandbox de paths**: cualquier path que
venga de un argumento del modelo se resuelve contra el CWD y se rechaza
si escapa la raíz del repo.

| Tool | Tipo | Confirmación |
|---|---|---|
| `read_file` | lectura | no |
| `list_files` | lectura | no |
| `search_repo` | lectura | no |
| `git_diff` | lectura | no |
| `edit_file` | escritura | sí (muestra diff) |
| `write_file` | escritura | sí (muestra diff) |
| `apply_patch` | escritura | sí (muestra patch) |
| `run_command` | shell | sí (muestra cmd) |

`run_command` además bloquea patrones destructivos hardcodeados
(`rm -rf`, `format`, `shutdown`, etc.) antes de pedir confirmación.

### Sesiones en disco

```
~/.agentcode/
├── config.json                     ← idioma elegido y otras prefs
├── AGENT.md                        ← instrucciones globales del usuario (opcional)
└── sessions/
    ├── tradingApp-3f2a8b1c.json    ← una por (basename + sha1[0:8] del CWD)
    ├── miOtroRepo-9d4e7c2a.json
    └── ...
```

Cada sesión guarda los mensajes, totales de tokens, modelo activo y flag
de plan mode. Se persiste **después de cada turno completo** (cuando llega
`final` o se topa con `MAX_STEPS = 25`).

### Streaming del razonamiento

Mientras el modelo genera su respuesta JSON, un regex extrae el campo
`"thought"` de la cadena parcial y lo va imprimiendo en gris tenue:

```
✻ Voy a listar archivos primero, después leo el package.json
→ step 1: list_files(path=.)
```

Convierte el "estoy esperando 30 segundos" en feedback útil.

---

## Comparado con otras opciones

Hay varios agentes de coding por consola buenos. Cada uno optimiza cosas
distintas:

| | **agentcode** | **Claude Code** | **opencode** |
|---|---|---|---|
| **Código** | abierto, ~1k LOC | cerrado | abierto, mucho más grande |
| **Provider** | OpenRouter | Anthropic directo | multi-provider (Vercel AI SDK) |
| **Modelos** | cualquiera de OpenRouter | familia Claude | varios providers |
| **Interfaz** | REPL plano | terminal UI pulida | TUI (textual UI library) |
| **Extensibilidad** | edit a un .js | MCP servers, hooks, subagents | MCP, plugins, hooks |
| **IDE integration** | no | sí (VS Code, JetBrains) | LSP para diagnostics |
| **Memoria** | AGENT.md | CLAUDE.md + memory tool | AGENTS.md / similar |
| **Plan mode** | sí (gate hard) | sí | sí |
| **Sesiones** | JSON local | sí | sí |
| **Curva** | leés el código en una tarde | listo para usar | listo para usar |

**¿Cuándo este agente?** Cuando querés **entender y poseer** la herramienta
end-to-end. El loop entero entra en una pantalla. Querés agregar una tool
nueva, cambiar el formato del prompt, integrar tu propio provider — todo
es una edición de archivo. Sin marketplace, sin abstracciones que se
interpongan.

**¿Cuándo Claude Code?** Cuando querés productividad inmediata sin armar
nada. MCP servers, hooks, subagents y la integración con IDE están listos
y son sólidos. Es lo que usaría para trabajo serio en cliente.

**¿Cuándo opencode?** Cuando querés algo open-source más capaz que este
agente, con TUI bonita y soporte multi-provider sin tener que codearlo.
Es el punto medio entre la simplicidad de agentcode y la sofisticación
de Claude Code.

Pensá en agentcode como en el agente que vos hubieras hecho un fin de
semana para entender cómo funcionan estos sistemas — y que después
podés modificar exactamente como quieras.

---

## Limitaciones conocidas

- **Sin MCP, sin subagentes, sin hooks.** Si necesitás integrar con
  Slack, Linear o Postgres desde el agente, este no es el camino corto.
- **Costo por modelo no se trackea cross-switch.** Si cambiás `/model`
  a mitad de sesión, los tokens viejos se calculan con el precio del
  modelo nuevo (sobrestima/subestima según dirección del cambio).
- **Sin compresión de contexto.** Después de muchos turnos, el historial
  crece y los tokens también. Usá `/clear` cuando se vaya de mano.
- **No hay tests automáticos.** Cada feature se valida manualmente con
  un `node -e` smoke test. Suficiente para un MVP, no para producción.
- **Sólo OpenRouter.** Hubo soporte para Ollama (local), se removió por
  ser muy lento en CPU para el loop iterativo. Para modelos locales,
  recomiendo [opencode](https://github.com/sst/opencode) u otra herramienta
  optimizada para eso.

---

## Roadmap (no implementado todavía)

Funcionalidades que tienen sentido y todavía no están:

- **Compresión de contexto** (`/compact`): resumir turnos viejos para
  bajar tokens en sesiones largas.
- **Subagentes**: delegar sub-tareas en paralelo, cada uno con su propio
  scratch space.
- **`glob` y `grep` separados** con filtros (tipo de archivo, regex), en
  vez del `search_repo` único actual.
- **MCP server support**: para conectar con servicios externos.
- **Pricing por modelo trackeado correctamente** después de un `/model`.
- **Recovery de turno crasheado**: hoy un crash mid-turn pierde el turno
  entero (el resto de la sesión queda intacta).

---

## Estructura del repo

```
bin/agent.js          ← entrypoint del CLI; parsea flags, ruta a one-shot/REPL
src/agent.js          ← runTurn: el loop plan→actuá→observá
src/model.js          ← OpenRouter streaming + pricing/cost
src/tools.js          ← las 7 tools, sandbox de paths, lista destructiva
src/confirm.js        ← preview de diff + prompt y/N
src/context.js        ← buildSystemPrompt, expandMentions, AGENT.md, write-tool gate
src/session.js        ← create/load/save de sesiones JSON
src/repl.js           ← loop interactivo + slash commands
src/io.js             ← readline singleton compartido por REPL y confirm()
src/config.js         ← config global del usuario; idioma activo
src/i18n.js           ← strings y textos largos en EN/ES
src/prompt.js         ← system prompt base
.env.example          ← MODEL + OPENROUTER_API_KEY
```

---

## Licencia

MIT (o lo que quieras — es tu código).
