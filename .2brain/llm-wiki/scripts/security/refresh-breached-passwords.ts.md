---
source: scripts/security/refresh-breached-passwords.ts
sha256: 56bcf31a3572cbb47c8d7dcad2a39a0a5e83d520982949526f4e0d4c2467a539
generated_at: 2026-11-08T03:01:51.337324+00:00
model: ollama:qwen3.8:27b
---

# scripts/security/refresh-breached-passwords.ts

## Purpose

Manual, by-hand script (`npm run refresh:breached-passwords`) that rebuilds the committed breached-password denylist (`shared/rules/breached-passwords.txt`). It downloads SecLists' 10 M-password corpus, filters it through the `PasswordNew` regex pattern read directly from the root `openapi.yaml` contract, and writes the sorted survivors (~20 k entries, ~226 KB) to the repo. It exists so the committed list stays in sync with the contract's pattern without duplicating the rule.

## Key elements

- **`SOURCE_COMMIT` / `SOURCE_URL` / `SOURCE_SHA256`** — Pinned SecLists commit SHA, raw-GitHub URL, and expected SHA-256 of the corpus bytes. Bumping any one requires re-computing the digest.
- **`OUTPUT_PATH`** — Resolved path to `shared/rules/breached-passwords.txt`, the file loaded into a `Set` at runtime.
- **`ROOT_CONTRACT_PATH`** — Resolved path to the root `openapi.yaml`; the single source of truth for the `PasswordNew` pattern.
- **`passwordFromContract()`** — Parses `openapi.yaml`, extracts `components.schemas.PasswordNew.pattern`, and compiles it to a `RegExp`. Throws if the shape is missing (no silent fallback).
- **`downloadCorpus()`** — Fetches the corpus via `fetch`, checks the HTTP status, and validates the body against `SOURCE_SHA256` before returning trimmed lines.
- **`main()`** — Orchestrates: read pattern → download & verify corpus → filter → deduplicate (`Set`) → sort → write output → log summary.
- **`runScript(undefined, main, …)`** — Invoked with `undefined` as the scheduler slot (no cron/docker job); wraps `main` for uniform exit-code handling.

## Relationships

- **`scripts/run-script.ts`** — Provides the `runScript` wrapper that sets `process.exitCode` on failure and gives the script its structured error path. The `undefined` first argument signals "no scheduler," opting out of job-health metric tracking.
- **`scripts/security/corpus-digest.ts`** — Supplies `assertCorpusDigest`, which performs the SHA-256 comparison of the downloaded bytes against `SOURCE_SHA256` before any filtering occurs.
- **`src/infrastructure/adapters/logger.ts`** — Provides the structured `logger` used for the two `logger.info` calls (download start, refresh complete).
- **`src/infrastructure/config/dotenv.ts`** — Imported as a side-effect (`import '@infrastructure/config/dotenv'`) to load environment variables before any other module runs.

## Notes

- **Never scheduled.** The docblock and the `undefined` scheduler slot are deliberate: a top-N breach list changes on the order of years. Re-run manually whenever `PasswordNew.pattern` changes; nothing else detects a stale list.
- **Pattern comes from the contract, not from this file.** If the OpenAPI schema shape changes (e.g., pattern moved or removed), the script throws rather than guessing — a silent fallback could under- or over-filter.
- **Integrity is layered:** pinned commit SHA (prevents branch-move/poison) → HTTP status check → SHA-256 digest check. Any failure aborts before filtering.
- **Measured ratio (2026-09-13):** the composition rule rejects ~99.8 % of the 10 M corpus, keeping the output small enough to commit.
- **Eslint suppression:** the floating-promise warning on the `runScript` call is explicitly disabled because `runScript` signals failure via `process.exitCode` rather than rejecting.
