---
source: src/modules/users/services/lookups.ts
sha256: cb6a4c99e4ab777033f1f8619ca1ec3ef6f6e2f0a26e315c2ac9a95d62fa87f4
generated_at: 2026-11-08T08:49:53.506389+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/lookups.ts

## Purpose

Read-side named lookups over `userRepository` for the **account** domain (the "account" half of the repo's single domain-primitives relationship). Every function is a thin, single-purpose pass-through whose name describes the question it answers, so callers never touch the repository barrel directly.

## Key elements

- **`findAuthenticatableById(id)`** — Active, non-deleted account by id.
- **`findByIdWithCredentials(id)`** — Account with all `select: false` fields loaded (password hash, tokens, 2FA methods).
- **`findForLogin(email)`** — Credentialed account for email/password sign-in; excludes deactivated/soft-deleted accounts *except* owner-scheduled deletions still in their grace period (returned so the caller can offer a restore).
- **`findByOAuthIdentity(provider, providerId)`** — Credentialed account already linked to a federated identity; same grace-period exclusion semantics as `findForLogin`.
- **`findByIdWithPendingEmail(id)`** — Account with the pending-email-change field loaded.
- **`emailOrPendingEmailTaken(email, excludingId)`** — True if `email` (or its pending-change counterpart) belongs to another account.
- **`emailTaken(email)`** — True if any account exists for this email (signup pre-check).

## Relationships

- **`src/modules/users/repository.ts`** — Imports `userRepository` and delegates every lookup to it. This is the sole data-access dependency.
- **`src/modules/users/services/index.ts`** — Re-exports this module's functions as the public service barrel for the users domain.

## Notes

- **Grace-period restore:** `findForLogin` and `findByOAuthIdentity` deliberately *include* accounts that are soft-deleted but within the owner's scheduled-deletion grace window. Callers must distinguish `isAuthenticatable` from `isRestorable` to decide whether to complete the sign-in or present a restore prompt.
- **Write discipline:** The module docstring explicitly warns that raw `save`/`build`/`create`/`findOneWithCredentials(where)` on the barrel would be an unbounded write or arbitrary-filter read handle. This file deliberately exposes only the narrow, named lookups its single caller needs, enforcing intent by construction.
- **DDD context:** The header references `docs/theory/strategic-ddd.md` §5 for the strategic rationale behind treating "account" as the read side of a domain-primitives relationship.
