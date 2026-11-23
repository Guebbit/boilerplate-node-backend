---
source: src/modules/account/domain/revocation.ts
generated_at: 2026-11-22T03:28:55.718742+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/domain/revocation.ts

## Purpose
A pure, I/O-free table describing every way an account's sessions end (each "cause"), what each cause does, and whether it is announced to subscribers. `src/modules/account/services/revocation.ts` reads it to act. The type of reasons an `account.sessions_revoked` event can carry is derived from this table rather than restated elsewhere.

## Key elements
- `RevocationRow` — the shape of one cause's behavior:
  - `epoch`: `'with-write'` (the credential's own write moves the session epoch) or `'own'` (`revokeFor` moves it in its own transaction).
  - `pending`: also purge one-time links and challenges issued under the old credential.
  - `announce`: notify `account.sessions_revoked` subscribers.
  - `callerKeeps`: the acting caller is re-minted in the same response.
  - `modes`: `'both'` or `'jwt'`.
- `REVOCATION` — the table, declared `as const satisfies Record<string, RevocationRow>` to keep literal types. Causes: `password-change`, `password-reset`, `logout-all`, `email-change-confirm`, `email-change-undo`, `two-factor-change`, `deactivation`, `deletion-scheduled`, `refresh-reuse`.
- `RevocationCause` — `keyof typeof REVOCATION`.
- `SessionsRevokedReason` — type derived from the table: the causes whose `announce` is literally `true`. Currently `password-reset`, `logout-all` and `email-change-undo`.
- `REASONS_MATCH_CONTRACT` — a compile-time assertion (a `true` constant typed with `SameMembers`) that `SessionsRevokedReason` equals the contract's `SessionsRevokedReason` imported from `@types` (the `reason` enum in `asyncapi.domain-events.yaml`). Drift in either direction fails `tsc`.
- `announces(cause)` — runtime type guard returning `REVOCATION[cause].announce`, narrowing to `SessionsRevokedReason`.

## Relationships
- `src/types/index.ts` — supplies the contracted `SessionsRevokedReason` that the compile-time check compares against.
- `src/modules/account/services/revocation.ts` — the consumer that reads the table to perform revocation.
- `src/modules/account/events.ts` and `src/modules/api-keys/emails.ts` — neighbors in the graph. The file's comments say `api-keys` revokes what was minted when `account.sessions_revoked` is announced.
- `src/modules/account/domain/index.ts` — neighbor in the graph. The file itself doesn't show what it re-exports.
- `src/modules/account/services/password.ts` — neighbor in the graph. The file itself doesn't show how it uses the table.
- `src/modules/account/tests/unit/revocation-table.test.ts` and `src/modules/account/tests/integration/revocation-causes.test.ts` — neighbors that cover the table and its causes.

## Notes
- `refresh-reuse` is the only cause limited to `jwt` mode.
- `deactivation` and `deletion-scheduled` use `with-write`: the epoch is moved by `users`' own save (a ban, or `scheduleOwnDeletion`). These causes only purge the leftover pending links. `deletion-scheduled` deliberately announces to nobody, because the owner requested it and the suspended keys return with the account.
- Adding a cause with `announce: true` requires the contract enum to list it too, or `tsc` fails. The same applies in reverse.
- The `as const` literals matter: widening `announce` to `boolean` would break the derived `SessionsRevokedReason`.
