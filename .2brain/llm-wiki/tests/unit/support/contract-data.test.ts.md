---
source: tests/unit/support/contract-data.test.ts
sha256: 772021fbaf0d603f5adb082ad603f491778eefe5bbecb26bc1d5c0a4b373a2b2
generated_at: 2026-09-23T20:32:12.727301+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/contract-data.test.ts

## Purpose

Regression test that pins the `format: email` behavior of the payload generator in `tests/support/contract-data.ts`. It exists because a single hand-picked sample shape (`word@example.com`) had previously masked two bugs (plus-tags and 8+ character TLDs being rejected by the email regex). By drawing 200 samples, it guarantees the generator's random selection actually exercises every shape it claims to support.

## Key elements

- **`SAMPLE_COUNT`** (200) — number of random draws per test; chosen so a 4-way random pick hits every shape with near-certainty.
- **`contract-data — email format`** (describe block) — scopes all assertions to the email field of the generator.
- **Test: "generates a plus-tag, an 8+ character TLD, and a subdomain…"** — draws 200 payloads, asserts at least one contains `+`, one has a TLD of 8+ alphabetic chars, and one has a subdomain (two dot-separated local parts before the TLD).
- **Test: "never emits a value the schema itself rejects"** — iterates 200 draws and confirms each generated email passes `z.email()` via `safeParse`, guarding against generator/schema drift.

## Relationships

- **`tests/support/contract-data.ts`** — the module under test. This file imports `validPayload` from `@tests/contract-data` and asserts properties of the email values it returns. No other files depend on this test.

## Notes

- The regex patterns in the assertions are intentionally _looser_ than `z.email()` (e.g. `[a-z]{8,}$` for TLD) so the test validates shape coverage rather than re-implementing the validator.
- The second test calls `validPayload` 200 separate times inside a loop (rather than building an array first) so each assertion failure identifies the specific draw index via the `index` counter.
