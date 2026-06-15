import './App.css'

// A single, self-contained page that explains how this demo's Orval SDK works.
// React + Spring Boot · Orval generates the typed API client; this screen just
// documents the flow for anyone opening the running app.

const STEPS = [
  {
    title: 'Spring Boot publishes the contract',
    body: 'The backend exposes an OpenAPI document describing every endpoint, its inputs, and its response shapes. This is the single source of truth.',
  },
  {
    title: 'Run one command',
    body: 'Running "npm run generate-sdk" kicks off the whole pipeline — no manual API code is ever written by hand.',
  },
  {
    title: 'Orval auto-repairs the spec',
    body: 'A transformer cleans common Spring Boot / Keycloak spec defects (e.g. illegal security fields, missing path params) before validation, so generation never breaks.',
  },
  {
    title: 'The typed client is generated',
    body: 'Orval writes one React Query hook per endpoint plus all TypeScript types into the src/sdk/ folder. These files are generated — never edited by hand.',
  },
  {
    title: 'Every call goes through one gateway',
    body: 'A single Axios instance adds the base URL and the auth token to every request, so configuration lives in exactly one place.',
  },
  {
    title: 'Components just call a hook',
    body: 'A screen calls a hook like useGetAllAuditLogs() and gets back data, loading and error states. TanStack Query handles caching, dedup and refetching automatically.',
  },
]

function App() {
  return (
    <main className="page">
      <header className="hero">
        <span className="badge">React + Spring Boot · Demo</span>
        <h1>Orval SDK Demo</h1>
        <p className="tagline">
          A type-safe API client, auto-generated from the backend's OpenAPI spec —
          one command keeps it in sync.
        </p>
      </header>

      <section>
        <h2 className="section-title">How the SDK works — step by step</h2>
        <ol className="steps">
          {STEPS.map((step, i) => (
            <li className="step" key={i}>
              <span className="num">{i + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <footer className="foot">
        <span>Generated client lives in <code>src/sdk/</code></span>
        <span>Full guide: <code>docs/setup/SDK-SETUP.md</code></span>
      </footer>
    </main>
  )
}

export default App
