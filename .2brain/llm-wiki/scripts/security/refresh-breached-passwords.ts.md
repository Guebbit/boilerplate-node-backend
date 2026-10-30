---
source: scripts/security/refresh-breached-passwords.ts
sha256: 56bcf31a3572cbb47c8d7dcad2a39a0a5e83d520982949526f4e0d4c2467a539
generated_at: 2026-10-29T01:44:55.326815+00:00
model: ollama:qwen3.8:27b
---

# scripts/security/refresh-breached-passwords.ts

## Purpose

One-off maintenance script (run via `npm run refresh:breached-passwords`) that rebuilds the committed breached-password blocklist. It downloads SecLists' 10 M-entry `Pwdb_top-10000000`, validates it against a pinned SHA-256, filters it through the `PasswordNew` pattern read directly from the root `openapi.yaml`, and writes the ~20 k survivors to `shared/rules/breached-passwords.txt`. It exists so the blocklist stays in lockstep with the contract's password-shape rule without duplicating that rule.

## Key elements

- **`SOURCE_COMMIT` / `SOURCE_URL` / `SOURCE_SHA256`** — Pinned SecLists commit, raw GitHub URL, and expected digest. The commit SHA (not `master`) guarantees immutable source bytes.
- **`OUTPUT_PATH`** — `shared/rules/breached-passwords.txt`, the file loaded at boot into a `Set` by the application.
- **`ROOT_CONTRACT_PATH`** — Points to the root `openapi.yaml`; the single source of truth for the password rule.
- **`passwordPatternFromContract()`** — Parses `openapi.yaml`, extracts `components.schemas.PasswordNew.pattern`, and returns it as a `RegExp`. Throws if the schema or pattern is missing (no silent fallback).
- **`downloadCorpus()`** — Fetches `SOURCE_URL`, asserts the SHA-256 via `assertCorpusDigest`, decodes to text, and returns an array of trimmed lines. Throws on non-200 or digest mismatch.
- **`main()`** — Orchestrates: read pattern → download corpus → filter (keep non-empty lines matching the pattern) → deduplicate via `Set` → sort → write `OUTPUT_PATH`. Logs source/survivor counts.
- **`runScript(undefined, main, …)`** — Entry-point wrapper; the `undefined` first argument signals "not a scheduled job" (no job-health or metric tracking).

## Relationships

- **`scripts/run-script.ts`** — Provides `runScript`, which wraps `main` with process-level error handling (`process.exitCode` on failure) and structured exit.
- **`scripts/security/corpus-digest.ts`** — Provides `assertCorpusDigest`, which verifies the downloaded bytes against `SOURCE_SHA256` before any filtering occurs.
- **`src/infrastructure/adapters/logger.ts`** — Provides the structured `logger` used for the two `info` calls (download start, refresh complete with counts).
- **`src/infrastructure/config/dotenv.ts`** — Side-effect import at the top; ensures environment variables are loaded before the script runs.

## Notes

- **Never scheduled.** Intentionally excluded from `docker/crontab` and job-health tracking. Re-run only when `PasswordNew`'s pattern changes or the SecLists corpus is re-pinned — a top-N breach list shifts on the order of years.
- **Single source of truth for the rule.** The pattern is read from `openapi.yaml` at runtime; it is *not* hardcoded. If the contract shape changes, the script fails loudly rather than guessing a fallback.
- **Pinning discipline.** Bumping `SOURCE_COMMIT` requires re-computing `SOURCE_SHA256` (`curl -sL <url> | sha256sum`) and updating both constants together.
- **Output is committable.** The pattern rejects ~99.8 % of the 94 MB source, leaving a ~226 KB file small enough to live in the repository and load into memory at boot.
