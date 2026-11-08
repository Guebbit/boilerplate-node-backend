---
source: src/modules/users/services/role-refusal.ts
sha256: 37f73457a479b2fac842cca826b75c484448070e4510e89daf9e8003c48af1bf
generated_at: 2026-11-08T08:51:55.361579+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/role-refusal.ts

## Purpose

Maps a refused role grant (from the access layer) to an HTTP rejection response. It encodes the two distinct failure modes—granter lacking the `assign:Role` permission (→ 403) versus a role name that is not assignable (→ 422 with a `role` field error)—so that the user create and update services share one consistent rejection shape.

## Key elements

- **`roleRefusalReject(refusal: GrantRefusal): ResponseReject`** — The sole export. Branches on `refusal.kind`:
  - `'not_granter'` → returns the pre-built 403 `ROLE_MANAGEMENT_REQUIRED` rejection from the access module.
  - Otherwise → generates a 422 rejection with a single field error on `role`, whose message comes from the i18n key `users.role-not-assignable`.

## Relationships

- **`src/infrastructure/http/response.ts`** — Provides `fieldError`, `generateReject`, and the `ResponseReject` type used to build the 422 response.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — Provides the `t` translation function for the human-readable field error message.
- **`src/modules/access/index.ts`** — Re-exports `roleManagementRequired` (the 403 builder) and the `GrantRefusal` type consumed here.
- **`src/modules/access/services/grants.ts`** — Source of `grantRefusalAudited`, the function whose refusal result is passed into `roleRefusalReject`.
- **`src/modules/users/services/create.ts`** and **`update.ts`** — Consumers; both call `roleRefusalReject` when a role grant is denied during user creation or update.

## Notes

- The internal refusal detail (the "why" sentence from the access layer) is **never** surfaced to the client; only the translated field message or the standard 403 body is returned.
- The 422 response always attaches the error to the `role` field specifically—callers can rely on that shape in API error handling.
