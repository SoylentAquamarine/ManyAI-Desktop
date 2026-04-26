# manyai-desktop

An Electron application with React and TypeScript

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## Changelog

### 2026-04-25 — Capability system, workflow overhaul, configurable model params

**Capability-based model filtering**
- Replaced `supportsImageGen` boolean with `capabilities?: WorkflowType[]` array on `ProviderModel`
- `WorkflowType` = `'chat' | 'image' | 'vision' | 'audio' | 'video' | 'agent'` defined in `workflowTypes.ts`
- Workflow routing now filters models using `every()` — a model must support ALL types a workflow requires
- Fixed bug where providers with no capabilities (e.g. Cohere, HuggingFace) appeared in the Image workflow — missing capabilities now default to `['chat']` instead of passing all filters
- All built-in provider models pre-filled with correct capabilities (chat, vision, image as appropriate)
- Capabilities can be set per-model directly from the API screen (Capabilities expand panel) without editing code

**Workflow system overhaul**
- Removed General workflow entirely — routing fallback changed to 'coding'
- Removed automatic task-type detection (`detectTaskType`, `autoDetect`) — workflow is fixed per tab
- Workflow type is now multi-select (`WorkflowType[]`); a workflow can require multiple capability types simultaneously
- Workflows screen: checkbox grid for workflow type selection (replaces single dropdown)
- All workflows (including formerly locked ones) support Edit and Delete
- Tab labels stay as the workflow name; no longer overwritten by first message

**Settings restructure**
- Settings screen gains sub-navigation: General | API | Workflows | Workflow Models | Backup Config
- "Workflow Models" tab (formerly a separate Routing button) shows per-workflow provider/model priority chains
- Backup Config tab: downloads text-only JSON of all settings; saved images download separately as individual files named after the chat title
- Routing button removed from right panel and App-level nav

**Provider / model config**
- `maxTokens` per model — replaces hardcoded `1024` in both Anthropic and OpenAI-compatible call paths
- `imageSize` per model — replaces hardcoded `1024x1024` (and `768x768` for Pollinations) in image generation calls
- Both fields editable in the Capabilities panel per model row and in the Add/Edit Provider form
- Delete button added next to Test button on each model row (requires confirm click; disabled if only one model)

**Routing chains**
- MAX_CHAIN increased from 4 to 255 — effectively unlimited fallback providers per workflow

