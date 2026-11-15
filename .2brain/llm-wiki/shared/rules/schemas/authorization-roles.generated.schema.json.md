---
source: shared/rules/schemas/authorization-roles.generated.schema.json
sha256: c74dc46d40139e580de5b004aec981ab6c65390335e0c17c223be1060ca548a9
generated_at: 2026-11-14T17:46:48.583784+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/schemas/authorization-roles.generated.schema.json

## Purpose

JSON Schema (draft 2020-12) that validates the structure of an authorization-roles configuration document. It enforces the shape of the top-level object, each role entry, and the three fixed audience tiers so that any consumer (runtime loader, validation tool, or editor) can reject malformed role definitions early.

## Key elements

- **`version`** – numeric field identifying the schema/roles revision.
- **`roles`** – array of role objects. Each role must carry `name`, `scope` (`"tenant"` | `"platform"`), `title`, `description`, and `sets` (string array of permission identifiers). `assignable` (boolean) is optional.
- **`audience`** – object with exactly three required keys (`guest`, `unverified`, `customer`). Each sub-object defines `title`, `description`, and `sets` (string array) for that identity tier.
- **`additionalProperties: false`** at every level – unknown keys are rejected, keeping the contract closed.

## Relationships

No graph neighbors were detected. This file is a standalone schema artifact; other modules import it by path rather than through a tracked dependency edge.

## Notes

- The filename contains `.generated.`, signalling it is produced by a build/codegen step. Do not edit by hand; make changes to the source generator instead.
- `scope` is a two-value enum (`tenant`, `platform`). Adding a new scope value requires a schema bump.
- `assignable` is the **only** optional field on a role; all other role properties are required.
- `additionalProperties: false` is applied at the top level, each role item, the audience object, and each audience tier. Any new field must be added to the schema before it can appear in data.
