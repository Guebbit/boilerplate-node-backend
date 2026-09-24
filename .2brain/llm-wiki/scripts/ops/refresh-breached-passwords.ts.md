---
source: scripts/ops/refresh-breached-passwords.ts
sha256: 3c92164bbf20160bd0b4154468357275d0d6cbd8ad373c1239e9f0450abc792c
generated_at: 2026-09-23T17:30:30.419304+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/refresh-breached-passwords.ts

## Purpose

One-off operator script (`npm run refresh:breached-passwords`) that rebuilds the committed breached-password blocklist. It downloads SecLists' 10-million-entry `Pwdb_top-10000000` corpus, filters it through the `PasswordNew` regex pulled live from `openapi.yaml`, and writes the small sorted survivor set to `src/infrastructure/security/breached-passwords/list.txt`. It exists so the blocklist stays in sync with the password policy without hard-coding a duplicate pattern.

## Key elements

- **`SOURCE_URL`** — SecLists raw GitHub URL for the 10M breached-password file.
- **`OUTPUT_PATH`** — `src/infrastructure/security/breached-passwords/list.txt`; the file loaded into a `Set` at boot.
- **`ROOT_CONTRACT_PATH`** — repo-root `openapi.yaml`, the single source of truth for the password pattern.
- **`passwordPatternFromContract()`** — Parses `openapi.yaml` via the `yaml` package, extracts `components.schemas.PasswordNew.pattern`, and returns it as a `RegExp`. Throws if the schema or `pattern` key is absent (no silent fallback).
- **`downloadCorpus()`** — `fetch`es the source URL; throws on non-200 so a partial download never produces a truncated list. Returns trimmed lines.
- **`main()`** — Orchestrates: read pattern → download → filter (non-empty lines matching the pattern) → deduplicate via `Set` → sort with `.toSorted()` → write UTF-8 file with trailing newline. Logs source/survivor counts.
- **`runScript(main, …)`** — Entry-point wrapper (from `scripts/db/run-script`); the rollback argument is a no-op `() => Promise.resolve()` since the script has no DB transaction to unwind.

## Relationships

- **`scripts/db/run-script.ts`** — Provides `runScript`, the standard lifecycle wrapper (setup → main → teardown/rollback). This script passes a no-op rollback because it performs no database writes.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` instance used for structured info logs at start and finish (download URL, line counts, output path).

## Notes

- **Run manually, never scheduled.** The repo has no cron/scheduler; the top-N breach list changes on the order of years. Re-run whenever `PasswordNew.pattern` changes in `openapi.yaml` — nothing else will notice if the list has silently under-blocked.
- **Pattern is read from the committed contract, not duplicated.** This is intentional to prevent drift between the validation rule and the blocklist filter. If the `openapi.yaml` shape changes, the script throws rather than guessing.
- **`toSorted()` is used (not `sort()`)**, consistent with a no-mutation convention; the `Set` also deduplicates entries.
- **Output is ~226 KB / ~20k lines** (measured 2026-09-13) because the composition pattern rejects ~99.8% of the 10M-line corpus. The 94 MB source is never committed.
- **`dotenv/config` is imported** at the top (likely for proxy or token config in `fetch`), but no env vars are read explicitly in the visible code.
