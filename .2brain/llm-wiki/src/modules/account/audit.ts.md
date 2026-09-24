---
source: src/modules/account/audit.ts
sha256: 31c449528543b1549b2f85fb1f16e7a2de9c0d5d3a6da8d4fd3cf194d31522cd
generated_at: 2026-09-23T17:58:27.379586+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/audit.ts

## Purpose

Central registry of every audit action string the account module can emit. It exists so that (a) all event names live in one place for consistency, and (b) the infrastructure audit type map learns about the account vocabulary via a type-only module augmentation—no runtime import crosses the boundary upward.

## Key elements

- **`accountAuditActions`** (`as const` object) — the single source of truth for every `auth.*` action string fired by account services (login, signup, password reset, email change, token refresh/reuse, 2FA enrollment/challenge/backup-codes, OAuth link/fail, session revocation, data export, expired-token cleanup, etc.). Importers reference entries by key (e.g. `accountAuditActions.AUTH_LOGIN`) so the wire value stays in one spot.
- **`declare module '@infrastructure/observability/audit'`** — augments `AuditActionMap` with a new `account` key typed to the union of all values above. Type-only; adds no runtime dependency from account → infrastructure.

## Relationships

- Every service that emits an audit event (authentication, two-factor, oauth, profile, export, token-cleanup, verification, post-reset-request, session/login-observability) imports `accountAuditActions` to supply the action string when calling the infrastructure audit emitter.
- Tests (`audit.test.ts`, `oauth.contract.test.ts`, `oauth-link.test.ts`, `self-service.test.ts`, `service-flows.test.ts`, `token-cleanup-job.test.ts`) assert on specific action values, pinning the wire format.
- The `declare module` augmentation is consumed by `@infrastructure/observability/audit`, which types its emitter's `action` parameter against `AuditActionMap`.

## Notes

- **`auth.` prefix is deliberate, not a typo.** The strings are queried by pre-existing log tooling and alert rules that predate the `account/` folder layout. Renaming to `account.*` would break those queries; the module folder is free to be named for the domain while the wire format stays fixed.
- **Type-only coupling.** The module augmentation means the account folder never imports infrastructure at runtime; only the type checker walks the edge.
- **`AUTH_REFRESH_TOKEN_REUSE_DETECTED`** fires only when a rotated token is replayed *outside* the grace window (i.e., not a benign two-tab race) and triggers revocation of the entire refresh-token set in the same operation.
- **`AUTH_2FA_CODE_SENT`** is the only 2FA action an *unauthenticated* caller can trigger an outbound message with—useful as the primary signal for mail/SMS-bombing detection.
- Several actions carry a `metadata.method` discriminator (2FA enroll/disable) or are paired (e.g., `*_REQUESTED` / `*_COMPLETED` for password reset, email change, account delete) to distinguish "intent initiated" from "irreversible swap completed."
