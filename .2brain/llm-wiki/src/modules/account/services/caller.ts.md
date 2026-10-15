---
source: src/modules/account/services/caller.ts
sha256: 7ce04dbfefd20ec219abfa8029bea4252c457cc30578fe477a3e2e9f516722c9
generated_at: 2026-10-15T09:59:16.208944+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/caller.ts

## Purpose

Shared entry-point helpers for self-service account flows. It encapsulates the "load the caller's own account or return 401" pattern that nearly every account service repeats, and provides a consistent way to stamp audit entries with the actor's resolved role.

## Key elements

- **`withOwnAccount<T>(userId, action, load?)`** — Loads the caller's `UserDocument` (via `load`, defaulting to `userService.findByIdWithCredentials`) and invokes `action` on the result. If the account no longer exists, returns a `401` rejection. The `load` parameter is injectable for testing or alternate fetch strategies.
- **`recordAccountAudit(context, userId, entry)`** — Records an audit log entry via `recordAudit`. Resolves the actor's role (`admin` or `user`) by calling `isUnrestrictedCaller` *at audit time*, i.e. after the calling action has already run and potentially changed the role.

## Relationships

- **`src/infrastructure/http/response.ts`** — Consumes `generateReject` and the `ResponseSuccess` / `ResponseReject` types for building the 401 response.
- **`src/infrastructure/observability/audit.ts`** — Calls `recordAudit` to persist audit entries.
- **`src/modules/account/roles.ts`** — Calls `isUnrestrictedCaller` to determine the actor's role label.
- **`src/modules/users/index.ts` / `src/modules/users/model.ts`** — Imports `userService` and the `UserDocument` type used as the account payload.
- **Account service files** (`login`, `profile`, `verification`, `reauth`, `password-reset`, `oauth`, `export`, `two-factor-enrollment`, `two-factor-lockout`) — Depend on `withOwnAccount` and/or `recordAccountAudit` as the shared guard and audit helpers for their respective routes.

## Notes

- **401, not 404, for deleted accounts.** The route contract explicitly omits a 404; `withOwnAccount` mirrors the `isAuth` behavior by rejecting with 401 when the user document is `null`/`undefined`.
- **Credentials are loaded by default.** The default `load` uses `findByIdWithCredentials` because most flows compare or update secrets marked `select: false`. Pass a custom loader to opt out.
- **Role is resolved post-mutation.** `recordAccountAudit` reads the role *after* the action completes (e.g. a verification that promotes `unverified` → `customer`), so the audit entry reflects the role as it stands, not a stale pre-action value.
- **Generic `action` return type.** `withOwnAccount` accepts both synchronous and promise-returning actions, and propagates the `ResponseSuccess<T>` / `ResponseReject` union unchanged.
