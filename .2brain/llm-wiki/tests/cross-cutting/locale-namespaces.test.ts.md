---
source: tests/cross-cutting/locale-namespaces.test.ts
sha256: 987eb19d971d210b778324a4b335ecfd21391f45b63888b8f9c76a93abb65aa7
generated_at: 2026-09-23T19:56:11.432111+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/locale-namespaces.test.ts

## Purpose

Validates that locale keys remain namespace-unique across the codebase. The deep last-writer-wins merge that `infrastructure` performs at boot silently drops or shadows strings on collision, producing wrong copy with no error. This test makes those two failure modes (module shadowing a shared key, two modules claiming the same key) plus a structural invariant (each module stays under its own top-level key) explicit and fast-failing.

## Key elements

- **`flatten(value, prefix)`** – recursively walks a locale dictionary and returns every dotted leaf key (e.g. `account.email.reset-request.subject`).
- **`readDictionary(file)`** – reads and parses a JSON locale file.
- **`moduleKeys()`** – scans `src/modules/*/locales/en.json` and returns a `Map<moduleName, string[]>` of that module's keys. Discovery is dynamic (`readdirSync`), not a hard-coded list.
- **`describe('locale namespaces across modules')`** – four test cases:
  1. *Canary* – at least one module ships copy (guards against a broken path returning an empty set silently).
  2. *No shadowing* – no module key intersects the shared `src/locales/en.json` key set.
  3. *No collision* – no key appears in more than one module.
  4. *Namespace containment* – every key in a module begins with that module's own name as the top-level segment.

## Relationships

No dependency-graph neighbors are recorded. The file reads sibling fixture files (`src/locales/en.json`, `src/modules/*/locales/en.json`) at runtime via `node:fs` but has no import-time dependency on them.

## Notes

- Language-parity (same key set across all locale files) is **not** checked here; it lives in `tests/cross-cutting/locale-parity.test.ts` and operates on the merged dictionary.
- The canary test asserts `readdirSync(MODULES_ROOT).length > 0` rather than pinning a specific count, so adding or removing a domain module doesn't break a locale test.
- Only `en.json` is inspected. The test assumes the key *structure* is identical across locales (guaranteed by the parity test); it does not itself compare non-English files.
- The namespace rule (test 4) means the top-level key **must** equal the module directory name. A module named `account` cannot ship keys under `billing.*` or any other root.
