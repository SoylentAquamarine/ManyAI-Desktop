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

### 2026-05-01 — Modular provider/workflow files, working directory enforcement, LAN provider support

**Provider plugin system**
- All provider definitions moved out of hardcoded TypeScript into individual JSON files in `{workingDir}/providers/` — one file per provider
- Providers load at startup via IPC; add, remove, or edit a provider by editing its JSON file — no code changes needed
- `initProviders()` async loader; `upsertProvider()` / `removeProvider()` update memory immediately and write files in background
- 14 built-in provider JSON files included: Cerebras, Groq, Gemini, Mistral, SambaNova, OpenRouter, Cloudflare, HuggingFace, Cohere, Fireworks, OpenAI, Anthropic, Pollinations, Laptop (Ollama)
- `apiFormat` and `imageApiFormat` fields replace all hardcoded provider-key checks in `callProvider.ts` and `callImageProvider.ts`
- `keyOptional: true` — provider is always available (no key required) but shows a key input field (used by Pollinations)
- `getKeylessProviderKeys()` replaces all hardcoded `'pollinations'` references throughout routing, chat, and panel logic

**Custom workflow files**
- Custom (non-builtin) workflows stored as individual JSON files in `{workingDir}/workflows/`
- `initWorkflows()` async loader with automatic localStorage migration on first run
- Builtin workflows (chat, coding, image, IRC, RSS, terminal, etc.) remain in code; only user-created workflows go to files

**Working directory enforcement**
- App now requires a working directory to load providers and workflows
- On startup with no working dir: modal prompts user — **OK** to proceed without (limited), **NEW** to pick a folder
- Picking NEW auto-creates `providers/`, `workflows/`, `images/`, and `backups/` sub-folders and re-initialises all data

**LAN / local provider support (Ollama)**
- New `proxyMode: 'direct' | 'proxied'` field on Provider
- `proxied` routes all API calls through Electron's main process (Node.js fetch, no CORS restrictions) — required for local/LAN providers like Ollama
- `proxy-request` IPC handler added to `fileIpc.ts`
- **Connection Mode** dropdown added to the Add/Edit Provider form
- Laptop (Ollama) provider pre-configured with `proxyMode: proxied`
- Ollama models added: Qwen 2.5 7B (default, best for coding), Llama 3.1, Llama 3.2, Mistral, Phi-3, Nomic Embed Text

**Provider form — full field coverage**
- Add/Edit provider form now exposes every JSON field: API Format, Image API Format, Connection Mode, Sort Order, Key settings (required / optional / paid), Vision support, Key hint, Good at / Not great at, Best for, Instructions URL, Color picker, Extra headers (key-value editor), per-model capabilities / max tokens / image size / random seed

**Health tab + Smart Routing (restored)**
- Provider health monitoring tab with continuous background checks, latency tracking, and success rate history
- Capability testing and model discovery (Test / Discover per model and globally)
- `modelTester.ts` — chat, vision, image, audio testers; `testModel()` / `discoverModel()`
- Health penalties feed into smart router scoring

### 2026-04-27 — IRC user list pane, Terminal tab (SSH/Telnet/SFTP/FTP/FTPS), workflow bus

**IRC client**
- User list moved from the right panel into a resizable side pane inside the IRC tab itself (drag handle between message area and user list; width persists to localStorage)
- Ops (`@`) shown in accent color, sorted first then alphabetical
- Right panel restored to normal workflow config for IRC tabs

**Terminal tab** (`🖥 Terminal`)
- New workflow tab type supporting SSH, Telnet, SFTP, FTP, and FTPS
- SSH / Telnet: full xterm.js terminal emulator (256-color, scrollback, ANSI codes); port auto-fills when switching protocol
- SFTP / FTP / FTPS: file browser UI — directory listing with icons, size, date; double-click to navigate; toolbar buttons for Upload (OS open dialog), Download (OS save dialog), Create Dir, Delete
- **→ Workflow** button in SSH/Telnet toolbar captures last N configurable lines and publishes to `workflowBus`, landing in the active workflow tab
- Connection details (host/port/user/protocol) saved to localStorage; password never persisted

**Workflow bus**
- `workflowBus.ts` singleton — typed pub/sub for cross-tab data routing
- RSS and Terminal tabs both publish `WorkflowPayload` events; App.tsx injects content into the target tab's input via `injectFns`
- `targetTabId: 'active'` special value routes to whichever tab is currently focused

