---
source: src/modules/addresses/tests/integration/fixtures.ts
sha256: 98792d3a304d5beb524735bc2cdd2371b620f0ef4150adacfac08cdbfb286ada
generated_at: 2026-11-08T04:57:45.091926+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/fixtures.ts

## Purpose

Shared test fixtures providing two fully-specified address objects used by the address-book and checkout integration suites. Exists so both test files reference identical data rather than duplicating inline literals.

## Key elements

- **`HOME`** — A home address (label `'home'`) for *Ada Lovelace*, 1 Via Roma, Modena 41121, IT.
- **`OFFICE`** — A second address (label `'office'`) for the same person, 2 Via Milano, Modena 41122, IT.

## Relationships

- Imported by `addresses.test.ts` — used as the canonical addresses the suite creates, reads, and asserts against.
- Imported by `checkout.test.ts` — supplies the shipping/billing address payloads for checkout flow assertions.

## Notes

- Both fixtures share `fullName` and `city`; they differ only in `label`, `street`, and `zip`. Tests that distinguish the two rely on those three fields.
- The `label` values (`'home'`, `'office'`) are the identifiers the address book uses to look up or update an entry; treat them as the logical key, not just display text.
