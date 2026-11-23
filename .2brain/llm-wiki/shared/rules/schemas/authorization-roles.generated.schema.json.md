---
source: shared/rules/schemas/authorization-roles.generated.schema.json
source_sha256: c74dc46d40139e580de5b004aec981ab6c65390335e0c17c223be1060ca548a9
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:27:04.237012+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/authorization-roles.generated.schema.json

## Purpose
A generated JSON Schema (draft 2020-12) that describes the shape of an authorization-roles configuration document. It defines the roles available in the system, plus the permissions granted to three built-in audiences (guest, unverified, customer). The `.generated` name suggests it is produced by tooling and not meant to be edited by hand.

## Key elements
- **Top level** is an object. `version` (number), `roles` and `audience` are all required. No other properties are allowed (`additionalProperties: false`).
- **`roles`** is an array of role objects:
  - `name`, `title` and `description` are strings.
  - `scope` is an enum of `"tenant"` or `"platform"`.
  - `sets` is an array of strings, and `assignable` is an optional boolean.
  - Required: `name`, `scope`, `title`, `description`, `sets`.
- **`audience`** is an object with three required keys: `guest`, `unverified` and `customer`.
  - Each has the same shape: `title`, `description` and `sets` (an array of strings), all required.
  - Extra properties are not allowed.

## Relationships
No graph neighbors. Nothing in the dependency graph imports or references this file, and it has no references to other files.

## Notes
- Every object level sets `additionalProperties: false`, so unknown keys fail validation.
- `assignable` is the only optional field on a role. It is not part of the `audience` entries.
- `sets` entries are plain strings. The schema does not say what they refer to, for example permission sets, or whether their values are validated elsewhere.
- Changes should go through whatever generates this file, so manual edits may be overwritten. The generator is not visible here.
