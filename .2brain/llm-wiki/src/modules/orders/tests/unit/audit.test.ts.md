---
source: src/modules/orders/tests/unit/audit.test.ts
sha256: e45f0f789c04bf9bcdc5cad46fa9a1d5c11eb2b1a048c1caa411e2551eacbe59
generated_at: 2026-09-23T19:12:52.922151+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/audit.test.ts

## Purpose

Contract test that pins the `ordersAuditActions` string vocabulary byte-for-byte. The action strings are a **wire contract** consumed by external log-query dashboards and alert rules (outside this repo), so this test guards against accidental renames, value changes, or silent additions/removals of actions.

## Key elements

- **`ordersAuditActions`** (imported from `../../audit`) — the constant object under test; maps semantic names (`ORDER_CREATED`, etc.) to dotted wire strings (`order.created`, etc.).
- **`describe('the orders audit vocabulary')` / `it('spells every action…')`** — a single assertion using `toEqual` for whole-object equality, which catches both a changed value _and_ an undocumented key added or removed.

## Relationships

- **`src/modules/orders/audit.ts`** — sole import. This test is the only file in the graph that asserts the shape and values of `ordersAuditActions`; no other neighbor depends on this test file.

## Notes

- `toEqual` (not `toMatchObject` or `toStrictEqual`) is deliberate: it enforces exact key-set equality, so a new action appearing in `audit.ts` without a matching entry here will fail the test.
- The strings are read by tooling _outside_ this repository; treating them as free-form identifiers rather than a contract is the primary risk this test prevents.
- No mocking, fixtures, or test helpers are used — the import is the only external dependency.
