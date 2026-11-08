---
source: src/modules/account/controllers/update-account.ts
sha256: 264e23a5cd117352038d14af89b138ac2fae18ef4f4870da4f4db6ac5c3e2f1f
generated_at: 2026-11-08T04:08:24.181124+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/update-account.ts

## Purpose

Provides the `PUT /account` (full replace) and `PATCH /account` (partial merge) handlers. Both operate exclusively on the authenticated caller's record and delegate all business logic — field merging, email-change verification flow, and audit logging — to `accountService.updateProfile`. The file exists solely to wire HTTP input parsing and response shaping around that service call.

## Key elements

- **`replaceAccount`** — Exported handler for `PUT /account`. Accepts a full `ReplaceAccountBody`; missing fields reset to defaults *except* `imageUrl` (see `keptWhenOmitted`).
- **`updateAccount`** — Exported handler for `PATCH /account`. Accepts a partial `UpdateAccountBody`; only supplied fields are changed.
- **`createUpdateController({...})`** — Shared factory call that builds both handlers. Notable options:
  - `idFrom`: always derives the target id from `request.authContext.id`; no client-supplied id is accepted.
  - `keptWhenOmitted: ['imageUrl']`: a PUT that omits the avatar preserves the existing one.
  - `input.booleans: ['analyticsConsent']`: coerces the string `"true"/"false"` that multipart uploads send into a real boolean.
  - `update`: passes the (possibly image-augmented) payload into `accountService.updateProfile` with the caller context.
  - `present`: maps the resolved user to an account DTO via `userService.toAccount`, reading the tenant role from `authContext.roles.tenant` (no extra lookup).

## Relationships

- **`@infrastructure/surfaces/create-update-controller`** — Provides the `createUpdateController` factory that assembles the replace/update pair, enforces schema validation, and invokes the `idFrom` / `update` / `present` callbacks defined here.
- **`@infrastructure/http/request`** — `callerContextOf` extracts the per-request context (IP, user-agent, etc.) forwarded into the service call for audit.
- **`@infrastructure/http/uploads`** — `writeWithUploadedImage` persists an uploaded avatar image and returns the resulting `{ imageUrl }` fragment that is spread into the service payload.
- **`@modules/account/services/index`** — `accountService.updateProfile` performs the actual merge, email-pending flow, and audit write. This controller holds no business rules beyond wiring.
- **`@modules/users/index` / `@modules/users/services/index`** — `userService.toAccount` shapes the final response DTO using the caller's tenant role (same pattern as `get-account.ts`).
- **`@modules/account/routes.ts`** — Registers `replaceAccount` and `updateAccount` under their respective HTTP methods, mounted behind the `isAuth` guard that guarantees `authContext` is populated.

## Notes

- `authContext` is accessed with a non-null assertion (`!`). This is safe *only* because every route mount places `isAuth` before these handlers; adding a new unauthenticated mount would break at runtime.
- Email-change side effects (pending-email record, verification link) are intentionally **not** handled here — they live inside `accountService.updateProfile`. Do not add them to this file.
- `imageUrl` is the one field that survives a PUT when omitted (`keptWhenOmitted`). All other fields in a PUT are treated as "set to default" when absent.
- The role/tenant used for the response DTO is read from the already-resolved `authContext.roles.tenant`, not re-fetched from the database.
