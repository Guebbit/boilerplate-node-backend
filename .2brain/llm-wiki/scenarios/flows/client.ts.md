---
source: scenarios/flows/client.ts
sha256: 06ad54a0aa783404aa54d62e5debfe55c183438c185657a4e568a01b166f1ed7
generated_at: 2026-09-23T17:17:51.343580+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/client.ts

## Purpose

A minimal HTTP client that the scenario-flow runner uses to drive the application over real endpoints during container bootstrap. It exists to keep every flow's request/response handling (base-URL joining, bearer auth, envelope unwrapping, error classification) in one place, and to avoid a supertest dependency because the flows run at a stage where devDependencies may be absent.

## Key elements

- **`Envelope`** (internal) — the two-field shape (`data`, `errors[]`) every API response is expected to carry.
- **`Method`** — union of `GET | POST | PUT | PATCH | DELETE`.
- **`Attempt`** *(exported)* — a parsed HTTP outcome: `status`, `data`, `errorCode` (first `errors[].code`), and `errorMessages` (all `errors[].message`).
- **`ScenarioFlowError`** *(exported)* — the single error type the runner throws when a call expected to succeed does not. Message includes actor, method, path, status, error code, and the error messages (or raw data) for context.
- **`Caller`** *(exported)* — a signed-in actor object exposing `email`, `call` (throws on non-2xx, returns typed `data`), and `attempt` (always resolves to `Attempt`, no throw).
- **`signIn`** *(exported)* — logs in via `POST /account/login`, validates the token, and returns a `Caller` with the bearer header pre-attached.
- **`readAttempt`** (internal) — converts a `Response` into an `Attempt`; handles 204 and non-JSON bodies gracefully.
- **`send`** (internal) — the single `fetch` call site; joins `baseUrl` + `path`, serialises the body, delegates parsing to `readAttempt`.

## Relationships

- **`scenarios/flows/actions.ts`** — imports `signIn`, `Caller`, `ScenarioFlowError`, and `Attempt` to execute individual flow steps (product CRUD, cart, checkout, etc.) and to assert expected failures.
- **`scenarios/flows/shop-history.ts`** — uses `Caller.call` / `Caller.attempt` to exercise the shop-history endpoints within a seeded scenario run.
- **`scripts/docs/generate-role-matrix.ts`** — calls `signIn` for each seeded account and `Caller.attempt` to probe which roles receive 2xx vs. 4xx on protected routes, then records the matrix for `docs/tools/demo-profile.md`.

## Notes

- Deliberately uses global `fetch`, **not** supertest. The file runs during `npm run db:bootstrap → scenario:apply`, a stage where devDependencies are not guaranteed to be installed.
- `signIn` is the *only* way a `Caller` is created; tokens are never hand-issued. This guarantees the session is fresh, which `requireFreshAuth(REAUTH_TIME_CRITICAL)` on checkout/payment routes requires.
- `call` returns `outcome.data as T` — the caller is responsible for typing; there is no runtime shape validation beyond the two-field envelope.
- `Attempt.data` is `undefined` for 204 responses and for any body that is not valid JSON (the `readAttempt` catch path).
- `errorMessages` collects **all** error messages, not just the first, but `errorCode` is always the first code only.
