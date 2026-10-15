---
source: tests/unit/scripts/contracts/asyncapi-breaking.test.ts
sha256: 8d415b971548a50d09a6ecb40791bc534cfe61fa2c9cbe06943e2af2b2cae209
generated_at: 2026-10-15T13:25:37.912983+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/asyncapi-breaking.test.ts

## Purpose

Unit tests for the `breakingChanges` function in the AsyncAPI contract-diffing script. Verifies which structural changes between two AsyncAPI 3.0.0 documents are classified as breaking for subscribers, and that both version-bump noise and explicitly acknowledged breaks are excluded from the result.

## Key elements

- **`document(version, channels?)`** — local factory that builds a minimal AsyncAPI 3.0.0 document (one `info` block, one or more channels). Defaults the channel map to `{ 'order.created': {} }` when omitted.
- **`describe('breakingChanges')`** — six test cases covering:
  - Version-only changes (up or down) are non-breaking.
  - Removing a channel a subscriber depended on is breaking (reported at `/channels/<name>`).
  - A simultaneous version bump does not mask a channel-removal break.
  - A caller-supplied `acknowledged` array (third argument, `[{ path, reason }]`) suppresses only the exact path listed.
  - The `order.shipped` → empty-channels transition is treated as non-breaking *without* an explicit acknowledgment argument, implying the function carries built-in knowledge of that specific replacement.

## Relationships

- **`scripts/contracts/asyncapi-breaking.ts`** — the module under test. The test imports `breakingChanges` and asserts on its returned array of `{ path, … }` objects. No other imports or side effects.

## Notes

- The test suite relies on the `document` helper's default channel (`order.created`) to distinguish "removed" from "replaced" scenarios; swapping the default would change which tests exercise the acknowledgment path.
- Test 6 (`order.shipped`) passes no third `acknowledged` argument yet expects an empty result, so the suppression logic for that channel lives inside `breakingChanges` itself rather than at the call site. Anyone adding a new "expected replacement" channel should add a matching test here and check whether it needs the same internal handling.
- Acknowledgment matching is exact-path (JSON-pointer) based, as shown by test 5 where only `/channels/order.created` is filtered while `/channels/order.paid` still appears.
