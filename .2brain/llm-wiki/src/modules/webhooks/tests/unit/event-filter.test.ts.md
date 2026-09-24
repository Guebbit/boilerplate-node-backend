---
source: src/modules/webhooks/tests/unit/event-filter.test.ts
sha256: 7862df96676a85facaeb5662d22ec499d5e42d87309315e52fe09344d07cb594
generated_at: 2026-09-23T19:44:54.177954+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/event-filter.test.ts

## Purpose

Unit tests for the `matchesEventFilter` function and the `ALL_EVENTS` constant, verifying that event-name filtering (exact match, wildcard, and empty-filter edge cases) behaves as specified in the webhook domain.

## Key elements

- **`describe('matchesEventFilter')`** – Single test block covering five assertions:
  - Exact-name match returns `true`.
  - Absent name returns `false`.
  - Wildcard (`ALL_EVENTS`) matches any event name.
  - Empty filter array returns `false`.
  - `ALL_EVENTS` is the literal string `"*"`.

## Relationships

- **`src/modules/webhooks/domain/event-filter.ts`** – Provides `matchesEventFilter` and `ALL_EVENTS`, the two units under test. This file exercises its public contract.
- **`src/modules/webhooks/domain/index.ts`** – Barrel re-export; the test imports via `@modules/webhooks/domain`, resolving through this index rather than importing the filter module directly.

## Notes

- The wildcard is the single-character string `"*"`, not a regex or glob. A test asserts this literal value so that accidental redefinition (e.g., to `'*.*'`) is caught.
- Tests import from the barrel (`@modules/webhooks/domain`) rather than the leaf module, so they also implicitly verify that `index.ts` re-exports both symbols.
