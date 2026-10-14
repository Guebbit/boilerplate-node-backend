---
source: scripts/ops/refresh-breached-passwords.ts
sha256: 8728ce52afe9d58227b54d0bbf67cc0d5fe3dd1a6d50fbc220577522329befdb
generated_at: 2026-10-14T07:27:07.048598+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/refresh-breached-passwords.ts

## Purpose

A hand-run maintenance script (`npm run refresh:breached-passwords`) that rebuilds the committed breached-password blocklist. It downloads SecLists' 10 M-entry `Pwdb_top-10000000` corpus at a pinned commit, verifies its SHA-256, filters the lines through the `PasswordNew` regex pattern read directly from the root `openapi.yaml` contract, and writes the small survivor set (~20 k entries, ~226 KB) to the runtime list file. It exists so the blocklist and the password-shape rule in the contract never drift apart.

## Key elements

- **`SOURCE_COMMIT` / `SOURCE_URL` / `SOURCE_SHA256`** — pin the exact SecLists commit and its expected digest; any change to the commit requires re-computing the hash.
- **`OUTPUT_PATH`** — resolves to `src/infrastructure/security/breached-passwords/list.txt`, the file loaded into a `Set` at application boot.
- **`ROOT_CONTRACT_PATH`** — resolves to the repo-root `openapi.yaml`.
- **`passwordPatternFromContract()`** — parses the OpenAPI document, extracts `components.schemas.PasswordNew.pattern`, and returns a `RegExp`. Throws if the schema or pattern is absent (no silent fallback).
- **`downloadCorpus()`** — `fetch`es the corpus, checks HTTP status, passes the raw bytes to `assertCorpusDigest`, then returns trimmed lines. Fails loudly on any mismatch.
- **`main()`** — orchestrates: read pattern → download → filter → deduplicate via `Set` → sort → write. Logs source/survivor counts.
- **Top-level call** — `runScript(undefined, main, …)` with `undefined` for the schedule slot, signalling "no scheduler, no D9 job-health tracking."

## Relationships

- **`scripts/ops/corpus-digest.ts`** — provides `assertCorpusDigest`, which verifies the downloaded bytes against `SOURCE_SHA256` before any filtering occurs.
- **`scripts/run-script.ts`** — provides `runScript`, the shared entry-point wrapper (error handling, logging, optional scheduling). This call passes `undefined` as the schedule, opting out of cron/D9 integration.
- **`src/infrastructure/adapters/logger.ts`** — provides the structured `logger` used for the "Downloading" and "refreshed" info lines.
- **`src/infrastructure/config/dotenv.ts`** — side-effect import at the top of the file; loads environment variables before the script body executes (required by `fetch`/`fetch`-adjacent env or logger config).

## Notes

- **No scheduler by design.** The docblock and the `runScript(undefined, …)` call both make explicit that this runs only by hand. The upstream list changes on the order of years, so a daily/weekly job would be noise.
- **Contract is the single source of truth for the pattern.** The regex is *not* duplicated in this file; it is read from `openapi.yaml` at run time. If the contract shape changes, the script throws rather than guessing a fallback.
- **Bumping the corpus commit is a two-step change:** update `SOURCE_COMMIT` *and* recompute `SOURCE_SHA256` (`curl -sL <url> | sha256sum`). The old hash will reject the new bytes.
- **99.8 % of the corpus is rejected** by the composition rule, which is why the output is small enough to commit. If that ratio ever drops significantly, revisit the output size before committing.
- The script is a `tsx` file (shebang `#!/usr/bin/env tsx`), not compiled separately.
