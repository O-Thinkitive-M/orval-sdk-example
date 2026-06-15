# SDK Generation — How It Works

Generated with **Orval v8** from the backend's live OpenAPI spec. One command:

```bash
npm run generate-sdk   # → orval (reads orval.config.ts)
```

---

## 1. End-to-end flow

```
                    npm run generate-sdk
                            │
                            ▼
              ┌───────────────────────────┐
              │  orval.config.ts           │   input.target = API /api-docs URL
              │  (the only thing you edit) │   output.target = ./src/sdk
              └───────────────────────────┘
                            │  fetch spec over HTTP
                            ▼
              ┌───────────────────────────┐
              │  1. FETCH + DEREFERENCE    │   resolve every $ref into one doc
              └───────────────────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │  2. TRANSFORM              │   ◄── orval-transformer.cjs
              │  (sanitize the spec)       │      strips illegal fields so the
              └───────────────────────────┘      spec becomes valid
                            │
                            ▼
              ┌───────────────────────────┐
              │  3. VALIDATE               │   if still invalid → 🛑 stop here
              └───────────────────────────┘      (this is the step that failed before)
                            │ valid
                            ▼
              ┌───────────────────────────┐
              │  4. GENERATE (file split)  │   one file per tag + one schemas file
              └───────────────────────────┘
                            │
                            ▼
              ┌───────────────────────────┐
              │  5. WRITE to ./src/sdk     │   + wire customAxios mutator
              └───────────────────────────┘
                            │
                            ▼
                     🎉  SDK ready
```

> **Key fact:** TRANSFORM (step 2) runs **before** VALIDATE (step 3).
> That is why `orval-transformer.cjs` can fix an invalid spec — it repairs the
> document in memory before the validator ever sees it.

---

## 2. What gets generated, file by file

Config uses `mode: 'tags-split'`, so output is organized by OpenAPI **tag**
(each Spring `@RestController` is one tag):

```
src/sdk/
├── zcloudEMRAPIDocumentation.schemas.ts   ← ALL TypeScript types/models (one shared file)
│
├── clinic-controller/
│   └── clinic-controller.ts                ← React-Query hooks + fetchers for that tag
├── patient-auth-controller/
│   └── patient-auth-controller.ts
├── user-controller/
│   └── user-controller.ts
└── …one folder per tag…
```

For **each tag file** Orval emits, per endpoint:
- a typed fetcher function (calls `customAxios` from `src/api/axios-instance.ts`)
- a React-Query hook — `useQuery` for GET, `useMutation` for POST/PUT/PATCH/DELETE
- response/param types imported from the shared `*.schemas.ts`

The **single `*.schemas.ts`** file holds every `components/schemas` object as a
TypeScript `interface`/`type`, plus per-operation param and response types.

Mapping:

| OpenAPI concept            | Generated artifact                                  |
|----------------------------|-----------------------------------------------------|
| `tag`                      | a folder + `<tag>.ts` file                          |
| `path` + HTTP method       | one fetcher fn + one `useQuery`/`useMutation` hook  |
| `components.schemas.X`     | `X` type in `*.schemas.ts`                           |
| operation parameters       | `<OpName>Params` type                               |
| every request              | routed through `customAxios` (auth, baseURL, etc.)  |

---

## 3. How we get "100% generation when a correct URL is passed"

A *correct* URL returns a *semantically* complete spec, but back-ends (Spring +
Keycloak here) often emit specs that are **technically invalid** and trip the
validator. We close that gap with a layered strategy:

### Layer 1 — Reach the spec (network/URL)
- URL must return the raw OpenAPI JSON (`…/v3/api-docs` or `…/api-docs`), not the Swagger UI HTML page.
- Must be reachable from your machine (VPN / auth / CORS-free server-to-server fetch — Orval fetches from Node, so browser CORS does not apply).

### Layer 2 — Sanitize known defects (`orval-transformer.cjs`)
The transformer runs before validation and repairs the recurring defect classes:

| Edge case in the spec                                            | How it's handled                                              |
|------------------------------------------------------------------|---------------------------------------------------------------|
| `oauth2` scheme with illegal `in` / `scheme` (**the Keycloak bug**) | strip every property not allowed for that scheme `type`       |
| `apiKey` scheme carrying `scheme`/`flows`                        | same per-type whitelist removes them                          |
| `http` scheme carrying `in`/`flows`                              | same                                                          |
| security scheme with unknown/missing `type`                     | the scheme is dropped (Orval couldn't use it anyway)          |

The whitelist (`SECURITY_SCHEME_ALLOWED`) is the single place to extend if a new
defect class appears — add the offending field's owner type and it's covered.

### Layer 3 — Last-resort escape hatch (only if a defect we don't sanitize remains)
If a brand-new invalid construct slips through, Orval supports skipping
validation entirely. Add to `input` in `orval.config.ts`:

```ts
input: {
  target: '…/api-docs',
  unsafeDisableValidation: true,   // generate even if validation fails
  override: { transformer: './orval-transformer.cjs' },
}
```

Use this only as a stopgap — prefer fixing the backend or extending Layer 2,
because generation off an invalid spec isn't guaranteed correct.

### Honest guarantee
- **Valid spec + reachable URL → 100% generation.** Always.
- **Invalid-but-fixable spec (the common case) → 100%,** because Layer 2 makes it valid first.
- **Arbitrarily broken spec → not guaranteed by any tool** — but Layer 3 forces output, and Layer 2 is the right place to make the fix permanent.

The real root-cause fix always lives in the backend: emit a spec that validates
on its own, then this transformer can be deleted.
