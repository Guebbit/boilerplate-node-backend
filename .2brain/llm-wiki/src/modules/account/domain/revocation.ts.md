---
source: src/modules/account/domain/revocation.ts
sha256: 21853cdef35fc6ce9306caa3dc32575ab392a19aca349090f6c3f3b124778927
generated_at: 2026-10-29T02:33:53.018087+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/domain/revocation.ts

## Purpose

A single, I/O-free declaration of every way an account's sessions can end. Each cause is a row of behavior flags (epoch strategy, pending-link purge, event announcement, caller retention, session-mode scope). `services/revocation.ts` reads these flags to execute; the `account.sessions-revoked` event's reason type is derived from this table, so the list is defined in exactly one place.

## Key elements

- **`RevocationRow`** (interface) — the shape every cause must fill: `epoch` (`'with-write' | 'own'`), `pending`, `announce`, `callerKeeps`, `modes` (`'both' | 'jwt'`).
- **`REVOCATION`** (const, `satisfies Record<string, RevocationRow>`) — the nine causes: `password-change`, `password-reset`, `logout-all`, `email-change-confirm`, `email-change-undo`, `two-factor-change`, `deactivation`, `deletion-scheduled`, `refresh-reuse`. `as const` preserves literal values so downstream types stay narrow.
- **`RevocationCause`** (type) — `keyof typeof REVOCATION`; the union of all cause strings.
- **`SessionsRevokedReason`** (type) — a conditional type over `RevocationCause` that keeps only causes whose `announce` flag is `true`. Used as the `reason` field of the `account.sessions-revoked` event.
- **`announces`** (function) — type guard: `(cause: RevocationCause) => cause is SessionsRevokedReason`. Returns `REVOCATION[cause].announce`.

## Relationships

- **`services/revocation.ts`** — the primary consumer; reads `REVOCATION` rows to decide epoch handling, pending-link purge, and whether to emit the event.
- **`events.ts`** — imports `SessionsRevokedReason` to type the `reason` discriminant on `account.sessions-revoked`.
- **`domain/index.ts`** — barrel re-export of this module's public surface.
- **`services/password.ts`** — triggers `password-change` / `password-reset` causes when a credential write occurs.
- **`src/modules/api-keys/emails.ts`** — subscriber to `account.sessions-revoked`; acts on `announce: true` causes to revoke minted API keys.
- **`tests/unit/revocation-table.test.ts`** — validates the table invariants (e.g. exactly one `refresh-reuse` row with `modes: 'jwt'`).
- **`tests/integration/revocation-causes.test.ts`** — exercises each cause end-to-end through the service layer.

## Notes

- `deactivation` and `deletion-scheduled` carry inline comments explaining that the epoch move is performed by the `users` module's own save, not by the revocation service; this row only governs the pending-link purge.
- `refresh-reuse` is the sole cause scoped to `jwt` sessions; all others apply to both `jwt` and opaque sessions.
- Adding a new cause with `announce: true` automatically widens `SessionsRevokedReason` (and thus the event's `reason` union) without editing `events.ts`—the conditional type picks it up.
- `as const satisfies Record<string, RevocationRow>` is deliberate: `satisfies` checks conformance to the interface while `as const` keeps literal types for the derived `SessionsRevokedReason` conditional.
