---
source: src/modules/account/services/export.ts
sha256: 737494bea43366b398831f7b30ce5e45b1539649935d8b0fceaa7b922d088b60
generated_at: 2026-09-23T18:08:40.790595+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/services/export.ts

## Purpose

Implements the business logic for `POST /account/export` (GDPR Art. 15/20 data portability). It assembles the caller's personal data by invoking every registered `PersonalDataSection.collect()` in parallel, then returns a single JSON envelope. It deliberately owns no data reads itself; all data is sourced from the contributing modules' own sections via a registry.

## Key elements

- **`exportOwnData(userId, email, context)`** — The sole export. Calls every section in `personalDataSections()` concurrently via `Promise.all`, filters out sections that resolved `undefined` (opt-out), verifies the mandatory `profile` section exists (404 + i18n message if absent), records a success audit event, and wraps the result with `generateSuccess` alongside an `exportedAt` ISO timestamp.
- **`AccountExportPayload`** — A loose `Record<string, unknown> & { exportedAt: string }` type. The concrete shape is defined externally in `shared/contracts/openapi.root.yaml`; this file cannot statically know sibling sections' types.
- **`PROFILE_SECTION`** — Constant `'profile'`, the key the `profile` module must register under. Used for the mandatory-presence check.

## Relationships

- **`./personal-data-registry.ts`** — Provides `personalDataSections()`, the list of `{ section, collect }` entries. This is the only mechanism by which contributing modules' data reaches this file without direct imports.
- **`../audit.ts`** — Supplies `accountAuditActions.AUTH_DATA_EXPORTED`, the action identifier stamped into the audit record.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` build the HTTP response envelope; `ResponseSuccess` / `ResponseReject` are the return types.
- **`@infrastructure/observability/audit`** — `recordAudit` emits the audit event (action + outcome) for the export call.
- **`@infrastructure/i18n`** — `t()` localises the 404 "user not found" message.
- **`@types` (`auth-context`)** — `CallerContext` carries the caller's identity/context into the audit call.
- **`controllers/post-account-export.ts`** — The HTTP controller that extracts `userId`/`email` from the authenticated request (via `requireFreshAuth`) and delegates to `exportOwnData`.

## Notes

- **`undefined` ≠ rejection.** A section that resolves `undefined` is silently omitted from the payload (used e.g. by the `feedback` module's opt-out flag). A section that *rejects* fails the entire request via `Promise.all`. An incomplete Art. 15 response must never be indistinguishable from a complete one.
- **No static response typing.** Because the set of contributing sections is dynamic (registry-driven), the payload type is intentionally loose. Contract enforcement happens at the OpenAPI schema validation layer, not in this file.
- **Email is passed separately from `userId`.** The `feedback` section (which also serves users without an account) matches rows by email rather than by a stable account id, so both identifiers are supplied to every section's `collect(subject)` call.
- **File placement is deliberate.** It sits beside `profile.ts` and `authentication.ts` in the account module but is explicitly *not* an auth concern (identity is handled by `requireFreshAuth` on the route) nor a mutation.
