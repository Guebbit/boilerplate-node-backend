---
source: src/modules/users/services/role-refusal.ts
sha256: 37f73457a479b2fac842cca826b75c484448070e4510e89daf9e8003c48af1bf
generated_at: 2026-10-29T06:18:30.465624+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/services/role-refusal.ts

## Purpose

Maps a `GrantRefusal` produced by the access layer into the appropriate HTTP rejection payload (403 or 422) so that the admin create and update user flows can share a single, consistent "role could not be granted" response.

## Key elements

- **`roleRefusalReject(refusal: GrantRefusal): ResponseReject`** – The sole export. Branches on `refusal.kind`:
  - `'not_granter'` → delegates to `roleManagementRequired()` (a 403 `ROLE_MANAGEMENT_REQUIRED` response).
  - Any other kind → builds a 422 via `generateReject` with a single `fieldError` on the `role` field, using the i18n key `users.role-not-assignable`.

## Relationships

- **`@infrastructure/http/response`** – Supplies the `generateReject`, `fieldError` helpers and the `ResponseReject` return type used to construct both rejection branches.
- **`@infrastructure/i18n`** – Provides the `t()` translation function for the 422 field message.
- **`@modules/access`** (via `services/grants.ts` / `services/protection.ts`) – Source of the `GrantRefusal` type and the `roleManagementRequired()` factory called in the 403 branch.
- **`services/create.ts`** / **`services/update.ts`** – The two callers; both invoke `roleRefusalReject` when the access service signals a refused role grant during user creation or update.

## Notes

- The internal refusal sentence is deliberately never surfaced to the client; only the translated field message (422) or the standard 403 body is returned.
- There is no additional logging or audit here—that concern lives upstream in `grantRefusalAudited` (access module). This file is purely a response-shaping utility.
