---
source: tests/unit/support/contract-data.test.ts
sha256: 59157d948a3cb9730d2581c7e42dff69afbf7cfae1250088142e76f3df97ea5b
generated_at: 2026-10-15T13:33:12.218531+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/support/contract-data.test.ts

## Purpose

Statistical test that guards the email-shape generator inside `validPayload`. It verifies two things: (1) across a batch of draws, the generator actually produces the less-common email shapes (plus-tag, long TLD, subdomain) rather than always emitting one canonical form, and (2) every single value it emits is accepted by the Zod `z.email()` schema it was generated for.

## Key elements

- **`SAMPLE_COUNT` (200)** – Draw count chosen so a 4-way random shape pick hits every branch with high probability. Used by both tests.
- **"generates a plus-tag, an 8+ character TLD, and a subdomain…"** – Draws 200 emails and asserts that at least one contains `+`, at least one ends in a TLD of 8+ letters, and at least one has a subdomain (`user.sub.domain.tld` pattern).
- **"never emits a value the schema itself rejects"** – Iterates 200 draws and asserts `schema.safeParse({ email }).success` is `true` every time.

## Relationships

- **`tests/support/contract-data.ts`** – Provides the `validPayload` function under test. This test file is the email-format half of that module's contract; a sibling test (or another describe block) covers the non-email payload shapes.

## Notes

- Coverage is probabilistic, not exhaustive. 200 draws makes it *very likely* every shape appears, but a theoretically possible (astronomically unlikely) run could skip one. There is no `Math.random` seed.
- The three regex assertions in the first test are shape *existence* checks (`.some(...)`), not "every email matches one of these three." The generator is expected to randomize across shapes; the test only confirms none are structurally absent from the batch.
- The second test re-draws independently per iteration rather than reusing the first test's array, so it is unaffected by any state the first test might leave behind.
