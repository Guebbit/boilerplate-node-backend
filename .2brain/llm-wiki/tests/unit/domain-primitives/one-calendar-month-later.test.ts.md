---
source: tests/unit/domain-primitives/one-calendar-month-later.test.ts
sha256: f9439fbf4e9079b82cc5bcea4374970be870b4127ed680fdd43db4fd895dd761
generated_at: 2026-11-08T10:04:32.130802+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/domain-primitives/one-calendar-month-later.test.ts

## Purpose

Unit test for `oneCalendarMonthLaterUtc`, verifying that the EDPB-style "add one calendar month" calculation (Guidelines 01/2022 v2 ¶160, Ex. 32–33) correctly clamps to shorter months and handles year rollover.

## Key elements

- **`describe('oneCalendarMonthLaterUtc')`** — single test block; no setup/teardown.
- **`it.each` table (6 cases)** — parameterised assertions comparing `oneCalendarMonthLaterUtc(new Date(from)).toISOString()` against an expected UTC-midnight string:
  - Normal same-length month (Mar 5 → Apr 5)
  - Clamp to 30-day month (Aug 31 → Sep 30)
  - Clamp to 28-day February (Jan 31 → Feb 28)
  - Leap-year February (Jan 31 2028 → Feb 29)
  - Year rollover, mid-month (Dec 15 → Jan 15 next year)
  - Year rollover, end-of-month (Dec 31 → Jan 31 next year)

## Relationships

- **`src/domain-primitives/time.ts`** — source of the `oneCalendarMonthLaterUtc` function under test (imported via the `@domain-primitives/time` alias). This test is the primary behavioural contract for that export.

## Notes

- The function always returns **UTC midnight** (`T00:00:00.000Z`) regardless of the input's time-of-day; the test asserts this via the expected strings.
- The import uses the `@domain-primitives` path alias, not a relative path — keep in mind when searching for the implementation.
- The doc comment explicitly frames the *subject* as the clamp + rollover logic, not the trivial "same day next month" case.
