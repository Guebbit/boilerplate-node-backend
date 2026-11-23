---
source: shared/scenarios/schemas/personas.generated.schema.json
source_sha256: 83d31c059ff7108eaafa7eb554f52f3bb61864252ab38bd9e395c545bd1429a2
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:28:50.586375+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/scenarios/schemas/personas.generated.schema.json

## Purpose
A generated JSON Schema (draft 2020-12) describing the shape of a "personas" scenario data object: a staff TOTP secret plus a set of named test accounts. It lets tooling validate persona/account fixtures used in scenarios. The `.generated` name suggests it is produced from another source (likely a typed schema) and should not be edited by hand.

## Key elements
- **`staffTotpSecret`**: non-empty string.
- **`accounts`**: object keyed by persona name. Visible keys are `admin`, `user`, `editor`, `moderator`, and `unverified`; the file may define more beyond what is shown here.
- **Per-account fields** (identical structure for every persona):
  - `email`: string with `format: email` and a regex `pattern`.
  - `username`: non-empty string.
  - `defaultPassword`: non-empty string.
  - `memberships`: array of `{ scope, role }`, where `scope` is `"tenant"` or `"platform"` and `role` is a non-empty string.
  - `state`: object with booleans `verified`, `active`, `twoFactor`, `authenticator`, and `analyticsConsent`, plus `pendingEmail`, which is an email string or `null`.
- All account objects, `memberships` items, and `state` objects set `additionalProperties: false`, and every listed field is required.

## Relationships
No graph neighbors are listed, so no dependencies or consumers are visible from this file.

## Notes
- The account schema is inlined and repeated for each persona rather than shared through `$ref`/`$defs`. This is typical of generated output, so changes belong in the generator source, not here.
- The email regex is applied alongside `format: email`, so validation does not depend on the validator's format handling.
- `pendingEmail` is required but nullable (`anyOf` email or `null`).
- `defaultPassword` and `staffTotpSecret` are stored as plain strings in the persona data, so this is test or scenario data and not real credentials.
