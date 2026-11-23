---
source: shared/rules/schemas/cookies.generated.schema.json
source_sha256: 544b6cc6bd0f2453a2f86eb92dbd4fa3c3e0511a4db6b173279a05fbca9d886f
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:27:15.440169+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/schemas/cookies.generated.schema.json

## Purpose
A generated JSON Schema (draft 2020-12) that validates a registry of cookies and browser-storage entries. It defines the allowed shape of a document with a single top-level `cookies` object, so each entry must declare its name, who sets it, what it is for, and how necessary it is.

## Key elements
- **`cookies`** (required, only top-level property): an object map of entries. Keys must match `^[a-z][A-Za-z0-9]*$` (camelCase, starting with a lowercase letter). Each value is an object with no extra properties allowed.
- **Required entry fields:**
  - `name`: non-empty string.
  - `setter`: one of `backend`, `frontend`, `library`.
  - `kind`: one of `cookie`, `localStorage`, `sessionStorage`.
  - `purpose`: non-empty string.
  - `necessity`: one of `necessary`, `preference`.
  - `secret`: boolean.
- **Optional entry fields:**
  - `maxAgeMs`: positive integer, at most 9007199254740991.
  - `lifetime`: one of `sessionTier`, `challenge`.

## Relationships
No graph neighbors. Nothing in the dependency graph is shown importing or referencing this file.

## Notes
- The `.generated` suffix suggests the schema is produced by tooling. Edit the source rather than this file. The source is not visible here.
- `additionalProperties: false` is set at both the root and the entry level, so unknown keys are rejected.
- The entry key (the camelCase identifier) is separate from `name`, which holds the actual cookie or storage key.
