# Architecture — ManyAI Desktop

## Directory Structure

```
src/
├── main/
│   ├── index.ts                   # Electron entry: window creation, IPC registration, lifecycle
│   └── ipc/
│       ├── index.ts               # registerAllIpc() — wires all modules
│       ├── fileIpc.ts             # registerFileIpc()
│       ├── imageIpc.ts            # registerImageIpc()
│       ├── ircIpc.ts              # registerIrcIpc()
│       └── terminalIpc.ts         # registerTerminalIpc()
│
├── preload/
│   ├── index.ts                   # contextBridge — exposes window.api
│   ├── index.d.ts                 # TypeScript type declarations for window.api
│   └── api/
│       ├── files.ts               # api.files implementation
│       ├── images.ts              # api.images implementation
│       ├── irc.ts                 # api.irc implementation
│       └── terminal.ts            # api.terminal implementation
│
└── renderer/src/
    ├── main.tsx                   # React app entry point
    ├── App.tsx                    # Root component: tab system, panel state, startup
    │
    ├── features/
    │   ├── chat/
    │   │   ├── ChatScreen.tsx     # Multi-provider chat UI
    │   │   └── fileHandler.ts     # File drag-drop + attachment
    │   ├── editor/
    │   │   └── SavedScreen.tsx    # Saved responses management
    │   ├── irc/IrcScreen.tsx
    │   ├── rss/RssScreen.tsx
    │   ├── terminal/TerminalScreen.tsx
    │   ├── programming/ProgrammingScreen.tsx
    │   └── settings/
    │       ├── SettingsScreen.tsx # Hub with tabs: general/api/workflows/smartrouting/health/backup/about
    │       ├── ApiScreen.tsx
    │       ├── ProvidersScreen.tsx
    │       ├── RoutingScreen.tsx
    │       ├── WorkflowsScreen.tsx
    │       ├── HealthScreen.tsx
    │       └── AboutScreen.tsx
    │
    ├── components/
    │   ├── RightPanel.tsx         # Settings slide-in panel
    │   ├── WorkflowPickerModal.tsx
    │   └── Versions.tsx
    │
    ├── lib/
    │   ├── providers.ts           # Provider registry loader (reads providers/*.json)
    │   ├── routing.ts             # TASK_META, DEFAULT_ROUTES, resolveProvider(), resolveAllProviders()
    │   ├── smartRouter.ts         # Score-based provider selection (best-first/serial/parallel)
    │   ├── healthCheck.ts         # Provider health polling and penalty scoring
    │   ├── keyStore.ts            # API key storage (encrypted in localStorage)
    │   ├── providerPrefs.ts       # Provider enabled/order/model preferences
    │   ├── agentLoop.ts           # Multi-step agent execution
    │   ├── workflowBus.ts         # Pub/sub bus for cross-tab content injection
    │   ├── workflows.ts           # load/save/upsert custom workflows (JSON files)
    │   ├── workingDir.ts          # Working directory management
    │   ├── callProvider.ts        # API adapter (text + image providers)
    │   ├── callImageProvider.ts   # Image generation adapter
    │   ├── modelTester.ts         # Provider model connection testing
    │   ├── logger.ts              # Structured logging
    │   ├── crypto.ts              # Key encryption/decryption
    │   ├── ircStore.ts            # IRC state persistence
    │   ├── remoteConfig.ts        # Remote provider/model config fetch
    │   ├── theme.ts               # loadTheme() / applyTheme()
    │   ├── zoom.ts                # loadZoom() / applyZoom()
    │   ├── font.ts                # loadFont() / applyFont()
    │   └── workflowTypes.ts       # WorkflowType type definitions
    │
    ├── workflows/
    │   ├── index.ts               # WORKFLOW_REGISTRY — single source of truth
    │   ├── types.ts               # WorkflowPlugin + RouteEntry interfaces
    │   ├── coding.ts
    │   ├── reasoning.ts
    │   ├── creative.ts
    │   ├── summarization.ts
    │   ├── translation.ts
    │   ├── image.ts
    │   ├── irc.ts
    │   ├── rss.ts
    │   ├── terminal.ts
    │   ├── programming.ts
    │   └── laptop.ts
    │
    ├── i18n/
    │   ├── config.ts              # i18next initialization
    │   └── locales/               # 27 locale JSON files (en-US, fr-FR, ar-SA, zh-CN, etc.)
    │
    └── styles/globals.css

providers/                         # Provider definitions (one JSON per provider)
│   anthropic.json, cerebras.json, cloudflare.json, cohere.json,
│   fireworks.json, gemini.json, groq.json, huggingface.json,
│   laptop.json, mistral.json, openai.json, openrouter.json,
│   pollinations.json, sambanova.json

scripts/gen-translations.py        # Locale file generation helper
build/                             # Electron-builder assets (icons, entitlements)
```

---

## Main Process (`src/main/index.ts`)

### Window State Persistence
Window state stored at `app.getPath('userData')/window-state.json`. Shape: `{ x?, y?, width, height, isMaximized }`. On load:
1. Read JSON, merge with `DEFAULT_STATE` (`1000×720, not maximized`).
2. Clamp width/height to minimums.
3. If stored position is outside any display bounds, drop x/y (let OS place window).
4. If `isMaximized`, call `win.maximize()` before `ready-to-show`.

State saved on `'close'` event via `win.getNormalBounds()` (always returns restored bounds, even when maximized).

### IPC Registration
```typescript
registerAllIpc()  // called once at app startup
  → registerFileIpc()
  → registerImageIpc()
  → registerIrcIpc()
  → registerTerminalIpc()
```

