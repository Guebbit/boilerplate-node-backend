---
source: src/modules/users/services/lookups.ts
sha256: cb6a4c99e4ab777033f1f8619ca1ec3ef6f6e2f0a26e315c2ac9a95d62fa87f4
generated_at: 2026-10-29T06:16:49.324515+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/lookups.ts

## Purpose

Read-side lookup functions for the `account` domain (shared kernel). Each export is a thin, named pass-through to `userRepository`, scoped to a single question the caller is asking. The file deliberately contains **no** writes; mutation operations live elsewhere and are designed to take only the fields their specific caller possesses.

## Key elements

- **`findAuthenticatableById(id)`** — Active (non-soft-deleted) account by id; excluded rows are filtered in the query itself.
- **`findByIdWithCredentials(id)`** — Hydrates all `select: false` fields (password hash, tokens, 2FA methods).
- **`findForLogin(email)`** — Credential-bearing account by email for sign-in. Deactivated / soft-deleted accounts are excluded **except** an owner-scheduled deletion still in its grace window (returned so the caller can offer a restore). Passes `new Date()` to the repository.
- **`findByOAuthIdentity(provider, providerId)`** — Same grace-period logic, keyed on a federated identity. `select: false` fields included because a caller may need `twoFactorMethods` immediately after.
- **`findByIdWithPendingEmail(id)`** — Hydrates the pending-email-change field.
- **`emailOrPendingEmailTaken(email, excludingId)`** — Whether the email *or* its pending-change counterpart is already in use by another account.
- **`emailTaken(email)`** — Simple "does an account with this email exist?" check used as a signup pre-check.

## Relationships

- **`src/modules/users/repository.ts`** — Sole data source. Every function in this file delegates to a same-named (or near-named) method on `userRepository`; no logic is added beyond passing `new Date()` at the two login-path call sites.
- **`src/modules/users/services/index.ts`** — Barrel for the `users/services` directory. This file is expected to be re-exported from it; the module comment warns that publishing raw `save`/`build`/`create` on that barrel would leak unrestricted write handles to every future sibling.

## Notes

- **Read vs. write boundary:** The file's own doc block states that writes must *enforce by construction* (accept only the fields one caller has, perform only the one named mutation). That design lives in sibling service files, not here. Keeping this file read-only is the enforcement mechanism.
- **Grace-period ambiguity:** Both `findForLogin` and `findByOAuthIdentity` may return an account that is *not* currently authenticatable (owner-scheduled deletion within grace). Callers are expected to disambiguate via `isAuthenticatable` / `isRestorable` on the returned document.
- **`new Date()` is captured at call time**, not inside the repository. This means the "now" boundary for grace-window checks is fixed when the lookup is invoked, not when the query executes.
- **`emailTaken`** is the only export with an explicit `Promise<boolean>` return annotation; the rest rely on inference.
- The module doc cross-references `docs/theory/strategic-ddd.md` §5 for the strategic-DDD rationale behind the shared-kernel / domain-primitives split.
