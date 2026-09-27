---
source: scripts/ops/refresh-breached-passwords.ts
sha256: 36a8adf9f9db31490dca76b7cfb2f5561fc4bf315ff964c0047a4b6de8d2df44
generated_at: 2026-09-27T13:58:12.775575+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/refresh-breached-passwords.ts

## Purpose

One-shot maintenance script that rebuilds the committed breached-password blocklist. It downloads SecLists' 10 M-entry `Pwdb_top-10000000` corpus, filters it through the `PasswordNew` regex pattern read directly from the root `openapi.yaml` contract, deduplicates, sorts, and writes the small survivor set (~20 k entries, ~226 KB) to `src/infrastructure/security/breached-passwords/list.txt`. Run manually via `npm run refresh:breached-passwords`; there is no scheduler. Re-run whenever the `PasswordNew` pattern changes.

## Key elements

- **`SOURCE_URL`** — SecLists raw-file URL for the 10 M breached-password corpus.
- **`OUTPUT_PATH`** — resolved path to `src/infrastructure/security/breached-passwords/list.txt`, the file loaded into a `Set` at runtime.
- **`ROOT_CONTRACT_PATH`** — resolved path to the committed root `openapi.yaml`.
- **`passwordPatternFromContract()`** — parses `openapi.yaml`, extracts `components.schemas.PasswordNew.pattern`, and returns it as a `RegExp`. Throws if the schema or pattern is absent (prevents silent under-/over-filtering).
- **`downloadCorpus()`** — `fetch`es `SOURCE_URL`; throws on any non-200 response; returns the body split into trimmed lines.
- **`main()`** — orchestrates: reads the pattern, downloads the corpus, filters to non-empty lines matching the pattern, deduplicates via `Set`, sorts with `toSorted()`, writes the output file, and logs a summary.
- **`runScript(undefined, main, () => Promise.resolve())`** — entry-point wrapper; first argument `undefined` signals "run by hand" (no docker/cron context), so no D9 job-health or metric tracking is registered. The recovery callback is a no-op.

## Relationships

- **`scripts/run-script.ts`** — provides `runScript`, the shared script-execution wrapper. This file passes `undefined` as the scheduler context and a no-op recovery, distinguishing it from scheduled/cron-driven scripts.
- **`src/infrastructure/adapters/logger.ts`** — provides the `logger` instance used for the two `info` calls (download start, completion summary with source/survivor counts and output path).

## Notes

- The `PasswordNew` pattern is **always read from `openapi.yaml` at run time**, never hardcoded in this script. The docblock stresses this to prevent the two from drifting.
- The script is intentionally **not scheduled**. The breach list changes on a multi-year cadence; a stale list silently under-blocks, so the re-run trigger is a pattern change, not a time interval.
- `toSorted()` (immutable) is used rather than `sort()`, keeping the `Set` intact.
- A non-200 HTTP response or a missing `pattern` field both **throw immediately** — the design philosophy is fail-loud rather than ship a partial or unfiltered list.
- The trailing newline (`+ '\n'`) in the output write is intentional; the consuming code at boot expects a line-terminated file.
