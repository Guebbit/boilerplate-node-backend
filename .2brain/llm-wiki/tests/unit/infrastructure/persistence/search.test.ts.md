---
source: tests/unit/infrastructure/persistence/search.test.ts
sha256: eac83e1185cc2e6fc3101ddcb304972ba2f66e8c41fbd3616c9bafdbd22718fa
generated_at: 2026-09-23T20:25:52.749501+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/persistence/search.test.ts

## Purpose

Unit tests for the shared `readAll` pager that all `personalData.collect` exports use to fetch paginated data. The suite exists to pin down the loop's stopping rule — a short page is the *only* signal to stop — so that no module regresses to a per-module page-size cap that silently truncates results.

## Key elements

- **`describe('readAll')`** — single test group with four cases:
  - *Single short page*: one `fetchPage` call, returns items directly.
  - *Multi-page loop*: pages of exactly `pageSize` are followed by a short page; iterator calls pages 1, 2, 3 in order and concatenates results.
  - *Empty first page*: stops immediately after one call, returns `[]`.
  - *Exact multiple of `pageSize`*: a full last page does **not** confirm the end; a second call must return an empty page to stop the loop.

## Relationships

- **`src/infrastructure/persistence/search.ts`** — the sole import target. The test file imports `readAll` and exercises its public contract (signature: `readAll(fetchPage: (page: number) => Promise<T[]>, pageSize: number) => Promise<T[]>`). No other modules are referenced.

## Notes

- The "exact multiple" test encodes an intentional design decision: `readAll` cannot distinguish "full page that is also the last page" from "full page with more to come" without an extra fetch. This is the behavior callers must expect (one extra API call at the boundary).
- `fetchPage` is always mocked with `jest.fn()`; the tests never hit the network. Page numbers are 1-based (`fetchPage` is called with `1`, `2`, `3`, …).
- The file-level docblock references `search.ts`'s own docblock for the full rationale — read that comment if the "why short page" rule is unclear.
