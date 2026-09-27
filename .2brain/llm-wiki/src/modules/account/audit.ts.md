---
source: src/modules/account/audit.ts
sha256: 65f78a1288a9eda51c0163ab01cb22022b91092448af53619b7a7f2b03d9162d
generated_at: 2026-09-27T14:21:47.807554+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/audit.ts

## Purpose

Single source of truth for every audit action string the account module emits. It declares the vocabulary as a typed const and augments the infrastructure audit action map via a type-only module augmentation, so log tooling, alert rules, and the type system all agree on the same set of event names without any runtime coupling.

## Key elements

- **`accountAuditActions`** (exported const) — Map of every audit event the module can fire: login, signup, profile/password/email changes, account deletion, token refresh & reuse detection, reauth, logout, session revocation, token-expiry cleanup, data export, 2FA enrollment/dismissal/code-sent/challenge-failure/backup-code-regeneration, and OAuth link/failed. All values use the `auth.*` wire prefix (not `account.*`) for backward compatibility with pre-existing log queries and alert rules.
- **`declare module '@infrastructure/observability/audit'`** — Type-only augmentation that adds a `account` key to `AuditActionMap`, so the infrastructure layer's union of known actions includes this module's strings without a runtime import.

## Relationships

- **Services & controllers in the same module** (e.g. `authentication.ts`, `oauth.ts`, `profile.ts`, `two-factor.ts`, `token-cleanup.ts`, `export.ts`, `post-reset-request.ts`, `login-observability.ts`) — import `accountAuditActions` to supply the action string when emitting an audit event.
- **`tests/cross-cutting/audit-actions-registered.test.ts`** — cross-cutting test that asserts every action declared here is present in the infrastructure `AuditActionMap`.
- **Contract / integration / unit tests** (`login-paths.contract.test.ts`, `oauth-link.test.ts`, `self-service.test.ts`, `service-flows.test.ts`, `token-cleanup-job.test.ts`) — assert that specific `accountAuditActions` values are emitted during the flows under test.

## Notes

- The `auth.` prefix is deliberate and **not** a naming bug: changing it would break existing log-tooling queries and alert rules. Renaming the folder or module is safe; renaming the wire strings is not.
- This file is **type-and-constant only** — it imports nothing at runtime and is safe to reference from anywhere without creating a dependency cycle.
- Several actions carry a `requested` / `completed` pair (password reset, account delete, email change) plus a `cancelled` variant for email change. Consumers of the audit log should treat the pair as a state transition, not as independent events.
- `AUTH_2FA_CODE_SENT` is the only 2FA action an **unauthenticated** caller can trigger; it is the primary signal for mail-bombing attempts.
