---
source: tests/unit/support/contract-data.test.ts
sha256: 59157d948a3cb9730d2581c7e42dff69afbf7cfae1250088142e76f3df97ea5b
generated_at: 2026-11-08T10:44:06.902448+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/contract-data.test.ts

## Purpose

Unit test for the **email-format** branch of the `validPayload` generator in `tests/support/contract-data.ts`. It exists to catch regressions where a stricter-than-intended email regex (e.g. one that rejects plus-tags or 8+ character TLDs) would silently filter out valid generated emails, and to guarantee every generated value passes its own `z.email()` schema.

## Key elements

- **`SAMPLE_COUNT`** (200) — number of random draws per test; sized so a 4-way random shape pick hits every variant with high probability.
- **"generates a plus-tag, an 8+ character TLD, and a subdomain…"** — asserts that across 200 draws, the generator produces at least one email containing a `+`, one with a TLD of 8+ characters (`/@[^.]+\.[a-z]{8,}$/`), and one with a subdomain (`/@(?:[^.]+\.){2}[a-z]+$/`).
- **"never emits a value the schema itself rejects"** — iterates 200 draws and asserts `schema.safeParse({ email }).success` is `true` for every one, where the schema is `z.object({ email: z.email() })`.
- **`validPayload`** (imported from `@tests/contract-data`) — the generic payload generator under test; called here with a single-field email schema.

## Relationships

- **`tests/support/contract-data.ts`** — provides `validPayload`, the sole function exercised by this test. This file is described as the email-format half of that module's testing; the generator itself and any other format branches live in the neighbor.

## Notes

- The two regexes in the diversity test are **shape detectors**, not validation rules — they check for structural features (plus-tag, long TLD, subdomain) in the *output*, not that the email is "valid."
- `SAMPLE_COUNT = 200` is a probabilistic choice (4-way pick → 200 draws ≈ >99.9% chance of covering all shapes). It is not a guarantee; a flaky failure here would indicate an unlucky run or a real shape regression.
- The file is explicitly scoped to email format only. Other `format:` branches of `validPayload` are covered elsewhere (implied by the "half" phrasing in the module doc).
