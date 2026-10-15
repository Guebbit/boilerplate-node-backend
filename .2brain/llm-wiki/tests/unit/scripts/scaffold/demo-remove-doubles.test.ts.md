---
source: tests/unit/scripts/scaffold/demo-remove-doubles.test.ts
sha256: 751265fc70b556521af9f1b092c707e814a4aeb630c93d6f243608e5b997a449
generated_at: 2026-10-15T13:30:39.675971+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/scaffold/demo-remove-doubles.test.ts

## Purpose

Unit tests for the `stripModuleDoubles` scaffold helper, verifying that removing a module's test-doubles folder also unregisters it from the shared `register.ts` entry point — and that the function behaves safely when the module has no doubles or when the register file is unexpected.

## Key elements

- **`REGISTER` constant** — A template string simulating a `scenarios/support/doubles/register.ts` that imports and calls two modules' double-registration functions. Used as the fixture written into every temp directory.
- **`write(relative, content)`** — Local helper that creates a file under the temp `root`, auto-making parent directories.
- **`beforeEach` / `afterEach`** — Create a unique `mkdtempSync` directory with a minimal doubles tree (`register.ts`, `payments/register.ts`, `payments/fake.ts`); tear it down with `rmSync`.
- **`describe('stripModuleDoubles')`** — Three cases:
  - *deletes a removed module's doubles folder and unregisters it* — asserts the `payments` folder is gone, `register.ts` no longer references `registerPaymentDouble` but still references `registerMailDoubles`, and exactly one note is returned.
  - *leaves alone a module that has no doubles* — calling with `['wishlist']` returns an empty array and leaves existing files untouched.
  - *refuses when the shared register file no longer imports the folder* — overwrites `register.ts` with a stub, expects `stripModuleDoubles` to throw with a `/does not import/u` message.

## Relationships

- **`scripts/scaffold/demo-remove-scenarios.ts`** — The module under test. This file imports `stripModuleDoubles` (a single named export) and exercises its file-system and string-manipulation behavior against a disposable temp tree.

## Notes

- Tests use `node:fs` / `node:os` / `node:path` directly (no jest `fs` mocks), so they exercise real I/O. The temp dir is cleaned up in `afterEach` with `{ recursive: true, force: true }`.
- The `notes` return value from `stripModuleDoubles` is asserted on length but its contents are not inspected here; the pairing spec test likely covers note text in more detail.
- The guard clause (throw on missing import) is tested by *overwriting* `register.ts` after the initial `beforeEach` write — the test does not rebuild the whole tree.
