---
source: src/modules/orders/tests/integration/invoice-numbering.test.ts
sha256: 9a8f870e65e0ac230829e220caf1f12d9f8224ed73939a0c15442b92132e5990
generated_at: 2026-09-23T19:10:35.521201+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/invoice-numbering.test.ts

## Purpose

Integration test verifying that `allocateInvoiceNumber` produces unique, gap-free, year-scoped invoice numbers under both serial and concurrent load. It is explicitly integration (not unit) because the atomicity guarantee lives in a single `findOneAndUpdate` against a real MongoDB instance—behavior that is unprovable with a mock.

## Key elements

- **`parse(invoiceNumber)`** — local helper that splits a `"{year}-{sequence}"` string into a `[number, number]` pair for assertions.
- **"formats the first number of a year as {year}-000001"** — asserts the initial sequence value and the padded string format.
- **"advances the sequence by one on every call, serially"** — three sequential calls must yield sequences 1, 2, 3.
- **"gives every concurrent caller a unique number, with no gap in the sequence"** — fires 50 calls via `Promise.all`; asserts no duplicates and no skipped values (i.e., the set equals exactly 1…50).
- **"starts a fresh sequence at 1 for a new UTC year, leaving the old year untouched"** — uses `jest.useFakeTimers` (faking only `Date`) to cross a year boundary, asserts the new year starts at 1, then confirms the original year's counter resumes where it left off.

## Relationships

- **`src/modules/orders/services/invoice-numbering.ts`** — the system under test; provides the `allocateInvoiceNumber` function exercised by every case here.
- **`tests/support/setup-test-db.ts`** — imported and called once at module scope (`setupTestDb()`) to spin up a real MongoDB instance before any test runs.

## Notes

- The fake-timers test deliberately excludes `setTimeout`, `setImmediate`, `nextTick`, `queueMicrotask`, and other I/O timers from faking (`doNotFake` list). Faking them would freeze the MongoDB driver's internal timers and cause a hang. Only `Date` (system time) is faked.
- The year-rollover test is wrapped in `try/finally` to restore real timers, even if the assertion throws.
- The concurrency test relies on `Promise.all` with no interleaved `await` between calls; a read-then-increment race (i.e., non-atomic implementation) would surface as either a duplicate or a gap in the sequence array.
- Sequence padding is six digits (`000001`), not four—asserted implicitly by the exact-string match in the first test.
