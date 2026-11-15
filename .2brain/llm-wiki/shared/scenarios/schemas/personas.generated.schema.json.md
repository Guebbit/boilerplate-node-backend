---
source: shared/scenarios/schemas/personas.generated.schema.json
sha256: 83d31c059ff7108eaafa7eb554f52f3bb61864252ab38bd9e395c545bd1429a2
generated_at: 2026-11-08T03:11:59.805806+00:00
model: ollama:qwen3.8:27b
---

# shared/scenarios/schemas/personas.generated.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates the shape of persona/account seed data used in scenario provisioning. It enforces a strict, closed structure for a set of named test accounts (admin, user, editor, moderator, unverified) so that scenario fixtures fail fast if a required field is missing or an unexpected property is introduced.

## Key elements

- **`staffTotpSecret`** – Optional top-level string (minLength 1) for a staff TOTP secret.
- **`accounts`** – Object mapping fixed persona keys (`admin`, `user`, `editor`, `moderator`, `unverified`) to account definitions. Each key is optional at the top level, but if present must satisfy the full account shape.
- **Account shape** (shared by every persona key) – All of the following are `required` and `additionalProperties: false`:
  - `email` – String with `format: "email"` **and** a strict regex pattern.
  - `username` – String, minLength 1.
  - `defaultPassword` – String, minLength 1.
  - `memberships` – Array of objects; each item requires `scope` (enum: `"tenant"` | `"platform"`) and `role` (string, minLength 1); `additionalProperties: false`.
  - `state` – Object with six **required** boolean/string fields (`verified`, `active`, `twoFactor`, `authenticator`, `pendingEmail`, `analyticsConsent`); `additionalProperties: false`. `pendingEmail` is `anyOf` (email-string | null).

## Relationships

No graph neighbors detected. This schema is consumed by whatever validation layer loads scenario fixtures; it does not import or export code itself.

## Notes

- Every persona key (`admin`, `user`, etc.) duplicates the identical account shape rather than using `$ref` or `allOf`/`$defs`. If the shape changes, **all** copies must be updated in lockstep.
- Email fields carry both `format: "email"` and an explicit `pattern`. Depending on the validator, `format` may be annotation-only; the `pattern` is the authoritative constraint.
- `additionalProperties: false` is set at the account, membership-item, and state levels—any extra key (even seemingly harmless metadata) will cause validation to fail.
- The file was truncated in the reviewed excerpt; additional persona keys beyond `unverified` may exist.