Each module uses `ipcMain.handle('channel-name', async (event, ...args) => ...)`.

---

## Preload Layer (`src/preload/`)

`contextBridge.exposeInMainWorld('api', { ... })` — everything on `window.api` is explicitly typed.

The bridge wraps `ipcRenderer.invoke()` calls. The renderer never sees `ipcRenderer` directly.

`api.getConfig()` and `api.setConfig()` read/write a durable JSON config file in `userData`. Used to persist `workingDir` across origin changes (e.g., dev vs. prod URLs).

---

## Renderer Startup (`App.tsx`)

On mount:
1. `applyTheme(loadTheme())`, `applyZoom(loadZoom())`, `applyFont(loadFont())` — immediate visual setup.
2. `window.api.getConfig()` — read durable config. If `workingDir` found and not in localStorage, sync it. If no `workingDir`: show `noWorkDirModal`.
3. `initProviders()` — load provider registry from `providers/*.json`.
4. `initWorkflows()` — load built-in + custom workflows; triggers `setWorkflowVersion` to re-render workflow-dependent UI.
5. Health check: runs once on startup if continuous monitoring enabled; schedules recurring checks at configured interval (re-reads config each tick).

---

## Workflow Plugin System

### `WorkflowPlugin` Interface (`workflows/types.ts`)
```typescript
interface WorkflowPlugin {
  type: string           // unique identifier (e.g., 'coding')
  label: string          // display name
  icon: string           // emoji or icon name
  description: string    // shown in workflow picker
  defaultRoutes: RouteEntry[]  // ordered provider chain
  workflowType: WorkflowType[] // capabilities required (e.g., ['chat'], ['image'])
}

interface RouteEntry {
  provider: string
  model: string
  enabled?: boolean
  instanceId?: string  // stable GUID — survives check/uncheck, resets on delete+re-add
}
```

### Adding a New Workflow
1. Create `src/renderer/src/workflows/myworkflow.ts` exporting a `WorkflowPlugin`.
2. Import it in `workflows/index.ts` and add to `WORKFLOW_REGISTRY`.
3. No other files need changing.

Custom workflows can be added at runtime via Settings → Workflows; stored as JSON files on disk.

---

## Routing Layer (`lib/routing.ts`)

**`TASK_META`**: Derived from `WORKFLOW_REGISTRY` — maps type → `{ label, icon, description }`. Used by the UI to render tab labels.

**`DEFAULT_ROUTES`**: Derived from `WORKFLOW_REGISTRY` — maps type → `defaultRoutes`.

**`resolveProvider(taskType, prefs, availableKeys, enabledProviders)`**:
1. Get `workflowTypes` array from the matching `WorkflowPlugin`.
2. Walk the configured route chain for `taskType`.
3. For each `RouteEntry`: check if provider is usable (has key or is keyless, not disabled) AND the model's `capabilities` includes all `workflowTypes`.
4. Return first matching entry, or fall back to any keyless provider with capable model.
5. Return `null` if nothing found.

**`resolveAllProviders`**: Same logic but returns all matching entries (used for parallel mode).

---

## Smart Router (`lib/smartRouter.ts`)

Activates when a workflow has `smartRouting: true`.

### Scoring
```
score(workflowType, provider) =
  successRate(last 20 calls) × 0.7
  + speedScore(avgLatencyMs / 30000 capped) × 0.3
  − healthPenalty(from healthCheck)
```
Providers with no history score `0.5` (neutral). Score range: 0–1.

### Modes
- **`best-first`** (default): Pick highest-scored provider; fall back serially on failure.
- **`serial`**: Try in scored order; stop on first success.
- **`parallel`**: Fire all capable providers simultaneously (optional `maxParallel` cap).

### Routing Log
Rolling log of last 300 calls stored in `localStorage`. Each entry: `{ ts, workflowType, provider, model, success, latencyMs, mode }`.

### Config
Stored in `localStorage` (`manyai_smart_routing_config`). Shape: `{ mode, fallbackEnabled, maxParallel }`.

---

## Health Check (`lib/healthCheck.ts`)

Polls all configured providers. Records per-provider:
- Uptime percentage
- Average latency (ms)
- Last check result

`getPenalty(provider)`: Returns 0–1 penalty value based on recent error rate. Used by `smartRouter.scoreProvider()`.

Configurable: interval (minutes), continuousEnabled flag. Config in `localStorage`.

---

## Workflow Bus (`lib/workflowBus.ts`)

Lightweight pub/sub. Non-chat features (IRC, RSS, terminal) can publish a payload targeting a specific tab ID or `'active'`.

In `App.tsx`, a `workflowBus.subscribe()` listener catches these events and calls the target tab's `injectFn` (a ref map `injectFns.current[tabId]`), then switches to that tab.

---

## Cross-Tab State (`App.tsx`)

| State | Type | Purpose |
|---|---|---|
| `tabs` | `ChatTab[]` | Persisted tab list |
| `activeTabId` | `string` | Persisted active tab |
| `panel` | `PanelType\|null` | Settings panel visibility |
| `showPicker` | `boolean` | Workflow picker modal |
| `continuousMap` | `Record<string, boolean>` | Continuous mode per tab |
| `workflowVersion` | `number` | Triggers re-render on workflow changes |
| `settingsTriggerAdd` | `boolean` | Direct-open workflow add from chat |
| `settingsInitialTab` | enum | Which settings tab opens first |
| `noWorkDirModal` | `boolean` | First-run working directory prompt |
