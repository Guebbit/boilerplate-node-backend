---
source: src/modules/users/services/lookups.ts
sha256: 91187856d040c91d7ba379ee2becc3f3e586f19f763d4226ceab9f80d70644ce
generated_at: 2026-10-15T12:10:51.845729+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/lookups.ts

## Purpose

Read-side of the shared kernel for the `account` context. Provides a small set of purpose-named lookup functions that are thin pass-throughs to `userRepository`, each named for the question it answers (login, OAuth linking, pending-email, duplicate check) rather than the underlying query shape. The design constraint is that no raw write or arbitrary-filter handle is published here — only the specific fields a caller actually needs are exposed.

## Key elements

- **`findAuthenticatableById(id)`** — Find an active, non-soft-deleted account by id.
- **`findByIdWithCredentials(id)`** — Same as above but with `select: false` fields (password hash, tokens, 2FA methods) hydrated.
- **`findForLogin(email)`** — Find by email for email/password login; returns credentials. Deactivated/soft-deleted rows are excluded by the underlying `findAuthenticatableByEmail` query.
- **`findByOAuthIdentity(provider, providerId)`** — Find an account already linked to a federated identity, credentials included. Applies `AUTHENTICATABLE_FILTER` so a deactivated account cannot walk into a session via a stale provider link.
- **`findByIdWithPendingEmail(id)`** — Hydrated document with the pending-email-change field loaded.
- **`emailOrPendingEmailTaken(email, excludingId)`** — True if `email` (or its pending-change counterpart) is claimed by another account.
- **`emailTaken(email)`** — Simple existence check for signup's duplicate-email pre-check.

## Relationships

- **`src/modules/users/repository.ts`** — Imports `userRepository`; every exported function delegates directly to a repository method.
- **`src/modules/users/authenticatable.ts`** — Imports `AUTHENTICATABLE_FILTER` and spreads it into the `findByOAuthIdentity` query to exclude deactivated/soft-deleted rows.
- **`src/modules/users/services/index.ts`** — Barrel file; this module's exports are re-exported from there for consumers outside the `services` directory.

## Notes

- `findForLogin` is a *rename* of `userRepository.findAuthenticatableByEmail`, not a new query — the name reflects the caller's intent, not a different SQL shape.
- The file deliberately does **not** publish raw `save`, `build`, `create`, or an open `findOneWithCredentials(where)`. If a write is needed, it belongs in a sibling service that takes only the fields its one caller has and performs exactly one mutation (per the shared-kernel rule in `docs/theory/strategic-ddd.md` §5).
- `AUTHENTICATABLE_FILTER` is the single source of truth for the "active + not soft-deleted" clause; both `findForLogin` (via the repo method) and `findByOAuthIdentity` (via spread) rely on it. Keep that filter in one place.
