---
source: src/modules/api-keys/tests/unit/actions.test.ts
sha256: ed6c37cd766c4a7463626143818876c5d1881bc2840de2a44bcc032a4cef5ad6
generated_at: 2026-10-29T03:17:04.035577+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/unit/actions.test.ts

## Purpose

Unit tests for `actionsForRows`, the function that determines which operations a given caller is permitted to perform on an API-key credential row. It locks in the single supported action (revoke) and its two gating conditions: the caller must hold the `delete:ApiKey` permission, and the credential must not already be revoked.

## Key elements

- **`describe('actionsForRows')`** — the sole test block; exercises the function with three `it` cases:
  - *admin + live credential* → `{ revoke: true }`
  - *admin + already-revoked credential* (`revokedAt` set) → `{ revoke: false }`
  - *customer (no key) + live credential* → `{ revoke: false }`

## Relationships

- **`src/modules/api-keys/services/actions.ts`** — the module under test; `actionsForRows` is the only import from it.
- **`tests/support/callers.ts`** — provides `callerContextAs(role)`, a factory that builds a caller-context object with a specific role/permission set for test isolation.

## Notes

- The "live" fixture is an empty object `{}`; the "revoked" fixture is distinguished solely by a populated `revokedAt` ISO string. Any future column that should suppress an action will need an analogous fixture here.
- Tests assert the full returned object via `toEqual`, so adding a new action key to the service return shape will break these tests until they are updated.
