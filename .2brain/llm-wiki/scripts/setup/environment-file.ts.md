---
source: scripts/setup/environment-file.ts
sha256: 6bf7e5dac97d12b716619f62170e2f1bfc9d1dfa16a6c154c9f18d6f5482a0bc
generated_at: 2026-11-08T03:02:01.176004+00:00
model: ollama:qwen3.8:27b
---

# scripts/setup/environment-file.ts

## Purpose

Pure text-level operations on a dotenv file's contents: filling placeholder values and reading back a single key. It deliberately performs no filesystem I/O — all reading, writing (temp file + rename, `0600`), and first-run `.env-example` copying is owned by `scripts/setup/index.ts`.

## Key elements

- **`generateSecret()`** — Returns a 64-char hex string from 32 random bytes. The output can never contain `,` or `:` (the key-ring separators a filled value must avoid).
- **`FillResult`** (interface) — Shape of one fill pass: the resulting `content` and the ordered list of `filled` keys that actually changed.
- **`fillPlaceholders(content, keys, secretOf?)`** — Replaces every line that is *exactly* `KEY=<placeholder>` with `KEY=<fresh-secret>`. Lines whose value has already been changed are left alone, making a second run a natural no-op. The optional `secretOf` callback is a test seam (defaults to `generateSecret`).
- **`readEnvironmentValue(content, key)`** — Returns the value portion of the first line starting with `KEY=`, or `undefined` if no such line exists (covers absent keys and commented-out lines).

## Relationships

- **`scripts/setup/index.ts`** — The sole production caller. It reads/writes the file to disk and delegates the text transformation to `fillPlaceholders` and `readEnvironmentValue` in this module.
- **`scripts/setup/required-keys.ts`** — Provides the `FillableKey` type (`{ key, placeholder }`) consumed by `fillPlaceholders`.
- **`tests/unit/scripts/setup/environment-file.test.ts`** — Unit-tests the exports here, exercising the `secretOf` override for determinism.
- **`tests/unit/scripts/setup/first-run.test.ts`** — Exercises the first-run path where `index.ts` calls into this module to populate a freshly copied `.env-example`.

## Notes

- Matching is **exact whole-line equality**, not a substring or regex check. A line like `MY_KEY_EXTRA=placeholder` will not be touched when filling `MY_KEY`.
- `readEnvironmentValue` uses `startsWith`, so `KEY=value` and `KEYX=value` both match if searching for `KEY`. Callers must pass the exact key name.
- Because the module is filesystem-free, it is trivially unit-testable without mocking `fs`.
- The `filled` array in `FillResult` preserves the order of the `keys` argument, not the order they appear in the file.
