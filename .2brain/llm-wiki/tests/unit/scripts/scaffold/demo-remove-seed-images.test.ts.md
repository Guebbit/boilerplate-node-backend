---
source: tests/unit/scripts/scaffold/demo-remove-seed-images.test.ts
sha256: 4006b6ab5fe52071c961199a6b8054733c99d68f20d6b95d40fff6013bb17fbf
generated_at: 2026-10-15T13:30:50.193344+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-seed-images.test.ts

## Purpose

Unit tests for the `removeSeedImages` scaffold step. It verifies that the function cleanly strips every artifact of the seed-image pipeline (image files, manifest, generator script, npm script entry, and avatar-spread syntax in the users file) while leaving unrelated files and code untouched.

## Key elements

- **`USERS`** – Fixture string mimicking a realistic `scenarios/users.ts` that contains both a static spread (`...userImages.customer`) and a conditional spread (`...(index % 2 === 0 ? userImages.root : userImages.customer)`), exercising both removal paths.
- **`PACKAGE_JSON`** – Fixture with three npm scripts; the test asserts only `scenario:images` is removed.
- **`root`** – Temp directory (via `mkdtempSync`) acting as a throwaway project checkout.
- **`write` / `read`** – Small helpers that read/write files relative to `root`.
- **`beforeEach`** – Populates the temp tree with every file the function is expected to touch (seed images, thumbnails, system logo, manifest, generator, users file, package.json).
- **`afterEach`** – Recursively removes the temp directory.
- **`describe('removeSeedImages')`** – Five test cases: folder deletion (sibling files preserved), manifest + generator deletion, surgical npm-script removal, spread/import stripping with valid syntax remaining, and the error path when the expected import shape is absent.

## Relationships

- **`scripts/scaffold/demo-remove-scenarios.ts`** – The module under test; imports and invokes its exported `removeSeedImages(root)` function.

## Notes

- Tests use a real filesystem (temp dir) rather than mocking `node:fs`, so they exercise the actual directory-tree and JSON-edit logic end-to-end.
- The `USERS` fixture intentionally mixes static and conditional spreads to guard against a naive regex that only handles one form.
- The "refuses" test asserts the thrown message matches `/expected shape not found/u`, tying the test to the exact guard phrase in the implementation.
