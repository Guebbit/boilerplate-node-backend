---
source: src/modules/account/services/export.ts
sha256: d4b0908989df7abb0daf546ba22f609b531a34f8daf39c1bed7d56a768470a36
generated_at: 2026-09-27T14:29:16.326715+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export.ts

## Purpose

Implements the `POST /account/export` service (GDPR Art. 15/20): assembles the caller's personal data from every registered `PersonalDataSection` into a single JSON envelope. It deliberately has no data reads of its own—each section's shape is produced by the owning module's `collect`, keeping this file decoupled from sibling modules.

## Key elements

- **`exportOwnData(userId, email, context)`** — the sole export. Runs all registered sections concurrently via `Promise.all`, checks that the mandatory `profile` section is present (404 if not), drops sections that resolved `undefined` (opt-out pattern), records an audit event, and wraps the result in `generateSuccess` with an `exportedAt` timestamp. Returns a `Promise` of `ResponseSuccess<AccountExportPayload> | ResponseReject`.
- **`AccountExportPayload`** (local type) — `Record<string, unknown> & { exportedAt: string }`. Intentionally *not* the OpenAPI contract type; the envelope is validated against the contract downstream, since this file cannot statically know every contributing module's schema.
- **`PROFILE_SECTION`** (const) — the string `'profile'`, the key the profile module must register under. Used for the 404 guard.

## Relationships

- **`./personal-data-registry.ts`** — provides `personalDataSections()`, the registry of all contributing sections. This file never imports individual sibling modules.
- **`../audit.ts`** — provides `accountAuditActions.AUTH_DATA_EXPORTED`, the action identifier passed to `recordAudit`.
- **`@infrastructure/http/response`** — supplies `generateSuccess` / `generateReject` and the `ResponseSuccess` / `ResponseReject` types used in the return signature.
- **`@infrastructure/observability/audit`** — supplies `recordAudit`, called once on the success path.
- **`@infrastructure/i18n`** (index + context) — supplies the `t` translation function used for the 404 error message.
- **`@types`** (index / auth-context) — supplies the `CallerContext` type used as the third parameter.
- **`../controllers/post-account-export.ts`** — the route handler that invokes `exportOwnData` after authentication (`requireFreshAuth`) and passes the caller's `userId`, `email`, and request context.

## Notes

- A section resolving `undefined` is **silently omitted** from the payload (the `feedback` module's opt-out mechanism). A section that **rejects** instead fails the entire request. Do not conflate the two.
- The 404 check is only for the `profile` section. All other sections are optional; their absence is a valid, partial export.
- This file performs **no reads and no writes** to any database or repository. All data access lives in each owning module's `collect` implementation.
- The OpenAPI contract for the response (`AccountExportResponse`) lives in `shared/contracts/openapi.root.yaml` and is assembled from each module's own schema fragment—this file is not the source of that type.
