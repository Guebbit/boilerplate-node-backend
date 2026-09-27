---
source: tests/cross-cutting/locale-namespaces.test.ts
sha256: 8f7f54aa8034f8062f28ae588746f5b71efc3e6e6d8804901d09bb2381a07d30
generated_at: 2026-09-27T15:50:18.822928+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/locale-namespaces.test.ts

## Purpose

Guards the locale-merge contract: because `infrastructure` deep-merges every module's `locales/en.json` onto the shared dictionary at boot (last-writer-wins), a silent collision or shadow would produce wrong copy with no error. This suite statically verifies that no module shadows a shared key, no two modules claim the same key, and every module's keys live under its own top-level namespace.

## Key elements

- **`flatten(value, prefix)`** – Recursively collects every dotted leaf key from a nested dictionary (e.g. `account.email.reset-request.subject`).
- **`readDictionary(file)`** – Reads and JSON-parses a locale file into a plain object.
- **`moduleKeys()`** – Scans `MODULES_ROOT` on disk and returns a `Map<moduleName, string[]>` of every key each module ships in its `en.json`. Discovery-based; no hardcoded module list.
- **`describe('locale namespaces across modules')`** – Four assertions:
  - *Canary* – confirms the sweep actually sees modules (checks `readdirSync` count > 0, not a fixed number).
  - *No shadowing* – no module key appears in the shared `src/locales/en.json`.
  - *No cross-module collision* – no key is claimed by two different modules.
  - *Namespace ownership* – every key in module `X` starts with `X.`.

## Relationships

- **`tests/support/paths.ts`** – Imports `MODULES_ROOT` and `REPO_ROOT` to locate `src/modules/*/locales/en.json` and `src/locales/en.json` relative to the repo root.
- **`tests/cross-cutting/locale-parity.test.ts`** (referenced in the file header) – Complementary test that asserts key-parity *across locales* (en vs. other languages) against the merged dictionaries. This file is orthogonal: it checks cross-module collisions and namespace discipline.

## Notes

- The shared keys under `generic.*` (e.g. `generic.error-internal`) are a **cross-repo contract**: the paired frontend reads them by name from `GET /locales/:locale`. Redefining one in a module would silently change API copy the frontend depends on.
- The canary test deliberately asserts against `readdirSync(MODULES_ROOT).length > 0` rather than pinning a module count, so adding a new domain module doesn't break this locale-specific test.
- The namespace rule (`key.startsWith(`${name}.`)`) is what makes "which module owns this string" answerable from the key alone and ensures deleting a module can't orphan a shared namespace segment.
- This suite reads files from disk at test time; it does **not** import or execute the merge logic in `infrastructure`. It is a static structural check.
