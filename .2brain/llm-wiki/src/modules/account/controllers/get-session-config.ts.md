---
source: src/modules/account/controllers/get-session-config.ts
sha256: b53474550925adc5f1763057ad65cbfd0d6cffacf56ee8f053d3dde68a43c48f
generated_at: 2026-10-29T02:27:41.929658+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-session-config.ts

## Purpose

Public `GET /account/session-config` controller that reports how this deployment manages session persistence (mode, tiered lifetimes, optional staff cap) so clients can adapt at boot rather than carrying their own configuration switch.

## Key elements

- **`getSessionConfig`** — The sole export. Accepts an Express `(request, response)` pair (request intentionally unused, prefixed `_`), resolves a `SessionConfig` payload via `successResponse`, and routes any thrown error through `catchAs`.
- Payload shape: `{ mode, lifetimeSeconds: { short, medium, long }, staffLifetimeSeconds? }`. The `staffLifetimeSeconds` key is spread in only when `> 0`; a value of `0` means the cap is disabled and the field is omitted entirely.

## Relationships

- **`src/modules/account/session/config.ts`** — Source of `getExpiryTime`, `getSessionMode`, and `getStaffLifetimeSeconds`; the actual deployment-level configuration values returned to the client.
- **`src/infrastructure/http/response.ts`** — Provides `successResponse`, which serialises the `SessionConfig` body.
- **`src/infrastructure/http/controller.ts`** — Provides `catchAs`, the shared error-capture helper wired into the `.catch` tail.
- **`src/modules/account/routes.ts`** — Upstream router that maps `GET /account/session-config` to this handler.
- **`src/types/index.ts`** — Defines `RememberTier` (the enum passed to `getExpiryTime`) and the `SessionConfig` return type.

## Notes

- Error handling uses the `Promise.resolve().then().catch()` idiom (not `async/await`) so that `catchAs` can intercept synchronous throws from the config getters.
- The conditional `...(staffLifetimeSeconds > 0 && { staffLifetimeSeconds })` spread means clients must treat the field as optional; absence means "no staff lifetime cap."
