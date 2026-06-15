# API SDK Setup Guide (Orval + Axios + TanStack Query)

> **Goal of this doc:** A complete, beginner-friendly walkthrough of how this
> project talks to the backend API. If you follow these steps top to bottom,
> you can set the whole thing up from scratch — even if you've never used Orval
> before. Every step says **what to do** and **why**.

---

## 1. The big picture (read this first)

We do **not** write API calls by hand. Instead:

1. The backend publishes an **OpenAPI spec** (a JSON file describing every
   endpoint, its parameters, and its response shape).
2. **Orval** reads that spec and **auto-generates** a typed SDK — one React
   Query hook per endpoint (e.g. `useGetAllAuditLogs()`).
3. Every generated call goes through **one Axios instance** (for base URL +
   auth token).
4. **TanStack Query (React Query)** runs those calls in your components and
   handles loading, errors, caching, and refetching for you.

### How the pieces fit together

```
                         ┌──────────────────────────────┐
                         │   Backend OpenAPI spec (JSON) │
                         │  dev-api.zcloud.technology/... │
                         └───────────────┬────────────────┘
                                         │  npm run generate-sdk
                                         ▼
        orval.config.ts  ──────►  ┌─────────────┐
        orval-transformer.cjs ──► │    ORVAL     │  (code generator, runs at build time)
                                  └──────┬───────┘
                                         │ writes typed files
                                         ▼
                                  ┌─────────────────────────┐
                                  │   src/sdk/**             │
                                  │   • React Query hooks    │
                                  │   • TypeScript types     │
                                  └──────┬──────────────────┘
                                         │ every call uses
                                         ▼
                                  ┌─────────────────────────┐
                                  │ src/api/axios-instance.ts│  ← baseURL + auth token
                                  │   customAxios mutator    │
                                  └──────┬──────────────────┘
                                         │ HTTP request (axios)
                                         ▼
                                   Backend API

   ── At runtime, in the browser: ──────────────────────────────

   main.tsx  ──►  <QueryClientProvider>   (gives the app a cache)
                       │
                       ▼
                 Your component  ──►  useGetAllAuditLogs()  ──► customAxios ──► API
                       ▲                                                         │
                       └───────────  data / isLoading / error  ◄────────────────┘
                                     (cached & managed by React Query)
```

**One-line summary:** *Orval (build time) writes the hooks → Axios sends the
requests → React Query (run time) manages the results.*

---

## 2. Prerequisites

- Node.js 18+ and npm installed.
- You can reach the backend spec URL (see `orval.config.ts`).

---

## 3. Install dependencies

```bash
# Runtime: sends HTTP requests + manages server state in the UI
npm install axios @tanstack/react-query

# Dev only: the code generator
npm install -D orval
```

**Why each one:**

| Package | When it runs | Why we need it |
|---------|--------------|----------------|
| `orval` | Build time (a CLI) | Generates the SDK from the spec. Dev-only — not shipped to users. |
| `axios` | Run time | The HTTP client every generated call uses. |
| `@tanstack/react-query` | Run time | Caching, loading/error state, refetching for the generated hooks. |

---

## 4. Create the Axios instance (the "mutator")

**File:** `src/api/axios-instance.ts`

```ts
import axios, { type AxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL;

// One shared axios instance: base URL + auth header in a single place.
export const axiosInstance = axios.create({
  baseURL: API_URL,
});

// Attach the bearer token to every request automatically.
axiosInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Orval calls this for every request as customAxios<T>({ url, method, ... }).
// It must return the response BODY (T), so we unwrap `.data` here.
export const customAxios = <T>(config: AxiosRequestConfig): Promise<T> => {
  return axiosInstance(config).then(({ data }) => data);
};
```

**Why this shape matters (important):**

- Orval calls the mutator with a **config object** (`{ url, method, params, signal }`)
  and expects back a `Promise<T>` where `T` is the response body.
- That's why `customAxios` is a **function** that returns `axiosInstance(config).then(({ data }) => data)` —
  it unwraps `.data` so your hooks are typed as the actual payload, not the raw
  `AxiosResponse`.
- ⚠️ A common mistake is exporting the axios *instance* directly
  (`export const customAxios = axios.create(...)`). That compiles but produces
  **type mismatches** once Orval generates axios-style calls — keep it a function.
- `VITE_API_URL` comes from a `.env` file (see step 8).

---

## 5. Configure Orval

**File:** `orval.config.ts`

```ts
import { defineConfig } from 'orval';

export default defineConfig({
  eamata: {
    input: {
      target: 'https://dev-api.zcloud.technology/api/master/api-docs',
      override: {
        // Cleans up small spec defects before generation (see step 6).
        transformer: './orval-transformer.cjs',
      },
    },
    output: {
      target: './src/sdk',        // where generated files go
      client: 'react-query',      // generate React Query hooks
      httpClient: 'axios',        // ★ use axios under the hood (matches our mutator)
      mode: 'tags-split',         // one folder per API tag/controller
      override: {
        mutator: {
          path: './src/api/axios-instance.ts',
          name: 'customAxios',    // the exported function from step 4
        },
      },
    },
  },
});
```

**Why each key:**

