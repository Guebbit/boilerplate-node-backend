---
source: src/infrastructure/config/shared-rules/audit-actions.ts
source_sha256: d085b4be61d6ab5a6c8e363b3599c4e4d3fd6f2f8e2db107a102235e05f40fca
context_sha256: fd3ff3df948ee8d0a5a36c5bd22b0d718955c21f91f955171c3ce1b7d495f68a
generated_at: 2026-11-22T02:44:27.865170+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/shared-rules/audit-actions.ts

## Purpose
Defines the Zod schema for `shared/rules/audit-actions.yaml`, which lists audit actions that don't belong to any module. It validates that file's structure so malformed action names are rejected when the rules are loaded.

## Key elements
- `auditActionsSchema`: a `z.strictObject` (unknown keys are rejected) with a single field, `actions`.
- `actions`: built with `keyedListSchema`, using the regex `/^security(\.[a-z][\d_a-z]*){1,3}$/`. Each entry must be a dotted string that starts with `security`, followed by 1–3 segments. Each segment starts with a lowercase letter and may contain lowercase letters, digits and underscores.

## Relationships
- Imports `keyedListSchema` from `./generate-spec`, which supplies the keyed-list schema factory. This file only passes it the pattern for valid keys.
- `registry.ts` is a graph neighbor. Nothing in this file's content shows how it interacts with it.

## Notes
- The `security.` prefix is what reaches the platform operator's alerts. Naming an action under `security.*` therefore has alerting consequences.
- The module comment says to use relative imports only, as explained in `load.ts`. Don't switch to path aliases here.
