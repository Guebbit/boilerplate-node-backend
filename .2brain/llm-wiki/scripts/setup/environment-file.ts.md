---
source: scripts/setup/environment-file.ts
source_sha256: 6bf7e5dac97d12b716619f62170e2f1bfc9d1dfa16a6c154c9f18d6f5482a0bc
context_sha256: 2a1b2a7fd3d41a1ee50d640d29b931715413f4aaa936290eba362fff2aa02850
generated_at: 2026-11-22T02:17:58.052270+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/setup/environment-file.ts

## Purpose
Pure, text-level helpers for editing a dotenv file during setup. It fills only lines that still read exactly `KEY=<placeholder>` with a freshly generated secret, and reads a single key's value back out. It does no filesystem access; `scripts/setup/index.ts` handles reading, writing (temp file + rename, mode 0600) and copying `.env-example` on first run.

## Key elements
- `generateSecret()` — returns `randomBytes(32).toString('hex')`, a 64-char hex string. It contains no `,` or `:`, the key-ring separators a filled value must never contain.
- `FillResult` — interface with `content` (the text after replacement) and `filled` (keys whose line actually changed, in the order `keys` were given).
- `fillPlaceholders(content, keys, secretOf = generateSecret)` — splits the content on `\n`. For each `{ key, placeholder }` it looks for a line exactly equal to `KEY=placeholder` and replaces every such line with `KEY=<secret>`. Keys with no exact match are skipped and left out of `filled`. `secretOf` can be overridden for deterministic tests.
- `readEnvironmentValue(content, key)` — returns the text after `KEY=` on the first line that starts with `KEY=`. It returns `undefined` if no such line exists, which includes commented-out lines.

## Relationships
- `scripts/setup/required-keys.ts` — supplies the `FillableKey` type (`key` and `placeholder`) that `fillPlaceholders` iterates over.
- `scripts/setup/index.ts` — the I/O owner that uses these pure functions on file contents it reads and writes.
- `tests/unit/scripts/setup/environment-file.test.ts` and `tests/unit/scripts/setup/first-run.test.ts` — unit tests covering this module and the first-run setup flow.

## Notes
- Matching is an exact whole-line comparison, not a substring match. A line with a different value, a trailing space, or an inline comment is left alone. A real value is never overwritten.
- Because filled lines no longer read as placeholders, a second run is a no-op.
- `readEnvironmentValue` uses `startsWith('KEY=')` and returns the raw remainder of the line, with no trimming, unquoting or comment handling.
- Content is split and rejoined on `\n` only, so `\r\n` files keep their `\r`. A CRLF line therefore won't exactly match a placeholder line.
