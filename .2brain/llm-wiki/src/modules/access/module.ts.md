---
source: src/modules/access/module.ts
sha256: 9e9962a0d2e2aabc05c5e84ad99fd280dc739c71685d1b8c55314df9eeb43a94
generated_at: 2026-09-23T17:57:22.320092+00:00
model: ollama:qwen3.8:27b
---

# src/modules/access/module.ts

## Purpose

Declares the `access` module's manifest (name + GDPR Art. 15 personal-data section) and registers it with the kernel. The module owns tenant and membership data but exposes no HTTP routes; it is consumed solely through its barrel export by `account`, `api-keys`, and `users`.

## Key elements

- **`export default` (satisfies `AppModule`)** — The module manifest object. Sets `name: 'access'` and defines a single `personalData` section (`roles`).
- **`personalData[0].collect`** — Asks `membershipsOf(subject.userId)` for the subject's memberships, then maps them to `{ role, scope }` pairs. Intentionally omits tenant id (single-shop deployment; scope + role already answer "what can this account do").
- **`membershipsOf`** (imported from `./service`) — The sole runtime dependency; resolves a user's membership records.
- **`AppModule`** (type-imported from `@kernel/registry`) — The structural type this default export must satisfy.

## Relationships

- **`src/kernel/registry.ts`** — Supplies the `AppModule` type that constrains the manifest shape.
- **`src/modules/access/service.ts`** — Provides `membershipsOf`, the query used inside the `collect` callback.
- **`src/modules.ts`** — The barrel/registry where this module's default export is re-exported for consumers.
- **`src/modules/account/module.ts`** — A downstream consumer that reads the access module's collections through the barrel (never over HTTP).
- **`src/modules/account/openapi.yaml`** — Account's route surface; interacts indirectly because account is the primary consumer of access data.

## Notes

- **Routeless by design.** The file header explicitly states no boilerplate route creates a shop or grants a role, so there is no URL to mount. This does not demote it to kernel code — `./model.ts` (referenced in the header doc) explains why it remains a module.
- **Personal-data scope is intentionally narrow.** Only `role` and `scope` are surfaced to the subject; the tenant id is excluded because the deployment is single-tenant and the id adds no recognisable context.
- **No shared HTTP surface.** All cross-module access to tenant/membership data flows through this barrel export; the module itself defines zero endpoints.
