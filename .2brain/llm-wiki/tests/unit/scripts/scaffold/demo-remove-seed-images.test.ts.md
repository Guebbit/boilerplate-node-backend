---
source: tests/unit/scripts/scaffold/demo-remove-seed-images.test.ts
sha256: 4006b6ab5fe52071c961199a6b8054733c99d68f20d6b95d40fff6013bb17fbf
generated_at: 2026-11-08T10:41:23.832191+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-seed-images.test.ts

## Purpose

Unit test for the `removeSeedImages` scaffold step. It verifies that the function strips seed-image assets, the generated avatar manifest, its generator script, the corresponding npm script entry, and all avatar-spread references from `scenarios/users.ts` — while leaving unrelated files untouched.

## Key elements

- **`USERS`** – Fixture string that mimics `scenarios/users.ts`, containing both a static spread (`...userImages.customer`) and a conditional spread (`...(index % 2 === 0 ? userImages.root : userImages.customer)`) to exercise both removal paths.
- **`PACKAGE_JSON`** – Fixture with three `scripts` entries; only `scenario:images` should be deleted.
- **`root`** – Per-test temporary directory (created via `mkdtempSync`) that acts as a throwaway repo checkout.
- **`write` / `read`** – Small helpers wrapping `writeFileSync` / `readFileSync` relative to `root`.
- **`describe('removeSeedImages')`** – Five cases:
  1. Deletes `public/images/seed/` (including `thumbs/`) but preserves `public/images/system/`.
  2. Deletes the avatar JSON manifest and its generator script.
  3. Removes only the `scenario:images` key from `package.json` `scripts`.
  4. Removes every `userImages` reference and its import, leaving valid `makeUser` calls.
  5. Throws (`"expected shape not found"`) when `scenarios/users.ts` no longer imports the manifest.

## Relationships

- **`scripts/scaffold/demo-remove-scenarios.ts`** – The module under test; `removeSeedImages` is imported directly from it.
- **`tests/unit/scripts/pairing/spec-identity.test.ts`** – Sibling test in the same unit-test tree; no import or runtime interaction is visible in this file.

## Notes

- Despite living under `unit/`, the test performs real filesystem I/O against a temp directory — it is closer to a filesystem-integration test than a pure unit test.
- The guard test ("refuses when the users file no longer imports the manifest") documents a deliberate fail-fast contract: `removeSeedImages` throws rather than silently skipping cleanup when the expected import shape is absent.
- The fixture intentionally includes a *conditional* spread (`? … : …`) to confirm the removal logic handles non-literal spread expressions, not just `...userImages.X` directly.
