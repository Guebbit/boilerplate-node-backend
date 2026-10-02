---
source: scenarios/flows/client.ts
sha256: 211877eb7f60df87a003d15686ed9b08785d8c7e5a73e2dcb7cd6f90061c01c8
generated_at: 2026-10-01T12:21:26.239930+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/client.ts

## Purpose

Thin HTTP client that scenario flows use to drive the application over a live server during container bootstrap. It wraps `fetch` with bearer-token auth, unwraps the API's `{ data, errors }` envelope once, and distinguishes "expected to succeed" calls (`call`) from "expected to possibly fail" calls (`attempt`). It exists so that every flow in `scenarios/flows/` shares one auth path, one error shape, and one `fetch` call site.

## Key elements

- **`Attempt`** (exported interface) — Parsed response: `status`, `data`, `errorCode` (first `errors[].code`), `errorMessages` (all `errors[].message`).
- **`ScenarioFlowError`** (exported class) — Extends `Error`; message names the actor, method, path, status, error code, and the full error messages. Thrown by `Caller.call` on any non-2xx.
- **`Caller`** (exported interface) — A signed-in actor. `call<T>()` resolves to `data` or throws; `attempt()` always resolves to an `Attempt`. Both accept `method`, `path`, and optional JSON `body`.
- **`signIn(baseUrl, email, password)`** (exported) — POSTs to `/account/login`, extracts the token, and returns a `Caller` bound to that token.
- **`send`** (module-private) — The single `fetch` call site. Serialises non-FormData bodies as JSON; drops the `content-type` header when the body is `FormData` so `fetch` can set its own multipart boundary.
- **`readAttempt`** (module-private) — Parses a `Response` into an `Attempt`; handles 204 / non-JSON bodies by returning `data: undefined`.
- **`Envelope` / `Method`** (module-private) — The API's response shape and the set of HTTP verbs flows use.

## Relationships

- **scenarios/flows/actions.ts** — The flow runner that imports `Caller`, `Attempt`, and `ScenarioFlowError` to execute and assert individual flow steps.
- **scenarios/flows/shop-history.ts** — A concrete flow that calls `signIn` and then uses the returned `Caller` to exercise shop-history endpoints.
- **scenarios/locales.ts** — Provides locale data that flows (driven through this client) reference when constructing request bodies for locale-sensitive endpoints.
- **scenarios/shop-modules.ts** — Defines the shop module routes/shapes that flows hit through `Caller.call` / `Caller.attempt`.
- **scripts/docs/generate-role-matrix.ts** — Reads the flow/scenario structure to produce the role-by-permission documentation; the `Caller`/`Attempt` contract is what it documents.

## Notes

- **Why not supertest?** The repo has supertest as a devDependency, but this file runs during `npm run db:bootstrap → scenario:apply` where devDeps may be absent. `fetch` is always available at runtime.
- **`call` vs `attempt`** — `call` throws on non-2xx; `attempt` never throws. Flows that *expect* a refusal (e.g. permission-denied checks) must use `attempt` so they can inspect `errorCode` / `errorMessages`.
- **Login is through the real endpoint.** A hand-crafted token is deliberately avoided so the session is fresh enough to satisfy `requireFreshAuth(REAUTH_TIME_CRITICAL)` on checkout and payment routes.
- **FormData bodies** skip JSON stringification and the `content-type` header is stripped from the header map before `fetch` runs, letting the runtime set the correct `multipart/form-data` boundary.
