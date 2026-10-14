---
source: src/modules/antibot/controllers/get-antibot-challenge.ts
sha256: 8f468a35d203577aff0ec528429af8ebcbb0c7a54a33d9f83f98807138330fc0
generated_at: 2026-10-14T14:56:42.168687+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/controllers/get-antibot-challenge.ts

## Purpose

Express route handler for `GET /antibot/challenge`. It asks the active human-challenge adapter whether it can issue a self-hosted challenge; if so, it returns the challenge object, otherwise it returns a 404. This endpoint is only meaningful for self-hosted (non-vendor) providers—vendor-hosted widgets fetch their challenge from the vendor and never hit this route.

## Key elements

- **`getAntibotChallenge`** (exported) — Synchronous signature `(Request, Response) => Promise<void>`. Resolves the active provider via `resolveHumanChallengeProvider()`. If the provider lacks an `issueChallenge` method, sends a 404 with `ERROR_CODES.ANTIBOT_NO_CHALLENGE`. Otherwise calls `provider.issueChallenge()` and wraps the result in `successResponse<AntibotChallenge>`. All rejections are funnelled through `catchAs(response, 'getAntibotChallenge')`.

## Relationships

- **`@infrastructure/adapters/antibot-providers`** — Imports `resolveHumanChallengeProvider`, the factory that returns the currently configured provider instance (or one without `issueChallenge`).
- **`@infrastructure/http/response`** — Imports `rejectResponse` (404 path) and `successResponse` (200 path).
- **`@infrastructure/http/controller`** — Imports `catchAs` for uniform error shaping.
- **`@infrastructure/i18n`** — Imports `t` to localise the 404 message string.
- **`@types`** — Imports the `AntibotChallenge` shape used as the success-response generic.
- **`src/modules/antibot/routes.ts`** — Registers this handler on the `GET /antibot/challenge` route.

## Notes

- A 404 here is **semantic, not an error**: it truthfully reports "no self-hosted challenge exists for this deployment." Clients (or monitoring) should treat it as a valid state, not a fault.
- The `Request` parameter is intentionally unused (prefixed `_`); the handler needs no query/body/input.
- The handler uses a `Promise.resolve().then()` chain rather than `async/await`; the `catchAs` call is the terminal `.catch`.
- `resolveHumanChallengeProvider` may return a provider object that simply omits the `issueChallenge` key (e.g. `none` or a vendor adapter). The handler does not throw in that case—it short-circuits with the 404.
