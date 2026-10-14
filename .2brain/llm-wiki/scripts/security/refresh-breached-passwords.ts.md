---
source: scripts/security/refresh-breached-passwords.ts
sha256: e1051f1dbea1fe1c2655c1983ab209f5732600d10b1ad6491aa14ea639b0440d
generated_at: 2026-10-14T14:33:14.387818+00:00
model: ollama:qwen3.8:27b
---

# scripts/security/refresh-breached-passwords.ts

## Purpose

Manual, run-by-hand script (`npm run refresh:breached-passwords`) that rebuilds the committed breached-password list. It downloads SecLists' `Pwdb_top-10000000` corpus (10 M entries), verifies its integrity, filters it against the `PasswordNew` pattern read directly from the root `openapi.yaml`, and writes the small survivor set (~20 k entries, ~226 KB) into the path that `PasswordNew` loads at boot. It exists so the shipped blocklist always reflects the current composition rule without duplicating that rule.

## Key elements

- **`SOURCE_COMMIT` / `SOURCE_URL` / `SOURCE_SHA256`** — Pinned SecLists commit, raw-file URL, and expected SHA-256. All three must change together when bumping the corpus source.
- **`passwordPatternFromContract()`** — Parses `openapi.yaml`, extracts `components.schemas.PasswordNew.pattern`, and returns it as a `RegExp`. Throws if the schema or pattern is missing (no silent fallback).
- **`downloadCorpus()`** — Fetches the corpus, checks HTTP status, calls `assertCorpusDigest` on the raw bytes, decodes to UTF-8, and returns trimmed lines.
- **`main()`** — Orchestrates: read pattern → download corpus → filter via `Set` (dedup) + regex test → sort → `writeFileSync` to `OUTPUT_PATH` → log summary.
- **`runScript(undefined, main, …)`** — Entry wrapper; the `undefined` scheduler slot marks this as a hand-run script outside D9 job-health tracking.

## Relationships

- **`scripts/run-script.ts`** — Provides the `runScript` helper that wraps `main`; called with an `undefined` scheduler, so the script is excluded from crontab/job-metric infrastructure.
- **`scripts/security/corpus-digest.ts`** — Supplies `assertCorpusDigest`, which verifies the downloaded bytes against `SOURCE_SHA256` before any filtering occurs.
- **`src/infrastructure/adapters/logger.ts`** — Provides the `logger` instance used for structured info-level log lines (download start, refresh complete with counts).
- **`src/infrastructure/config/dotenv.ts`** — Side-effect import at the top; ensures environment variables are loaded before any other code runs.

## Notes

- **Never scheduled.** The docblock and the `undefined` scheduler argument are both intentional. Re-run only when `PasswordNew`'s pattern changes or the corpus source is bumped; the top-N breach list shifts on the order of years.
- **Pinned commit, not branch.** `SOURCE_COMMIT` is a SHA so the remote bytes are immutable; `master` is deliberately avoided to prevent a moved or poisoned branch from altering the list.
- **Pattern is never local.** The regex comes from `openapi.yaml` at run time, not from a copy in this file. If the contract shape changes and the pattern goes missing, the script throws rather than guessing a fallback.
- **Bumping the corpus** requires recomputing `SOURCE_SHA256` (`curl -sL <url> | sha256sum`) and updating the constant; a mismatch fails the build.
- **Output is sorted and deduplicated** (`Set` + `toSorted`), written with a trailing newline, and lives at `src/infrastructure/security/breached-passwords/list.txt`.
