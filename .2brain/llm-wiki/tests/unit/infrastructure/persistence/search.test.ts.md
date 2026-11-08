---
source: tests/unit/infrastructure/persistence/search.test.ts
sha256: eac83e1185cc2e6fc3101ddcb304972ba2f66e8c41fbd3616c9bafdbd22718fa
generated_at: 2026-11-08T10:22:37.049165+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/search.test.ts

## Purpose
Unit tests for the `readAll` shared pager, verifying its page-by-page loop: when it continues fetching, when it stops, and how it handles boundary cases (empty first page, exact-multiple totals). The file exists to lock in the contract that `personalData.collect` exports rely on when they iterate over paginated data.

## Key elements
- **`describe('readAll')`** — single test block covering four scenarios:
  - *Short single page*: returns the items and makes exactly one `fetchPage(1)` call.
  - *Full pages then short page*: pages 1 → 2 → 3; concatenates results; stops on the first page whose length < `pageSize`.
  - *Empty first page*: treated as a short page; stops after one call with `[]`.
  - *Exact multiple of pageSize* (e.g. 2 items, pageSize 2): makes a **second** call that returns `[]` to confirm the end; final result is the two items.
- **`readAll` (imported)** — the function under test, called with a `fetchPage` mock and a numeric `pageSize`.

## Relationships
- **`src/infrastructure/persistence/search.ts`** — provides `readAll`, the sole import in this file. The tests exercise only that one export; no other module is touched.

## Notes
- The stop condition is *page length < pageSize*, not "page is empty." An empty page is just the degenerate short-page case, which is why the "exact multiple" test expects an extra round-trip.
- `fetchPage` is always called with a 1-based page number (`1, 2, 3…`), asserted explicitly in test 2.
- The docblock at the top explains *why* `readAll` exists (replaces per-module page-size caps that silently truncated) but does not add behavior beyond what the tests assert.
