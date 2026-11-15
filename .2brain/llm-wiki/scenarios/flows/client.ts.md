---
source: scenarios/flows/client.ts
sha256: 569250b867bc6120a55749cccd37d4287a74910e219e4648dd55e4a0fc8c3ee8
generated_at: 2026-11-14T17:15:43.204333+00:00
model: ollama:qwen3.8:27b
---

# scenarios/flows/client.ts

## Purpose

HTTP client that scenario flow runners use to drive the running application. It wraps a single base URL and bearer token behind a `Caller` object, normalises every response into an `Attempt`, and handles the two-step (password + TOTP) login path. It exists so that every flow file can issue requests and interpret refusals without re-implementing status/body parsing, and so that seeds are produced through the same endpoints a real browser hits.

## Key elements

- **`Attempt`** (exported interface) — Normalised view of any HTTP response: `status`, `data` (success body or `undefined`), `errorCode`, and `errorMessages`.
- **`Caller`** (exported interface) — A signed-in actor exposing `call` (throws on non-2xx) and `attempt` (always resolves to an `Attempt`).
- **`signIn`** (exported function) — Performs `POST /account/login`, answers the TOTP challenge if one is issued, and returns a `Caller`. Accepts a `totpSecret` for accounts with authenticator-app MFA.
- **`ScenarioFlowError`** (internal class) — The sole error type thrown by `Caller.call`; embeds actor email, method, path, status, error code, and messages.
- **`readAttempt`** (internal) — Parses a `Response` into an `Attempt`; handles 204 and non-JSON bodies by leaving `data` as `undefined`.
- **`send`** (internal) — The single `fetch` call site. Strips `content-type` for `FormData` bodies, injects a fresh `idempotency-key` (UUID) on every non-GET request, and JSON-stringifies plain-object bodies.
- **`answerChallenge`** (internal) — If the login response carries `mfaRequired: true` and a `totpSecret` was provided, generates a TOTP code via `otplib` and posts it to `POST /account/login/2fa`.

## Relationships

- **scenarios/flows/actions.ts** — Consumes the `Caller` and `Attempt` types (and likely `signIn`) to issue the individual HTTP actions that make up a scenario step.
- **scenarios/flows/shop-history.ts** — A flow that imports from this module to obtain a `Caller` and drive shop-history endpoints.
- **scenarios/shop-modules.ts** — Defines the API surface (routes, response shapes, refusal codes) that `readAttempt` and the `Attempt` interface are structured to decode; the `Problem` shape here mirrors that module's error contract.
- **scripts/docs/generate-role-matrix.ts** — References the scenario flow entry points (which in turn use this client) to build a role-permission matrix; no direct runtime import of this file is visible in the source.

## Notes

- **No supertest.** The repo depends on supertest for its test suites, but this file intentionally uses the runtime `fetch` because it executes during `npm run db:bootstrap` → `scenario:apply`, where `devDependencies` may be absent.
- **Idempotency key on every write.** A `randomUUID` is attached to all non-GET requests. Routes that enforce do-not-retry (refund, ship, stock) require it; routes that ignore it are unaffected.
- **FormData handling.** When the body is a `FormData` instance, the `content-type` header is stripped so that `fetch` sets its own multipart boundary.
- **Dual token fields.** The login response may carry either `token` (JWT mode) or `sessionToken` (cookie mode). `signIn` checks both; flows must pass `transport: 'bearer'` in the login body to get the token in the JSON response.
- **`call` does not validate the body shape.** The generic `T` on `Caller.call` is the caller's own claim; only the 2xx status range is verified before `data` is cast and returned.
- **204 / non-JSON bodies.** `data` is `undefined` in both cases. Flows that expect a body on a 204 will see `undefined`, not an empty object.