**API provider cards**
- All cards collapsed by default on page load; each can be expanded independently; state resets on navigation

**Branding**
- About screen rebranded to VTX Consulting Group LLC with the VTX logo

**Save to filesystem**
- Saved Items panel removed; replaced with a Save button on individual chat responses that opens a native Save dialog defaulting to the configured working directory

### 2026-04-26 — Interface updates, i18n, and UX polish

- **Settings & Import/Export**
  - Import/Export settings page renamed from Backup/Import
  - Split into 4 sections: **Working Directory**, **API Keys**, **Providers**, **Workflows**
  - Each section has its own **Export** and **Import** button
  - Added **conflict resolution dialog** with **Keep Existing** vs **Override** options
  - Removed monolithic backup modal

- **Dialog & UI Fixes**
  - Fixed dialog overflow by changing `maxHeight` from `vh` to `%` to prevent off-screen scrolling at high zoom levels
  - Sorted appearance themes alphabetically
  - Removed unused **Reset provider order** button from General settings
  - Removed **enable/disable model toggles** from Providers screen
  - Removed **About** section from General settings tab (now its own tab)

- **Image Generation & Handling**
  - Fixed silent image generation failures caused by missing `instanceId` on image messages
  - Improved image filenames: strips filler phrases like *"generate me a picture of"*, appends provider-model slug
  - Fixed auto-save image binary by using `Buffer.from(base64)` instead of writing data URI as text
  - Added scroll position memory when cycling image model tabs

- **Startup & Performance**
  - Fixed startup flash: `backgroundColor` set on `BrowserWindow`, `maximize()` called before `loadURL()`, theme applied via inline script before React mounts

- **Smart Auto-Scroll**
  - Per-tab `pinnedToBottom` tracking — tabs scrolled to bottom auto-scroll on new messages, tabs scrolled up do not

- **Testing**
  - Image-only model tests now call the image generation endpoint instead of chat

- **Internationalization (i18n)**
  - Full i18n support added using **react-i18next** with JSON locale files
  - **LanguagePicker** component in bottom-right above Settings button — shows flag + language name, opens dropdown of all 28 languages
  - Supports **28 languages** (English + 27 others generated by Gemini via *the-brain*)
  - To add a new language: add it to the `LANGUAGES` array and run `scripts/gen-translations.py` — Gemini will translate it in seconds

### 2026-04-26 — UI polish: font selector, new themes, About tab, provider rename, workflow cleanup

**Font face selector**
- New `lib/font.ts` — 13 system fonts (Arial, Calibri, Comic Sans, Consolas, Courier New, Georgia, Impact, Segoe UI, System Default, Tahoma, Times New Roman, Trebuchet MS, Verdana)
- Font picker added to Settings → General; each button renders in its own font for instant preview
- Selection persists in localStorage; applied on startup via `--font` CSS custom property override on `:root`
- Covers all text, inputs, buttons, and textareas without any per-element changes

**New color themes**
- Added Black and White (white bg, black text/borders) and White and Black (black bg, white text) — flat high-contrast pair
- Added non-reversed counterparts for all three LCD schemes: LCD Default (Non-Reversed), LCD Dark (Non-Reversed), LCD Light (Non-Reversed) — light greenish backgrounds with dark text, matching original passive-matrix LCD appearance
- Fixed Black and White theme: `--text-dim` set to `#000000` so all secondary labels render black not grey

**About tab**
- New `AboutScreen.tsx` added as a tab in Settings
- Shows Steve's photo, desktop-specific description text, three donate buttons (PayPal, Cash App, Venmo), GitHub link, and copyright
- Photo sourced from the ManyAI Android project assets

**Providers tab rename**
- Settings tab renamed from "API" to "Providers"
- Internal help text updated to match

**API / Providers screen — auto-save + Test All**
- Removed "Save All" button; replaced with "Test All" (runs every enabled model sequentially with live progress)
- API key inputs auto-save on blur (`onBlur`) with a 2-second "✓ Saved" flash
- Model enable/disable toggles now persist immediately on change
- Edit-provider form save also flushes the current API key from state to storage
- Provider list sorted alphabetically

