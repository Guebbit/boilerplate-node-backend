---
source: src/modules/locales/tests/unit/translations.test.ts
sha256: a57ac1028701155e39a1fd003455832e3cea5055faf0ccb52c66386de9ee2812
generated_at: 2026-11-08T06:29:54.861901+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/tests/unit/translations.test.ts

## Purpose
Unit tests for the `deriveSourceDigest` pure function from the locales repository. This file covers the deterministic, side-effect-free half of the translation write path — verifying that the digest is a stable, order-independent fingerprint of a translation's content.

## Key elements
- **`deriveSourceDigest`** (imported from `../../repository`) — the sole function under test. Expects a plain object of translation fields and returns a digest string.
- **`describe('deriveSourceDigest')`** block containing four assertions:
  - *Order-independence* — swapping key order in the input object yields the same digest.
  - *Value sensitivity* — editing a field value changes the digest.
  - *Key sensitivity* — adding a key (even with an empty-string value) changes the digest.
  - *Determinism* — two calls with structurally identical (but separately allocated) objects produce the same digest.

## Relationships
- **`src/modules/locales/repository.ts`** — provides the `deriveSourceDigest` export that is the target of every test in this file.
- **`../integration/translations.test.ts`** (referenced in the module doc comment) — the complementary integration suite that exercises the Mongo/registry-driven half of the same write path.

## Notes
- The file's own `@module` comment explicitly scopes it: anything that touches `locales`/`translations` collections or the registry is *not* tested here — see the integration suite instead.
- Fixtures use short Italian strings (`'Cuccia'`, `'Comoda'`) purely as sample content; they carry no locale-specific meaning in the assertions.
- The tests treat `deriveSourceDigest` as a pure function (no mocks, no setup/teardown, no async), consistent with its description as the "pure half" of the write path.
