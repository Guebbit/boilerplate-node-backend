---
source: src/modules/account/domain/revocation.ts
sha256: 515571796c2495d56ad73622eccfe666c16a23bf5d9c62d6e0628da55e61cdc6
generated_at: 2026-11-08T04:09:13.498980+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/revocation.ts

## Purpose

A pure, I/O-free lookup table that enumerates every way an account's sessions can end. Each row describes what a cause does to the session epoch, pending one-time links, event announcements, caller re-minting, and applicable session modes. Downstream services read this table to decide *what* to do; the event reason type for `account.sessions_revoked` is derived directly from it so the list is never restated.

## Key elements

- **`RevocationRow`** (interface) — The shape of one row: `epoch` (`'with-write' | 'own'`), `pending` (bool), `announce` (bool), `callerKeeps` (bool), `modes` (`'both' | 'jwt'`).
- **`REVOCATION`** (const, `satisfies Record<string, RevocationRow>`) — The nine-cause table: `password-change`, `password-reset`, `logout-all`, `email-change-confirm`, `email-change-undo`, `two-factor-change`, `deactivation`, `deletion-scheduled`, `refresh-reuse`.
- **`RevocationCause`** (type) — `keyof typeof REVOCATION`; the union of all valid cause strings.
- **`SessionsRevokedReason`** (type) — Filtered subset of `RevocationCause` where `announce` is `true` (`password-reset`, `logout-all`, `email-change-undo`).
- **`announces(cause)`** (function) — Type guard narrowing a `RevocationCause` to `SessionsRevokedReason` based on the row's `announce` flag.

## Relationships

- **`domain/index.ts`** — Re-exports the symbols from this file so the rest of the module can import them from the barrel.
- **`events.ts`** — The `SessionsRevokedReason` type here is the union of reasons the `account.sessions_revoked` event can carry; the event definition references it.
- **`services/revocation.ts`** — Reads `REVOCATION` rows at runtime to perform the actual I/O (epoch moves, link purging, event emission).
- **`services/password.ts`** — Triggers the `password-change` / `password-reset` causes through the revocation service.
- **`api-keys/emails.ts`** — Subscribes to `account.sessions_revoked`; when the reason is in `SessionsRevokedReason` it revokes minted API keys.
- **`tests/unit/revocation-table.test.ts`** — Unit-tests the table's invariants (e.g. every row is a valid `RevocationRow`).
- **`tests/integration/revocation-causes.test.ts`** — Integration-tests that each cause produces the expected side effects end-to-end.

## Notes

- `epoch: 'with-write'` means the credential's own save (e.g. a password write) moves the session epoch; `'own'` means `revokeFor` moves it in a separate transaction. Choosing the wrong one causes a double-write or a missed epoch bump.
- `refresh-reuse` is the only cause scoped to `modes: 'jwt'`; all others apply to both session types.
- `deactivation` and `deletion-scheduled` both set `announce: false` on purpose: the user initiated the action, and the suspended keys reappear with the account (deletion-scheduled) or the account is gone (deactivation).
- The `as const satisfies …` pattern keeps literal types on every field (so the derived `SessionsRevokedReason` works) while still enforcing structural conformance to `RevocationRow`.
