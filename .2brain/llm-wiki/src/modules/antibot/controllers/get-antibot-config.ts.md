---
source: src/modules/antibot/controllers/get-antibot-config.ts
sha256: 0da130b2525dd2a408e6283e7ad4ec9a8d758a3115196f8274d9adcf52fc3987
generated_at: 2026-09-23T18:22:27.752154+00:00
model: ollama:qwen3.8:27b
---

# src/modules/antibot/controllers/get-antibot-config.ts

## Purpose

Controller for the public `GET /antibot/config` endpoint. It reports which human-challenge provider is active, supplies the parameters the frontend needs to render that provider's widget, and returns a `rungs` summary of the other antibot mechanisms (identity budgets, email policy). It is one of two routes in the antibot module, the other being `GET /antibot/challenge`.

## Key elements

- **`CHALLENGE_URL`** (`const`, module-private) — Hardcoded `'/antibot/challenge'` path handed to the provider so it can point its widget at the right endpoint. Defined here (in the module) rather than inside the provider adapter so adapters never know their own mount path.
- **`getAntibotConfig`** (`export const`, Express handler) — Resolves the active human-challenge provider, calls `provider.publicParameters(CHALLENGE_URL)`, and sends a `successResponse` shaped as `AntibotConfig` with `provider`, `parameters`, and `rungs` (identityBudgets flag + emailPolicy). Errors (e.g. an unknown provider name in `NODE_ANTIBOT_PROVIDER`) are funneled through `catchAs`.

## Relationships

- **`@infrastructure/adapters/antibot-providers/index.ts`** — Provides `resolveHumanChallengeProvider()`, which returns the active provider instance (name + `publicParameters`).
- **`@infrastructure/adapters/antibot.ts`** — Provides `resolveEmailPolicy()`, used to fill the `rungs.emailPolicy` field.
- **`@infrastructure/http/controller.ts`** — Provides `catchAs`, the unified error-response helper for the `.catch` clause.
- **`@infrastructure/http/response.ts`** — Provides `successResponse`, used to shape and send the JSON reply.
- **`src/modules/antibot/routes.ts`** — Registers `getAntibotConfig` on `GET /antibot/config` (and the sibling challenge route).
- **`@types`** — Supplies the `AntibotConfig` interface that defines the response shape.

## Notes

- The handler is written as a `Promise.resolve().then(...).catch(...)` chain rather than `async/await`; `catchAs` is the only error-exit path.
- The `none` provider (default) returns an empty `parameters` map, which the frontend interprets as "render no widget."
- If `NODE_ANTIBOT_PROVIDER` or `NODE_ANTIBOT_EMAIL_POLICY` references a provider not compiled into the build, the `.catch` fires and `catchAs` produces the error response.
