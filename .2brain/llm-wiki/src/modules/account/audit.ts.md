---
source: src/modules/account/audit.ts
sha256: 7a98fd732b68c1b75a741e7814c1411f450b6df5e195cc11c891ea5e70093a51
generated_at: 2026-10-29T02:25:17.860285+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/audit.ts

## Purpose

Declares the full vocabulary of audit action strings emitted by the account module and injects them into the shared `AuditActionMap` type via a declaration merge. It exists so that every account service can fire typed, self-documenting audit events without the infrastructure layer needing to know which module owns which string.

## Key elements

- **`accountAuditActions`** (`as const` object) — The canonical map from symbolic keys (e.g. `AUTH_LOGIN`, `AUTH_2FA_CODE_SENT`) to the wire-format strings actually written to logs (e.g. `'auth.login'`, `'auth.two_factor.code_sent'`). Covers ~35 events spanning login, signup, password, email change, token lifecycle, 2FA, OAuth linking, data export, reauth, and account deletion.
- **`declare module '@infrastructure/observability/audit'`** — Augments the `AuditActionMap` interface with an `account` key typed as the union of all values in `accountAuditActions`. This is type-only; no runtime code is emitted, and the infrastructure layer never imports this file.

## Relationships

Every file under `src/modules/account/services/` (account-deletion, email-change, export, logout, oauth, password-reset, password-reset-request, password, profile, purge-deletions, reauth, refresh, signup, tokens, two-factor-challenge) imports `accountAuditActions` to supply the action string when recording an audit event, and benefits from the augmented `AuditActionMap` type so the audit infrastructure can narrow on the `account` key. This file itself imports none of them.

## Notes

- **`auth.` prefix, not `account.`** — The wire strings deliberately use the `auth.` namespace because external log tooling and alert rules were written before the current module layout. Renaming the folder or the prefix would break those queries.
- **Type-only coupling** — The `declare module` block is a one-directional, compile-time augmentation. The infrastructure package gains the `account` key without importing this file; deleting this file would simply drop the key from the union.
- **Intentional ambiguity in a few strings** — `AUTH_ONE_TIME_TOKEN_REJECTED` covers unknown, expired, and already-used tokens as one event (the comment states this is on purpose). `AUTH_2FA_CODE_SENT` is called out specifically because it is the only 2FA action an unauthenticated caller can trigger, making its failure series the canary for mail-bombing.