**Workflow cleanup**
- Removed auto-detect keywords field from the add/edit workflow form
- Removed `keywords` from `WorkflowDef`, `WorkflowPlugin`, `TaskMeta`, `TASK_META`, and all 7 built-in workflow files — no auto-routing logic remained to use them
- Workflow list in the Workflows tab is now sorted alphabetically by label

### 2026-04-26 — Pre-publish hardening: themes, logging, working dir, encrypted backup, import

**Theme system — fully token-based, no hardcoded colours**
- Added `--accent-text` and `--hover-bg` CSS custom properties to every theme block
- `--accent-text` ensures readable contrast on accent-coloured backgrounds for all 4 themes (Midnight/Dark use `#000` on teal; Light uses `#fff` on blue; Hotdog uses `#000` on yellow)
- `--hover-bg` replaces `rgba(255,255,255,0.03)` hardcodes that were invisible on Light theme
- `.btn-primary`, `.message.user .message-bubble`, `.parallel-tab.active`, `.type-pill.active` all now use `var(--accent-text)`
- Toggle slider knob changed from `background: white` to `var(--text)` — visible on all themes
- All font sizes bumped +1px throughout `globals.css` (body 14→15px, buttons 13→14px, labels 11→12px, etc.)

**Working directory**
- New `lib/workingDir.ts` — configurable root folder for all file output
- Set from Settings → General → Browse…; creates `images/` and `backups/` sub-dirs automatically
- All dialogs (save backup, open file) default to working dir when set

**Application log**
- New `lib/logger.ts` — writes timestamped entries to `{workingDir}/manyai.log`
- Every provider call (text + image) is logged with provider, model, prompt length, latency, and error
- Image generation failures are logged at ERROR level
- Logger is always silent if no working dir is configured — never crashes the app

**Encrypted backup**
- New `lib/crypto.ts` — AES-256-GCM via Web Crypto API, keys derived with PBKDF2 (200k iterations)
- Backup export: checkbox to encrypt API keys; requires password + confirm
- Non-key sections always exported as plain JSON
- Encrypted format: `{ apiKeys: { encrypted: "<base64 blob>" }, ... }`

**Selective import**
- New `ImportModal` in `BackupConfig` — pick which sections to restore (API keys, providers, workflows, routing, saved responses)
- Saved responses import is off by default to prevent accidental overwrites
- Encrypted API keys prompt for password inline before applying

**Edit-provider modal**
- Increased `maxWidth` from 520px → 740px and `width` from 95% → 98% so capability checkboxes no longer wrap badly

**Friendly error messages in parallel tabs**
- Error bubbles now use `.message-error` CSS class (red-tinted background + border)
- `friendlyError()` function translates raw strings: AbortError → timeout message, 401 → key hint, 429 → rate limit, 5xx → server error

**IPC / preload hardening**
- `append-file` IPC handler (creates file + parent dirs if missing) — used by logger
- `ensure-dir` IPC handler (mkdir -p)
- `select-directory` IPC handler — OS directory picker
- `open-file` and `save-file` both accept optional `defaultDir` param
- `write-file-direct` now creates parent directories automatically
- All new channels exposed via preload + typed in `index.d.ts`

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

## License

This project is licensed under the **GNU General Public License v3 (GPLv3)**.
You are free to use, modify, and distribute this software under the terms of the GPLv3.
You can find the full license text by looking at the `LICENSE` file in this repository, or at the official source: [Link to your LICENSE file or https://www.gnu.org/licenses/gpl-3.0.en.html]

**Key points of the GPLv3:**
*   You can use this software for any purpose, including commercial use.
*   You can modify the source code.
*   If you distribute modified versions of this software, or software that incorporates this code, you must also make your source code available under the GPLv3. This ensures that the software remains free and open for everyone.

## Support & Donations

Developing and maintaining this software requires time and resources. If you find this program useful, especially for your business or commercial projects, please consider supporting its continued development with a voluntary donation.

A small contribution of **$5** is greatly appreciated and helps us keep improving this project for everyone. You can donate via: [Link to your donation page/PayPal/etc. - e.g., https://www.paypal.me/yourname]

**Donations are entirely voluntary and are not required to use or distribute this software under the terms of the GPLv3.** Your generosity is highly valued and helps us dedicate more time to making this project even better!
