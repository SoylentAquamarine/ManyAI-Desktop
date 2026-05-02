# System Overview — ManyAI Desktop

## Purpose

ManyAI Desktop is an Electron-based desktop application providing a unified, multi-tab AI chat interface that routes user requests to multiple free and paid AI providers based on task type, provider health, and user configuration. It extends the ManyAI mobile concept with a richer workflow system, integrated tools (IRC, terminal, RSS, programming environment), smart routing with health-aware scoring, and a per-workflow provider chain configuration.

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Electron |
| UI Framework | React 18 + TypeScript |
| Build system | electron-vite (Vite-based HMR) |
| Packaging | electron-builder |
| Internationalization | i18next (27 locales) |
| Storage | localStorage + JSON config file in userData |

## Application Architecture (3 Layers)

### Layer 1: Main Process (`src/main/`)

Node.js / Electron process. Has full OS access. Responsibilities:

- **Window management**: Creates BrowserWindow with persisted state (`userData/window-state.json`). Saves/restores x, y, width, height, isMaximized. Clamps to minimum 600×500. Corrects off-screen positions by checking nearest display bounds.
- **IPC registration**: `registerAllIpc()` wires all IPC handler modules at startup.
- **Security**: `webSecurity: false` (CORS bypass — acceptable for a desktop app calling user-owned APIs). `autoHideMenuBar: true`.
- **Theme**: `backgroundColor: '#1a1a2e'` prevents white flash before React renders.
- **macOS**: Handles `activate` event to re-create window when dock icon clicked with no windows open.

IPC modules in `src/main/ipc/`:

| Module | Handles |
|---|---|
| `fileIpc.ts` | File system read/write/list operations |
| `imageIpc.ts` | Image fetching via main process (CORS bypass for image APIs) |
| `ircIpc.ts` | IRC client connection, channel join, message send/receive |
| `terminalIpc.ts` | Terminal command execution |
| `index.ts` | `registerAllIpc()` — calls all module register functions |

### Layer 2: Preload (`src/preload/`)

Secure bridge. Uses `contextBridge` — raw `ipcRenderer` is never exposed to the renderer.

Exposes `window.api` with groups:

| API Group | Module | Purpose |
|---|---|---|
| `api.files` | `api/files.ts` | File CRUD operations |
| `api.images` | `api/images.ts` | Image fetching (CORS-safe via main) |
| `api.irc` | `api/irc.ts` | IRC client actions |
| `api.terminal` | `api/terminal.ts` | Terminal commands |
| `api.getConfig()` / `api.setConfig()` | `index.ts` | Durable config file (workingDir etc.) |

TypeScript definitions in `src/preload/index.d.ts`.

### Layer 3: Renderer (`src/renderer/src/`)

React application. No direct Node/Electron access — all system calls go through `window.api`.

Feature modules in `features/`:

| Feature | Description |
|---|---|
| `chat/ChatScreen.tsx` | Main chat interface, multi-provider routing, file attachment |
| `chat/fileHandler.ts` | File drag-drop and attachment logic |
| `editor/SavedScreen.tsx` | Saved responses viewer and editor |
| `irc/IrcScreen.tsx` | IRC client UI |
| `rss/RssScreen.tsx` | RSS feed reader |
| `terminal/TerminalScreen.tsx` | Integrated terminal |
| `programming/ProgrammingScreen.tsx` | Code-focused workspace |
| `settings/SettingsScreen.tsx` | Settings hub (tabs: general / api / workflows / smartrouting / health / backup / about) |
| `settings/ApiScreen.tsx` | API key management |
| `settings/ProvidersScreen.tsx` | Provider enable/disable, model selection |
| `settings/RoutingScreen.tsx` | Per-workflow provider chain configuration |
| `settings/WorkflowsScreen.tsx` | Custom workflow editor |
| `settings/HealthScreen.tsx` | Provider health dashboard |
| `settings/AboutScreen.tsx` | App info and credits |

## Provider Registry

Providers defined in `providers/*.json` (one file per provider):
`anthropic`, `cerebras`, `cloudflare`, `cohere`, `fireworks`, `gemini`, `groq`, `huggingface`, `laptop` (local Ollama), `mistral`, `openai`, `openrouter`, `pollinations`, `sambanova`.

Each provider JSON defines: name, baseUrl, models (each with `id`, `name`, `capabilities[]`). `capabilities` drives workflow routing — a model is only offered for a workflow if its capabilities include all of the workflow's `workflowType` values.

## Workflow System (10 Built-in Types)

Workflows defined in `src/renderer/src/workflows/`:

| Type | Label | Use case |
|---|---|---|
| `coding` | Code | Code generation and explanation |
| `reasoning` | Reasoning | Deep analysis and logic |
| `creative` | Creative | Writing, brainstorming |
| `summarization` | Summarize | Long text compression |
| `translation` | Translate | Language translation |
| `image` | Image | Image generation |
| `irc` | IRC | IRC chat assistance |
| `rss` | RSS | Feed analysis and summarization |
| `terminal` | Terminal | Command-line assistance |
| `programming` | Programming | Code-centric workspace |

Each `WorkflowPlugin`: `type`, `label`, `icon`, `description`, `defaultRoutes: RouteEntry[]`, `workflowType: WorkflowType[]`.

Custom workflows: stored as JSON files, loaded from filesystem, can have custom provider routes.

## Routing System

**Manual routing** (default): Per-workflow `RouteEntry` chain (provider + model + enabled + instanceId). Built-in routes stored in `localStorage`. Custom workflow routes stored in their JSON files. Users configure order and enabled state in Settings → Routing.

**Smart Routing** (opt-in): Replaces the manual chain. Scores providers 0–1:
```
score = successRate(last 20) × 0.7 + speedScore × 0.3 − healthPenalty
```
Three modes:
- `best-first` — try highest-scored provider, fall back serially on failure
- `serial` — try in scored order, stop on first success
- `parallel` — fire all capable providers simultaneously

## Health System

`lib/healthCheck.ts` polls provider endpoints on a configurable interval. Records uptime percentage and average latency per provider. `getPenalty(provider)` returns a 0–1 penalty used by `smartRouter.scoreProvider()` to downweight degraded providers. Health status visible in Settings → Health.

## Persistence

| Storage | Contents |
|---|---|
| `localStorage` | Tabs, active tab, continuous mode, routing prefs, smart routing config+log, provider order, enabled state, selected models, theme, zoom, font |
| `localStorage (encrypted)` | API keys |
| `userData/window-state.json` | Window position and size |
| `userData/config.json` | workingDir and other durable settings |
| `providers/*.json` | Provider+model registry (in repo) |
| Custom workflow JSON files | Custom workflow definitions + routes |

## Internationalization

27 locale files in `src/renderer/src/i18n/locales/`. Includes RTL locales (Arabic, Hebrew). `scripts/gen-translations.py` generates/updates locale files.

## Tab System

- Tabs: `ChatTab[]` with `id`, `label`, `workflowType`. Persisted to `localStorage` (`manyai_chat_tabs`, `manyai_active_tab`).
- Old tabs without `workflowType` are migrated to `'coding'` on load.
- Default first tab: `{ workflowType: 'coding', label: 'Code' }`.
- `workflowBus` pub/sub: non-chat features can inject content into any tab by tab ID or `'active'`.
- `continuousMap`: per-tab flag for agent continuous mode.
- Settings panel slides in as `RightPanel` — not a tab, toggled by `panel` state.
