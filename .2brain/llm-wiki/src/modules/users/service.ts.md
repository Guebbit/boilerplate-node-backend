---
source: src/modules/users/service.ts
sha256: 9ccfa5f9683b2fba9e2d5d7cd158519985cf75bf46f2f658d3f65c56a115ecdc
generated_at: 2026-09-23T19:34:35.889550+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/service.ts

## Purpose

The user-document service: admin-facing CRUD and search, plus the named identity operations that `account` delegates to for authenticating, registering, verifying, and 2FA-protecting a user. It enforces only what the user document itself requires; all HTTP orchestration, sessions, emails, rate-limiting, and anti-automation logic live in `account`.

## Key elements

- **`validateData`** — Validates user input against `zodUserSchema` (with `.strip()` to tolerate an `id` field in PUT bodies). Returns UI-friendly `ResponseErrorItem[]`; empty array means valid.
- **`search`** — Delegates to `userRepository.search` for the admin panel; returns `{ items: UserWire[], meta: PaginatedMeta }`.
- **`getById`** — Fetches a single user document by ID; resolves `undefined` when no ID is supplied.
- **`toUserContract`** (internal) — Resolves the user's current role from the membership store via `rolesOf` and applies `toUser` in one step, so controllers don't chain the two calls.
- **`enqueueIfPending`** — Calls `enqueueIfImagePending` to kick off the image-processor worker when a write carried a pending upload.
- **`create`** — Admin user creation. Checks operator-supplied password against the breach list, generates a random 32-byte hex password when none is given, persists the document, assigns the role via `assignRole` (compensating-delete on failure), records audit, emits analytics, and optionally fires `USER_SETUP_REQUESTED`.
- **`update`** — Admin user update. Same result-envelope protocol as `create`. Accepts extra fields (`thumbnailUrl`, `pendingImageKey`, `analyticsConsent`) that are not part of the admin wire contract. Delegates role changes through `assignRole` with the caller's permissions as the grantor boundary.

## Relationships

- **`src/modules/access/index.ts`** — Calls `assignRole`, `assertCanGrant`, `revokeAllOf`, `rolesOf` and uses `VERIFIED_CUSTOMER_ROLE` for the default role on admin-created users. Role membership is the only grant mechanism (no column beside it).
- **`src/kernel/access/tenant.ts`** — Supplies `DEPLOYMENT_TENANT_ID`, the tenant scope passed to every role lookup/assignment.
- **`src/kernel/events.ts`** — Emits `USER_SETUP_REQUESTED` (and `USER_DELETED` per the import) domain events.
- **`src/infrastructure/security/breached-passwords/index.ts`** — `assertPasswordNotBreached` gates both `create` and `update` before any write.
- **`src/infrastructure/security/pii-encryption.ts`** — Imports `encryptPii` (used in identity-operation paths below the truncated region).
- **`src/infrastructure/http/response.ts`** — Provides `generateSuccess`, `generateReject`, `validationErrors`, and the `ResponseSuccess`/`ResponseReject` envelope types used by every exported function.
- **`src/infrastructure/i18n/index.ts`** — Imports `t` for user-facing messages.
- **`src/infrastructure/adapters/image.worker.ts`** — `enqueueIfImagePending` drives the deferred image-processing queue after a create or update carries a pending upload.
- **`src/infrastructure/adapters/image-store.ts`** — `imageStore` used for image read/write in the upload flow.
- **`src/infrastructure/observability/analytics/index.ts`** — `emitAnalyticsEvent` + `buildAnalyticsBase` for the `USER_CREATED` funnel event.
- **`src/infrastructure/observability/audit.ts`** — `recordAudit` logs admin actions with the caller's `CallerContext`.
- **`src/infrastructure/persistence/search.ts`** — `PaginatedMeta` type for the search result envelope.

## Notes

- `validateData` applies `.strip()` *only* at this boundary so that a PUT body carrying `id` (row identity) passes; `zodUserSchema` itself stays strict for `signup` and `PUT /account`, which must reject undeclared fields.
- When no operator-supplied password is given in `create`, a 32-byte random hex string fills the required field — the account is effectively locked until a real password is set, and no setup email is sent unless `sendSetupEmail` is explicitly true.
- A failed `assignRole` in `create` triggers a **compensating delete** of the already-persisted user row rather than pre-validating the escalation, because pre-validation would skip the audit trail that `assignRole` itself produces.
- `analyticsConsent` rides along in `update` but is deliberately absent from the admin `UpdateUserByIdRequest` contract — consent is the data subject's own right, set only by `account`'s self-service path.
- The module doc describes three regions in file order: admin CRUD/search (visible above), identity operations, and the inactivity reaper's reads (both below the truncated region).