**GitHub Pages**
- Verified and launched: [soylentaquamarine.github.io/ManyAI-Desktop](https://soylentaquamarine.github.io/ManyAI-Desktop/)

---

### 2026-04-24 — Architecture refactor + custom providers + full workflow editor

**Main process modularization**
- IPC handlers extracted from `main/index.ts` into separate modules: `fileIpc.ts`, `imageIpc.ts`, `ipc/index.ts`
- `main/index.ts` now only handles window creation, IPC registration, and app lifecycle
- Preload API split into `preload/api/files.ts` and `preload/api/images.ts`

**Feature-based directory structure**
- Renderer screens reorganized into `features/chat/`, `features/editor/`, `features/settings/`
- Shared utilities remain in `lib/`, `components/`
- `fileHandler.ts` extracted from ChatScreen

**Custom provider management**
- Add any OpenAI-compatible API provider from the UI — no code changes required
- Edit built-in providers (changes saved locally, override defaults)
- Delete providers (built-ins are hidden; can be re-added with same Provider ID)
- Provider form: name, ID, base URL, color picker, model list with default selector, API key hint, instructions URL, vision support flag, paid/free flag
- Help modal explaining how to add OpenAI-compatible providers

**Full workflow editor**
- Add custom workflows with: label, icon, description, system prompt (silently prepended to every message), attached context files, auto-detect keyword regex
- Edit built-in workflows (overrides stored locally)
- Delete workflows (built-ins hidden; removable from registry)
- Context file attachment: pick one or more files; content injected silently into every message in that workflow
- Workflow enable/disable toggles; "General" workflow always on as final fallback

**Right panel routing controls**
- Per-workflow provider chain visible and editable directly in the right panel
- Provider enable/disable checkboxes per chain entry
- Inline model selector per chain entry

**Other improvements**
- `providerPrefs.ts`: per-model enable/disable stored separately from routing prefs
- `keyStore.ts`: API keys stored and retrieved per provider key
- `workflows.ts`: custom workflows and removed built-ins persisted to localStorage; `loadWorkflows()`, `saveWorkflows()`, `enabledWorkflows()`, `getWorkflow()` helpers
- Workflow plugin registry (`src/workflows/`) as the single source of truth — adding a workflow file + registry entry is all that's required

---

### 2026-04-22 — Initial build (19 commits)

**Initial MVP**
- Electron + Vite + React + TypeScript desktop app
- Chat, Saved, and Settings screens
- All 13 AI providers from ManyAI mobile (Cerebras, Groq, Gemini, Mistral, SambaNova, OpenRouter, Cloudflare, HuggingFace, Cohere, Fireworks, OpenAI, Anthropic, Pollinations)
- LocalStorage persistence for keys and preferences
- Auto-routing logic ported from mobile codebase

**Security**
- Fixed CSP to allow outbound HTTPS for API calls
- Disabled Electron `webSecurity` to resolve CORS errors on Cloudflare API

**API / Providers / Settings tabs + right panel**
- API tab: all models per provider, per-model enable/disable/test, collapsible cards
- Providers tab: reorder providers up/down, set default model, enable/disable per provider
- Settings tab: clear data / reset keys / about
- Right panel: workflow shortcut buttons (summarize, fix code, brainstorm, etc.) inject prompts into chat
- App shell redesigned as main content + persistent right panel layout

**Task routing**
- `routing.ts`: `detectTaskType()` keyword heuristics, `resolveProvider()` with fallback logic
- Routing screen: per-task-type provider + model selectors, auto-detect toggle, reset-to-defaults button, "no key" warning badge
- Chat task type pill bar: auto-detects task type as you type, click to manually override
- Default routes: code → Mistral Large, reasoning → SambaNova, summarize/translate → Gemini Flash, creative → Mistral, general → Cerebras

**Routing fallback chains**
- Each task type now has an ordered chain of providers — tries top-to-bottom, skips any without a key
- Default chains: coding (Mistral → OpenAI → Claude), reasoning (SambaNova → Claude → OpenAI), summarize (Gemini → Cohere → Groq), etc.
- Routing screen updated with 1st/2nd/3rd chain UI, "Add fallback" button, remove button, "no key" badge
- Migrates old single-entry stored prefs to array format automatically

**Image generation**
- Pollinations image endpoint (free, no API key required) and OpenAI DALL-E 3
- Image task type added with auto-detection keywords
- Image bubble rendered in chat with Download button
- Default image route: Pollinations (free, no key needed)
- Fixed image display: convert to data URI (base64) so `<img>` renders and download works cross-origin
- Fixed Pollinations HTTP 500: Electron's Chromium sends browser cookies/headers that Pollinations interprets as an authenticated session — routed all Pollinations fetches through the Electron main process via IPC using plain Node.js `https` (no browser headers)
- Fixed Pollinations: removed `Referer` header and `nologo=true` param (both require account)
- Explicitly set `model=flux` on Pollinations requests

**Multi-tab chat**
- Multiple independent chat sessions as tabs at the top
- Tab auto-titles from the first message (truncated to 24 chars)
- `+` to add a new tab, `×` to close (minimum 1 tab)
- Tabs and messages persisted to localStorage and restored on app open
- Command buffer: up/down arrow navigates sent message history per tab (100 max, deduplicated), persisted across sessions

**Saved panel**
- Save AI responses for later review
- Image responses saved with prompt as title; thumbnail shown in card list, full image in detail view with Download button
- "Save to File…" button on text responses opens a native Save dialog with a smart suggested filename (detects language from fenced code block, e.g. `sort_algorithm.py`)
- Extracted code saved clean (no markdown prose)

**File attachment**
- 📎 button in chat input opens a native file picker
- First message after attaching prepends the full file content to the AI prompt (shown as a badge, not the raw content)
- Subsequent messages send just the user text — file content stays in history for context
- "↺ Re-inject" resets the flag so the next send re-includes the current file content (useful after editing the file)
- "✕" detaches the file without clearing the conversation
- Auto-save to `.tmp`: when AI responds with a code block while a file is attached, extracted code is silently written to `scriptname.py.tmp`
- "💾 Update Working Copy" button for manual save control

**Workflow-per-tab**
- Each tab now has a workflow type (General, Coding, Reasoning, Creative, Summarization, Translation, Image)
- `+` opens a workflow picker modal — grid of enabled workflow types with icon, name, description
- Tab bar shows workflow icon alongside label
- ChatScreen uses the tab's workflow type for routing — no more auto-detect or manual type pills
- WorkflowsScreen: enable/disable workflow types; "Routing →" button to jump to provider routing config

**Bug fixes**
- Cerebras: fixed model ID `llama3.3-70b` → `llama-3.3-70b` (404 error)
- Cerebras: updated retired `llama-3.3-70b` → `gpt-oss-120b`
- HuggingFace: replaced `Mistral-7B-Instruct-v0.3` (not a chat model) with `HuggingFaceH4/zephyr-7b-beta`
- API cards: removed `overflow:hidden` so expanded model list no longer clips
