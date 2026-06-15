# Orval SDK — Complete Setup Guide (React + Axios + TanStack Query)

> **Read this one file.** It walks you through the whole setup from zero — every
> file you create, its exact contents, **why** it exists, the Node version fix,
> all dependencies, and how the SDK works end to end. Follow the steps top to
> bottom and you'll have a fully-typed API client that "just works" on any
> machine that clones the repo.

---

## Table of contents
1. [What this is (the mental model)](#1-what-this-is)
2. [How it works — start to end](#2-how-it-works--start-to-end)
3. [Prerequisites & the Node version issue](#3-prerequisites--the-node-version-issue)
4. [Install the dependencies](#4-install-the-dependencies)
5. [Step-by-step file setup](#5-step-by-step-file-setup)
6. [Generate & use the SDK](#6-generate--use-the-sdk)
7. [Problems we solved](#7-problems-we-solved)
8. [Every scenario, handled](#8-every-scenario-handled)
9. [Command & file reference](#9-command--file-reference)

---

## 1. What this is

We **never hand-write API calls**. The backend describes itself with an
**OpenAPI spec**. A tool called **Orval** reads that spec and **generates** a
typed SDK — one ready React hook per endpoint (e.g. `useGetAllAuditLogs()`).
Every request goes through one **Axios** instance (base URL + auth token), and
**TanStack Query** handles loading, errors, caching and refetching in your
components.

**One sentence:** *Orval (build time) writes the hooks → Axios sends the
requests → TanStack Query (run time) manages the results.*

### Why this is the best approach for React
- **Zero API code** — every endpoint is already a hook.
- **Can't drift** — types come from the spec, so a backend change becomes a
  compile error, not a runtime crash.
- **State for free** — loading / error / caching / refetch built in.
- **One control point** — auth + base URL live in a single file.

---

## 2. How it works — start to end

```
BUILD TIME  (run: npm run generate-sdk)
  OpenAPI spec ─► orval-transformer.cjs ─► Orval ─► src/sdk/  (hooks + types)

RUN TIME  (in the browser)
  Component ─► useGetX() ─► TanStack Query ─► customAxios (Axios) ─► Backend API
      ▲                                                                  │
      └──────────── typed · cached · deduped response ◄──────────────────┘
```

- **Build time:** Orval fetches the spec, the transformer repairs any defects,
  Orval validates and writes typed files into `src/sdk/`.
- **Run time:** a component calls a hook → TanStack Query checks its cache → on a
  miss it calls Axios (which attaches the token) → the response is unwrapped,
  cached, and returned as `{ data, isLoading, error }`.

---

## 3. Prerequisites & the Node version issue

### The problem
The toolchain needs a **modern Node**:

| Tool | Minimum Node |
|------|--------------|
| Vite 8 | `^20.19.0 \|\| >=22.12.0` |
| **Orval 8** | **`>=22.18.0`** ← strictest |

So the floor is **Node 22.18.0+**. On older Node, install and generation fail
with confusing errors. We don't want each teammate to *remember* this — the repo
should **declare, pin, and enforce** it automatically. We do that with 4 files.

### Step 3a — Pin the version for version managers

**Create `.nvmrc`** (used by `nvm` and `fnm`):
```
22
```

**Create `.node-version`** (used by `fnm` and `asdf`):
```
22
```
**Why:** anyone with a version manager runs `nvm use` (or `fnm use`) and is
instantly on the correct Node. We pin the **22 LTS** line — it satisfies every
tool, and newer Node (e.g. 24) still passes the check below.

### Step 3b — Declare & enforce it in `package.json`

Add an `engines` block and a `preinstall` script (full file shown in Step 5):
```jsonc
"scripts": {
  "preinstall": "node scripts/check-node.cjs",
  ...
},
"engines": {
  "node": ">=22.18.0",
  "npm": ">=10"
}
```
**Why:**
- `engines` → npm warns on the wrong version; documents the requirement.
- `preinstall` → runs our guard on **every `npm install`, before any dependency
  downloads**, and blocks old Node with a friendly message.

### Step 3c — Create the guard script

**Create `scripts/check-node.cjs`:**
```js
/*
 * Node version guard. Runs on `npm install` (via "preinstall") BEFORE deps
 * download. Stops the install with a clear message if Node is too old, instead
 * of a cryptic crash later inside Vite/Orval.
 * Plain ES5 on purpose, so it runs even on very old Node.
 */
var REQUIRED_MAJOR = 22;
var REQUIRED_MINOR = 18; // 22.18.0 — strictest dep (Orval 8)

var current = process.versions.node;
var parts = current.split('.');
var major = parseInt(parts[0], 10);
var minor = parseInt(parts[1], 10);

var ok = major > REQUIRED_MAJOR || (major === REQUIRED_MAJOR && minor >= REQUIRED_MINOR);

if (!ok) {
  var ESC = String.fromCharCode(27);
  console.error('');
  console.error(ESC + '[31m  X  Your Node version (' + current + ') is too old for this project.' + ESC + '[0m');
  console.error('     Required: Node >= ' + REQUIRED_MAJOR + '.' + REQUIRED_MINOR + '.0  (Vite 8 + Orval 8).');
  console.error('');
  console.error(ESC + '[33m  How to fix (recommended - using nvm):' + ESC + '[0m');
  console.error('     nvm install      # installs the version pinned in .nvmrc');
  console.error('     nvm use');
  console.error('     npm install');
  console.error('');
  console.error('  No nvm? Download the latest LTS from https://nodejs.org, then re-run `npm install`.');
  console.error('');
  process.exit(1);
}
```
**Result:** good Node → passes silently; old Node → install stops with guidance.

---

## 4. Install the dependencies

```bash
# Runtime — shipped to the browser
npm install axios @tanstack/react-query

# Dev only — the generator
npm install -D orval
```

| Package | Type | Why |
|---------|------|-----|
| `orval` | dev | The CLI that generates the SDK. Never shipped. |
| `axios` | runtime | HTTP client every generated call uses. |
| `@tanstack/react-query` | runtime | Caching + loading/error state for the hooks. |

> **First error people hit:** `Cannot find module '@tanstack/react-query'`. The
> generated SDK imports it, so it must be installed even though you didn't write
> the import.

---

## 5. Step-by-step file setup

Create these files in order. Each says **what**, **why**, and the **exact contents**.

### Step 5.1 — `src/api/axios-instance.ts` (the mutator)
**Why:** Centralises base URL + auth token, and gives Orval the function it
routes every request through. It must return the response **body** (`T`), so we
unwrap `.data`.
```ts
import axios, { type AxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// One shared axios instance: base URL + auth header in one place.
export const axiosInstance = axios.create({ baseURL: API_URL });

// Attach the bearer token to every request automatically.
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Orval calls this as customAxios<T>({ url, method, ... }).
// Return the BODY (T), not the full response → unwrap .data.
export const customAxios = <T>(config: AxiosRequestConfig): Promise<T> =>
  axiosInstance(config).then(({ data }) => data);
```
> ⚠️ **Pitfall:** don't export the raw `axios.create(...)` instance as the
> mutator — it compiles but causes `Headers` vs `AxiosHeaders` type errors. Keep
> it a **function** that unwraps `.data`.

### Step 5.2 — `.env` (the API base URL)
**Why:** Vite exposes `VITE_*` variables to `import.meta.env`, which the mutator
reads for its `baseURL`.
```bash
VITE_API_URL=https://your-api-host
```

### Step 5.3 — `orval.config.ts` (how to generate)
**Why:** The single control panel — which spec, which client style, which HTTP
layer, where output goes, and which mutator to use.
```ts
import { defineConfig } from 'orval';

export default defineConfig({
  eamata: {
    input: {
      target: 'https://your-api-host/api-docs',  // the OpenAPI spec
      override: { transformer: './orval-transformer.cjs' },
    },
    output: {
      target: './src/sdk',        // where generated files land
      client: 'react-query',      // generate React Query hooks
      httpClient: 'axios',        // ★ axios-style code — MUST match the mutator
      mode: 'tags-split',         // one folder per controller
      override: {
        mutator: {
          path: './src/api/axios-instance.ts',
          name: 'customAxios',    // the exported function from Step 5.1
        },
      },
    },
  },
});
```
| Key | Why |
|-----|-----|
| `client: 'react-query'` | Emit hooks, not bare functions. |
| `httpClient: 'axios'` | **Critical** — matches the axios mutator. Omitting it defaults to `fetch` and breaks types. |
| `mode: 'tags-split'` | One folder per API controller. |
| `override.mutator` | Route every request through `customAxios`. |

### Step 5.4 — `orval-transformer.cjs` (spec sanitizer, optional)
**Why:** Some backends (Spring/Keycloak) emit specs that are valid in spirit but
technically invalid. This runs **before** validation and repairs only the illegal
bits — it never invents endpoints. Delete it once the backend emits a clean spec.
```js
// Two repairs we needed:
// 1) strip illegal properties off security schemes (Keycloak/OAuth2)
// 2) inject path params the URL requires but the spec forgot
//    e.g. "/address/{eventId}/update" → add { name:'eventId', in:'path', required:true }

const HTTP_METHODS = ['get','put','post','delete','options','head','patch','trace'];

function ensurePathParameters(paths, warn) {
  for (const [route, item] of Object.entries(paths)) {
    if (!item || typeof item !== 'object') continue;
    const templated = [...route.matchAll(/{([^}]+)}/g)].map((m) => m[1]);
    if (!templated.length) continue;
    for (const method of HTTP_METHODS) {
      const op = item[method];
      if (!op) continue;
      const params = Array.isArray(op.parameters) ? op.parameters : (op.parameters = []);
      const have = new Set(params.filter((p) => p && p.in === 'path').map((p) => p.name));
      for (const name of templated) {
        if (have.has(name)) continue;
        params.push({ name, in: 'path', required: true, schema: { type: 'string' } });
        warn(`path "${route}" (${method}): injected missing path parameter "${name}"`);
      }
    }
  }
}

module.exports = (inputSchema) => {
  const warnings = [];
  const warn = (m) => warnings.push(m);
  // …sanitize security schemes here…
  if (inputSchema && inputSchema.paths) ensurePathParameters(inputSchema.paths, warn);
  if (warnings.length) console.warn('[orval-transformer] sanitized:\n  • ' + warnings.join('\n  • '));
  return inputSchema;
};
```
> **Mental model:** the transformer is **reactive** — when a new backend fails
> validation, read the `🛑` message and add one targeted repair. It can't
> pre-empt every possible defect.

### Step 5.5 — `src/main.tsx` (provide the cache)
**Why:** Every hook reads from a shared `QueryClient`. The provider makes it
available app-wide; without it hooks throw *"No QueryClient set."* Create it
**outside** `render()` so it stays a single stable instance.
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App.tsx';

const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

### Step 5.6 — `package.json` (scripts + engines)
**Why:** Wires the generate command, and the Node guard from Step 3.
```jsonc
{
  "scripts": {
    "preinstall": "node scripts/check-node.cjs",
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview",
    "generate-sdk": "orval"
  },
  "engines": {
    "node": ">=22.18.0",
    "npm": ">=10"
  }
}
```

---

## 6. Generate & use the SDK

### Generate
```bash
npm run generate-sdk
```
Writes typed files into `src/sdk/`. **Never edit generated files** — re-run this
whenever the backend changes.

A generated call looks like this (axios-style — proof `httpClient` matched):
```ts
return customAxios<PagedModelAuditLog>(
  { url: `/api/.../audit`, method: 'GET', params, signal },
);
```

### Use a hook in a component
```tsx
import { useGetAllAuditLogs } from '../sdk/audit-admin-controller/audit-admin-controller';

export function AuditLogs() {
  const { data, isLoading, error } = useGetAllAuditLogs();
  if (isLoading) return <p>Loading…</p>;
  if (error)     return <p>Something went wrong</p>;
  return <pre>{JSON.stringify(data, null, 2)}</pre>;
}
```
**The payoff:** no manual `fetch` / `useState` / `useEffect` — loading, error,
caching, dedup and typing all come for free, and `data` is typed from the spec.

### Verify
```bash
npx tsc -b      # should report 0 errors
npm run dev     # start the app
```

---

## 7. Problems we solved

| # | Problem | Cause | Fix |
|---|---------|-------|-----|
| 1 | `Cannot find module '@tanstack/react-query'` | Package not installed | `npm install @tanstack/react-query` + add the provider (Step 5.5) |
| 2 | `Type 'Headers' is not assignable to type 'AxiosHeaders'` (dozens) | Orval generated `fetch`-style code while the mutator was axios | Add `httpClient: 'axios'`; make the mutator return `.data`; re-generate |
| 3 | `securityScheme … illegal property` | Keycloak OAuth2 defect | Transformer strips illegal properties |
| 4 | `Declared path parameter "eventId" needs to be defined…` | URL has `{eventId}` but it's not declared | Transformer injects the missing path parameter |
| 5 | "Works on my machine" / wrong Node | No version pinned or enforced | `.nvmrc` + `.node-version` + `engines` + `preinstall` guard |

---

## 8. Every scenario, handled

| Scenario | What you do | What happens |
|----------|-------------|--------------|
| Fresh clone | `nvm use` → `npm install` | Guard checks Node, deps install, `src/sdk/` already committed. |
| Wrong Node version | `npm install` | Guard **stops** install with a fix message. |
| First run | `npm run dev` | App boots; hooks work (provider wired). |
| Backend adds/changes an endpoint | `npm run generate-sdk` | New/updated hooks; `tsc` flags any breaking change. |
| Switching backend / env | change `VITE_API_URL` (+ `input.target`) → re-generate | New base URL at runtime; SDK regenerated. |
| Spec fails validation | read the `🛑` message | Add one repair to the transformer, re-generate. |
| Auth token changes | nothing | Interceptor reads `localStorage.token` per request. |
| Same data in many components | just call the hook | TanStack Query dedupes + caches; one network call. |

---

## 9. Command & file reference

### Commands
| Command | Purpose |
|---------|---------|
| `nvm use` | Switch to the pinned Node (`.nvmrc`) |
| `npm install` | Install deps (Node guard runs first) |
| `npm run generate-sdk` | (Re)generate the SDK from the spec |
| `npm run dev` | Start the app |
| `npx tsc -b` | Type-check — should be 0 errors |

### Files you create
| File | Role |
|------|------|
| `.nvmrc` | Pin Node 22 for nvm / fnm |
| `.node-version` | Pin Node 22 for fnm / asdf |
| `scripts/check-node.cjs` | Node version guard (blocks old Node) |
| `package.json` (`engines` + `preinstall`) | Declare + hook the guard |
| `src/api/axios-instance.ts` | Axios instance + `customAxios` mutator |
| `.env` | `VITE_API_URL` base URL |
| `orval.config.ts` | How the SDK is generated |
| `orval-transformer.cjs` | Repairs spec defects (optional) |
| `src/main.tsx` | Provides the `QueryClient` |
| `src/sdk/**` | **Generated** hooks + types — never edit |

### Golden rules
1. **Never edit `src/sdk/**`** — re-run `generate-sdk` instead.
2. **`httpClient` must match the mutator** (axios ↔ axios).
3. **Spec broken?** Add a repair to the transformer, don't patch generated code.
4. **The OpenAPI spec is the single source of truth.**
5. **Pin your Node** — `nvm use` before installing.
