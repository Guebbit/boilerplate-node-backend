---
source: tests/unit/scripts/contracts/section-order.test.ts
sha256: 088f53d5b17d09bf4bba326cc20bd995397585431c6c534aeec25504b3370957
generated_at: 2026-11-08T10:35:06.881749+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/contracts/section-order.test.ts

## Purpose
Unit tests for the `orderSections` contract function. They verify that section ordering follows a preferred sequence, gracefully handles missing or extra modules, and produces a deterministic empty result — guarding the contract that other code relies on for section arrangement.

## Key elements
- **`describe('orderSections')`** — test suite block scoping all assertions to the single imported function.
- **`preferred` constant** (`['products', 'cart', 'users']`) — the fixed preference list used across every test case.
- **Test: keeps the preferred order** — asserts that when all preferred sections are present (regardless of input order), the output matches the preference list.
- **Test: drops a deleted section** — asserts that a preferred entry absent from the actual modules is omitted from the result.
- **Test: appends unknown modules alphabetically** — asserts that modules not in the preference list are sorted alphabetically and placed *after* the known preferred ones.
- **Test: empty input** — asserts an empty array in yields an empty array out.

## Relationships
- **`scripts/contracts/section-order.ts`** — the sole dependency. The test imports `orderSections` from this module and exercises its public contract. No other files are involved.

## Notes
- The "alphabetical" placement of unknown modules is a specific contract detail: they come *after* all known preferred sections, not interleaved. If the implementation changes to interleave or sort everything together, this test will catch the regression.
- The tests only cover the happy-path ordering rules; they do not test duplicate entries in the input array or case-sensitivity of section names.
