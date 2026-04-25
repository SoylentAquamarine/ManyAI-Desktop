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

### 2026-04-25

**Image Generation — fully dynamic provider support**
- DALL·E 3 and DALL·E 2 are now visible and manageable in the API screen under the OpenAI provider
- Pollinations image models (Flux, Flux Realism, Flux Anime, Flux 3D, Turbo, GPT Image) are now visible in the API screen under the Pollinations provider
- Added `supportsImageGen` flag to the `ProviderModel` interface — any model can be marked as an image generation model
- Added "Image gen" checkbox per model row in the Add/Edit Provider form — mark any model on any provider as image-capable without code changes
- The Image workflow routing screen now dynamically shows only providers and models flagged for image generation, instead of a hardcoded list
- Generic OpenAI-compatible `/images/generations` handler added — new providers that support image gen via standard API will work automatically
- Removed all hardcoded `IMAGE_PROVIDER_CONFIGS` references from `ChatScreen`, `RoutingScreen`, and `RightPanel`
- `isImage` flag now propagates from workflow plugin registry through `WorkflowDef`, so image workflow detection is no longer hardcoded on the string `'image'`

**Workflow system**
- Fixed transparent background on the Add/Edit Workflow modal (CSS variable `--bg1` was undefined; corrected to `--surface`)
- Fixed same transparent background bug in the New Tab workflow picker modal
- `isImage` flag now included in built-in workflow definitions so the routing UI correctly identifies image workflows without string matching

**Tab titles**
- Tab labels now stay as the workflow name (e.g., "General", "Coding") and no longer get overwritten with the first message text

**Providers**
- Add/Edit Provider form now supports per-model "Image gen" checkbox
- Custom providers added via the UI can now include image-generation models that automatically appear in the image workflow's routing options
