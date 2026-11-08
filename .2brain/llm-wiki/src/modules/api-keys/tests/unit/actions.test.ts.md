---
source: src/modules/api-keys/tests/unit/actions.test.ts
sha256: ed6c37cd766c4a7463626143818876c5d1881bc2840de2a44bcc032a4cef5ad6
generated_at: 2026-11-08T05:06:46.692950+00:00
model: ollama:qwen3.8:27b
---

# src/modules/api-keys/tests/unit/actions.test.ts

## Purpose

Unit tests for `actionsForRows`, verifying which credential actions are exposed to a caller based on their permissions and the credential's state. The only tested action is **revoke**, which requires the `delete:ApiKey` permission and is unavailable once the credential is already revoked.

## Key elements

- **`describe('actionsForRows')`** — single test block covering three scenarios:
  - Admin caller + live credential → `{ revoke: true }`
  - Admin caller + credential with `revokedAt` set → `{ revoke: false }`
  - Non-admin caller (`customer`) + live credential → `{ revoke: false }`
- **`callerContextAs(role)`** — imported from `@tests/callers`; constructs a caller context fixture for the given role.
- **`actionsForRows(context)`** — imported from `../../services/actions`; the unit under test. Accepts a caller context and returns a function that maps a credential row to an availability object.

## Relationships

- **`src/modules/api-keys/services/actions.ts`** — the module under test; exports `actionsForRows`, which this file exercises directly.
- **`tests/support/callers.ts`** — provides `callerContextAs`, a test helper that produces caller-context fixtures (admin, customer) consumed by `actionsForRows`.

## Notes

- The test file's JSDoc header describes the *service module* (`services/actions.ts`) rather than the test itself — a convention that mirrors the subject under test.
- `callerContextAs` is imported via the `@tests/callers` path alias, not a relative path; ensure the alias is configured if running tests outside the standard toolchain.
- The "already revoked" check is triggered by the presence of a `revokedAt` field on the row object; there is no separate boolean flag.
