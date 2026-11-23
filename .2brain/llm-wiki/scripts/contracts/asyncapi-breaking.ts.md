---
source: scripts/contracts/asyncapi-breaking.ts
generated_at: 2026-11-22T01:52:57.651409+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/contracts/asyncapi-breaking.ts

## Purpose
Holds the classification half of the AsyncAPI breaking-change gate. It compares two dereferenced AsyncAPI documents with `@asyncapi/diff` and returns the changes a subscriber would feel, minus breaks the maintainers have explicitly acknowledged. It is split out of `check-asyncapi-breaking.ts` so tests can import it without running the CLI's top-level git and process-exit flow.

## Key elements
- `breakingChanges(before, after, acknowledged = ACKNOWLEDGED_BREAKS)`: runs `diff(before, after, { override: OVERRIDES }).breaking()`. It keeps the result only if it is an array, otherwise returns `[]`. It then drops any item whose `path` exactly matches an acknowledged entry. Returns `DiffOutputItem[]`, empty when nothing breaks.
- `AcknowledgedBreak` (exported interface): `{ path, reason }`, where `path` is the JSON pointer the diff reports and `reason` is a one-line answer to who the break affects and what they do.
- `ACKNOWLEDGED_BREAKS` (module-private): the maintainers' list of deliberate breaks. It currently has two entries for the US-spelling rename `cancelled` → `canceled`: `/operations/webhookOrderCancelled` and `/channels/order.cancelled`.
- `OVERRIDES` (module-private): overrides to the diff standard. Add, remove and edit of `/info/version` are all `non-breaking`.

## Relationships
- `check-asyncapi-breaking.ts` is the CLI that drives this module. The header comment says this file is the classification half of it, and the CLI does the git and process-exit work.
- `tests/unit/scripts/contracts/asyncapi-breaking.test.ts` is the test that exercises `breakingChanges` directly. The `acknowledged` parameter exists so a test can pass its own list instead of the maintainers' one.

## Notes
- `/info/version` is overridden because the default standard treats a version edit as breaking, which would make every version bump fail the gate.
- The option key is `override` (singular). The `@asyncapi/diff` README says `overrides`, but the code reads `override`.
- `.breaking()` is typed as a union of output formats. The JSON default is an array, hence the `Array.isArray` guard and cast.
- Acknowledgement matches the exact JSON pointer only. The in-file comment says to delete an entry once the change has reached `origin/main`, since the gate compares against that anyway.
- Inputs are expected to be dereferenced AsyncAPI documents, in the JSON form of a parsed document (the doc comments name this form as `parsed.json()`).