| Key | Why |
|-----|-----|
| `input.target` | The OpenAPI spec URL Orval reads. |
| `client: 'react-query'` | Generates `useQuery`/`useMutation` hooks (not plain functions). |
| `httpClient: 'axios'` | **The fix for the type errors.** Tells Orval to generate axios-style code (`AxiosRequestConfig`) so it matches our axios mutator. Without it, Orval defaults to `fetch`-style code, which clashes with the axios instance. |
| `mode: 'tags-split'` | Splits output into one folder per controller — easier to navigate. |
| `override.mutator` | Routes every request through our `customAxios` (base URL + token). |

> **Why `httpClient` must match the mutator:** the generated code and the
> mutator have to speak the same "language." Axios uses `AxiosRequestConfig` and
> `AxiosHeaders`; fetch uses `RequestInit` and `Headers`. Mixing them is exactly
> what caused the `Type 'Headers' is not assignable to type 'AxiosHeaders'`
> errors. `httpClient: 'axios'` + an axios mutator = matching types.

---

## 6. (Optional) The spec transformer

**File:** `orval-transformer.cjs`

Some backends (Spring/Keycloak) emit a spec that is *semantically fine but
technically invalid* (e.g. illegal properties on security schemes). Orval would
reject it. This transformer runs once **before** validation and strips/repairs
only the illegal bits — it never invents endpoints. You can delete it once the
backend emits a spec that validates on its own.

---

## 7. Generate the SDK

```bash
npm run generate-sdk
```

(That script is just `orval` — see `package.json`.)

This writes typed files into `src/sdk/`. **Never edit generated files by hand** —
they carry a `Do not edit manually` header and get overwritten on the next run.
Re-run this command whenever the backend API changes.

**Verify it worked** — a generated call should look like this (axios-style):

```ts
return customAxios<PagedModelAuditLog>(
  { url: `/api/master/admin/audit`, method: 'GET', params, signal },
);
```

---

## 8. Set the API base URL

Create a `.env` file at the project root:

```bash
VITE_API_URL=https://dev-api.zcloud.technology
```

**Why:** Vite exposes variables prefixed with `VITE_` to the browser via
`import.meta.env`. Our axios instance reads `VITE_API_URL` for its `baseURL`.
Keep `.env` out of git if it holds secrets.

---

## 9. Provide the QueryClient (run-time wiring)

**File:** `src/main.tsx`

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

// One client for the whole app: holds the cache + default behaviour.
// Created OUTSIDE render so it isn't re-created on every re-render.
const queryClient = new QueryClient()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

**Why:** Every React Query hook reads from a shared cache owned by a
`QueryClient`. `QueryClientProvider` makes that client available to the entire
component tree. Without it, any hook throws *"No QueryClient set."* Creating the
client outside `render()` keeps a single stable instance (re-creating it would
wipe the cache).

---

## 10. Use a hook in a component

```tsx
import { useGetAllAuditLogs } from './sdk/audit-admin-controller/audit-admin-controller'

function AuditLogs() {
  const { data, isLoading, error } = useGetAllAuditLogs()

  if (isLoading) return <p>Loading…</p>
  if (error) return <p>Something went wrong</p>

  return <pre>{JSON.stringify(data, null, 2)}</pre>
}
```

**Why this is the payoff:** no manual `fetch`, `useState`, or `useEffect`.
Loading state, error state, caching, deduplication, and refetching are all
handled for you — and `data` is fully typed from the OpenAPI spec.

---

## 11. (Optional) React Query Devtools

A visual panel to inspect the cache during development.

```bash
npm install -D @tanstack/react-query-devtools
```

```tsx
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'

<QueryClientProvider client={queryClient}>
  <App />
  <ReactQueryDevtools initialIsOpen={false} />
</QueryClientProvider>
```

Dev-only (hence `-D`); excluded from production builds.

---

## 12. Verify the whole setup

```bash
npx tsc -b      # should report zero type errors
npm run dev     # start the app
```

---

## Quick reference

| File | Role |
|------|------|
| `orval.config.ts` | How the SDK is generated (input spec, client, httpClient, mutator). |
| `orval-transformer.cjs` | Sanitizes the spec before generation. |
| `src/api/axios-instance.ts` | The axios instance + `customAxios` mutator (base URL + token). |
| `src/sdk/**` | **Generated** hooks + types. Do not edit. |
| `src/main.tsx` | Provides the `QueryClient` to the app. |
| `.env` | `VITE_API_URL` — the API base URL. |

## Common gotchas

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Cannot find module '@tanstack/react-query'` | Package not installed | `npm install @tanstack/react-query` |
| `Type 'Headers' is not assignable to type 'AxiosHeaders'` | `httpClient` mismatched the axios mutator | Add `httpClient: 'axios'` to the Orval output config, regenerate |
| `No QueryClient set` at runtime | Missing provider | Wrap `<App />` in `<QueryClientProvider>` (step 9) |
| VS Code still shows old import error | TS server cached old state | `Ctrl/Cmd+Shift+P` → *TypeScript: Restart TS Server* |
| `import.meta` warnings during generation | esbuild loading the mutator | Harmless — generation still succeeds |
