---
source: scenarios/flows/client.ts
sha256: c99a40cc5e8d868345cef7f0e59b4061b9f8726aeb1925214d5bb5982a2de28a
generated_at: 2026-11-08T02:29:17.582119+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/client.ts

## Purpose

A minimal HTTP client that lets scenario flows drive the application through its real endpoints during container boot (`npm run db:bootstrap` → `scenario:apply`). It wraps a single bearer-token session in a `Caller` object, parses every response into a uniform `Attempt` shape, and throws a descriptive error on unexpected failures. It deliberately uses the runtime's `fetch` instead of supertest because it must work in environments where devDependencies are not installed.

## Key elements

- **`signIn(baseUrl, email, password, totpSecret?)`** — exported. Performs a real `POST /account/login` (and the optional 2FA step), then returns a `Caller` holding the session token.
- **`Caller`** (interface) — a signed-in actor with two methods:
  - `call(method, path, body?)` — sends a request and **throws** `ScenarioFlowError` on any non-2xx.
  - `attempt(method, path, body?)` — sends a request and returns the raw `Attempt` regardless of status (for flows that *expect* a refusal).
- **`Attempt`** (interface) — the parsed response: `status`, `data` (body on 2xx, `undefined` otherwise), `errorCode` (first problem-detail code), `errorMessages` (all problem-detail messages).
- **`ScenarioFlowError`** (class, not exported) — the sole error type; the message names the actor email, method, path, status, error code, and error messages.
- **`send`** (internal) — the single `fetch` call site. Handles JSON vs. `FormData` content-type switching.
- **`readAttempt`** (internal) — parses a `Response` into an `Attempt`; tolerates non-JSON bodies.
- **`answerChallenge`** (internal) — if the login response carries `mfaRequired`, generates a TOTP code via `otplib` and POSTs it to `/account/login/2fa`.
- **`Method`** (type) — `'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'`. `PATCH` is noted as the products module's update shape.
- **`Problem`** (interface) — the subset of RFC 7807 problem-details read from refusal bodies.

## Relationships

- **`scenarios/flows/actions.ts`** — primary consumer; calls `signIn` to obtain a `Caller` and then drives multi-step flow logic through `Caller.call` / `Caller.attempt`.
- **`scenarios/flows/shop-history.ts`** — another flow consumer; uses `signIn` and the `Caller` interface to exercise shop-history endpoints.
- **`scenarios/shop-modules.ts`** — the `PATCH` verb in `Method` is explicitly documented as "the products module's update shape," indicating shop-modules is the API surface these flows target.
- **`scenarios/locales.ts`** — no direct import or reference visible in this file; interaction is indirect (flows that use `Caller` may exercise locale-dependent endpoints).

## Notes

- **Not a general-purpose HTTP client.** It is purpose-built for the flow-runner boot sequence; there is no retry logic, no connection pooling, and no streaming support.
- **`data` is `undefined` in three cases:** 204 No Content, any non-2xx response, and a body that is not valid JSON. Downstream code must not assume `data` is populated on a `call` that returns 2xx *and* is non-204.
- **Token extraction handles two shapes:** `data.token` (JWT mode) and `data.sessionToken` (cookie mode with `transport: bearer`). Both are read from the login response; only one will be present.
- **2FA is opt-in per account.** If `totpSecret` is `undefined` or the login response does not set `mfaRequired`, the challenge step is skipped entirely.
- **`FormData` bodies are passed through as-is** to `fetch`, and the `content-type` header is stripped so `fetch` can set the multipart boundary itself. JSON bodies are stringified and get `content-type: application/json`.
- The file is a **`@module`** (no default export); all public surface is the three named exports (`Attempt`, `Caller`, `signIn`).
