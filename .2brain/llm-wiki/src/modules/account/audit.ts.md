---
source: src/modules/account/audit.ts
sha256: c866cee262344697c369bd7f8d85fa066a6620b1b5de7f7274dbe437ae7da155
generated_at: 2026-10-14T08:28:19.676630+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/audit.ts

## Purpose

Centralizes the audit-action vocabulary for the account/auth domain. It defines the canonical wire-format strings (e.g. `auth.login`, `auth.email_change.completed`) that every account service fires through the shared audit logger, and registers them on the infrastructure `AuditActionMap` via a type-only module augmentation so log tooling and alert rules get a single typed union without a runtime import cycle.

## Key elements

- **`accountAuditActions`** (`as const`) — the sole runtime export. A flat object mapping ~35 semantic event names to their dotted wire strings. Covers login/signup, profile, password (reset + change), email verification and change (requested / completed / cancelled / undone / resent), token refresh + reuse detection, re-authentication, one-time-token rejection, logout (single / everywhere / revoked), data export (requested / downloaded), two-factor (enrolled, disabled, code sent, challenge failed, backup codes regenerated), and OAuth (linked, unlinked, failed).
- **`declare module '@infrastructure/observability/audit'`** — augments `AuditActionMap` with the `account` key typed as the value union of `accountAuditActions`. Purely a compile-time declaration; no runtime side-effect.

## Relationships

All listed neighbor services (deletion-request, email-change, export, logout, oauth, password, password-reset, password-reset-request, profile, reauth, refresh, self-delete, signup, tokens, two-factor-challenge) **import** `accountAuditActions` from this file to pass a typed action string to the infrastructure audit emitter. This file imports nothing from them; it is a leaf dependency in the graph.

## Notes

- The `auth.` prefix (rather than `account.`) is a deliberate wire-format constraint: existing log queries and alert rules key off those strings, so the folder name may change but the emitted value must not.
- `AUTH_ONE_TIME_TOKEN_REJECTED` intentionally makes "unknown" and "expired" indistinguishable on the wire; the `metadata.flow` field names which token type it was.
- `AUTH_REFRESH_TOKEN_REUSE_DETECTED` fires only when a rotated token is replayed **outside** the grace window for a benign two-tab race — it signals a likely token leak, and `rotateRefreshToken` revokes the entire refresh set in the same call.
- `AUTH_2FA_CODE_SENT` is the only two-factor action an **unauthenticated** caller can trigger an outbound message with, making it the key series for detecting mail-bombing.
- Several email-change actions are easy to confuse at a glance (requested vs. completed vs. cancelled vs. undone vs. resent); the JSDoc on each one states which HTTP route fires it.
