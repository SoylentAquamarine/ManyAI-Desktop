\# ManyAI Desktop — AI Development Rules



This file defines the architecture, boundaries, and rules for AI-assisted development in this project.



\---



\# 🧠 Architecture Overview



The project is a modular Electron + React + TypeScript desktop application.



\## Layers



\### 1. Main Process (Node/Electron)



Path:



```

src/main/

```



Responsibility:



\* Window creation

\* IPC handling

\* Filesystem access

\* Native OS operations



Rules:



\* NO UI logic

\* NO React code

\* NO business logic outside IPC modules



IPC must be modular:



```

src/main/ipc/\*

```



\---



\### 2. Preload Layer (Secure Bridge)



Path:



```

src/preload/

```



Responsibility:



\* Expose safe API to renderer

\* Wrap ipcRenderer.invoke/on

\* Define window.api



Rules:



\* NEVER expose full ipcRenderer

\* ONLY expose explicit APIs

\* Keep API surface minimal and typed



Structure:



```

src/preload/api/\*

```



\---



\### 3. Renderer (React UI)



Path:



```

src/renderer/src/

```



Responsibility:



\* UI rendering

\* Feature logic (non-native)

\* State management (local or React-based)



Rules:



\* NO direct Node/Electron access

\* ALL system calls go through window.api

\* Features must be isolated



Feature structure:



```

features/

&#x20; chat/

&#x20; editor/

&#x20; settings/

&#x20; files/

```



\---



\# 📦 Feature Rules



Each feature must:



\* Own its UI

\* Own its local logic

\* Use window.api for external operations

\* NOT import other features directly



Shared code only in:



```

components/

lib/

utils/

```



\---



\# ⚙️ IPC Rules



\* All IPC must live in:



```

src/main/ipc/

```



\* Each module must export:



```

registerXxxIpc()

```



\* main/index.ts only:



&#x20; \* creates window

&#x20; \* registers IPC modules

&#x20; \* handles app lifecycle



\---



\# 🔌 Preload API Rules



\* Preload must expose:



```

window.api

```



\* API must be grouped:



```

api.files

api.images

api.settings

```



\* No raw IPC exposure allowed.



\---



\# 🚫 Forbidden Patterns



Do NOT:



\* Refactor multiple layers in one task

\* Modify renderer + main in same change

\* Add new architecture without instruction

\* Introduce global state systems without request

\* Over-abstract small logic

\* Move code across features without reason



\---



\# 🧩 AI Working Rules



When modifying code:



1\. Work on ONE module only

2\. Keep changes minimal

3\. Do NOT redesign architecture

4\. Preserve existing behavior

5\. If change affects multiple layers → STOP and ask



\---



\# 🪶 Token Efficiency Rules



To reduce token usage:



\* Prefer small, isolated changes

\* Do NOT re-explain architecture unless asked

\* Only load relevant files per task

\* Avoid full-project refactors



\---



\# 🧭 Current Known Modules



\## Renderer Features



\* chat → messaging + file attachment logic

\* editor → saved content / editing workflows

\* settings → API/provider/workflow config

\* files → file utilities (future expansion)



\## IPC Modules



\* fileIpc → file operations

\* imageIpc → image fetching



\## Preload APIs



\* filesApi

\* imagesApi



\---



\# 📌 Golden Rule



> If a change is not strictly required for the current task, do not make it.



