---
source: src/modules/account/domain/revocation.ts
sha256: 1bed67a3b75acb0e3b0a7c339ec6f7a2ddf3538e6fadae98d17c8bd8e85cf5b0
generated_at: 2026-10-14T08:39:13.143451+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/revocation.ts

## Purpose

A single, I/O-free lookup table that enumerates every cause by which an account's sessions can be terminated and specifies exactly what each cause does (epoch strategy, pending-link cleanup, subscriber announcement, caller re-mint, applicable session modes). All downstream consumers—services, event types, tests—derive their behavior and types from this table so the list of causes is declared in exactly one place.

## Key elements

- **`RevocationRow`** – Interface describing the five behavioral dimensions of a single cause: `epoch` (`with-write` vs `own`), `pending` (purge one-time links/challenges), `announce` (emit `account.sessions-revoked`), `callerKeeps` (re-mint acting caller), `modes` (`both` vs `jwt`-only).
- **`REVOCATION`** – `as const satisfies Record<string, RevocationRow>` object mapping seven causes (`password-change`, `password-reset`, `logout-all`, `email-change-confirm`, `email-change-undo`, `two-factor-change`, `refresh-reuse`) to their rows. This is the single source of truth.
- **`RevocationCause`** – `keyof typeof REVOCATION`; the union of all cause strings.
- **`SessionsRevokedReason`** – Conditional type that narrows `RevocationCause` to only those causes whose `announce` field is `true` (`password-reset`, `logout-all`, `email-change-undo`). Feeds the `account.sessions-revoked` event payload type.
- **`announces(cause)`** – Type-guard that returns `cause is SessionsRevokedReason`, wrapping the `REVOCATION[cause].announce` lookup.

## Relationships

- **`src/modules/account/domain/index.ts`** – Barrel file that re-exports `RevocationCause`, `SessionsRevokedReason`, `REVOCATION`, and `announces` so other modules import from the domain root.
- **`src/modules/account/events.ts`** – The `account.sessions-revoked` event's reason payload type is derived from `SessionsRevokedReason`, ensuring the event can only carry a cause that actually announces.
- **`src/modules/account/services/revocation.ts`** – Reads the `REVOCATION` rows to perform the actual I/O (epoch writes, pending-link purges, event emission) for a given cause.
- **`src/modules/account/services/password.ts`** – Uses `REVOCATION['password-change']` and `REVOCATION['password-reset']` rows to drive post-mutation cleanup (pending purges, caller re-mint).
- **`src/modules/api-keys/services/api-keys.ts`** – Subscribes to `account.sessions-revoked` and, for reasons in `SessionsRevokedReason`, revokes previously minted API keys.
- **`src/modules/api-keys/emails.ts`** – Sends transactional email when a `SessionsRevokedReason` is announced.
- **`src/modules/account/tests/unit/revocation-table.test.ts`** – Unit-tests the table's internal consistency (e.g., `refresh-reuse` is `jwt`-only).
- **`src/modules/account/tests/integration/revocation-causes.test.ts`** – Exercises each cause end-to-end through the service layer.

## Notes

- The `satisfies` clause on `REVOCATION` enforces the `RevocationRow` shape while preserving the literal types needed for the `SessionsRevokedReason` conditional-type derivation. Removing `satisfies` would break the type narrowing.
- `epoch: 'with-write'` means the epoch increment is a side-effect of the caller's own write (e.g., the password UPDATE); `epoch: 'own'` means `revokeFor` issues a separate write in its own transaction.
- `refresh-reuse` is the only cause restricted to `jwt` mode—refresh-token replay detection does not exist in the opaque-session path.
- Adding a new cause requires only a new key in `REVOCATION`; all types (`RevocationCause`, `SessionsRevokedReason`) and the service/test layers pick it up automatically.
