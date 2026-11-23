---
source: scripts/security/refresh-breached-passwords.ts
source_sha256: 2bf49012ad782b80d22c8843a492e14e6bea73abb49f1c2c873f3630c1ca0702
context_sha256: 000ec9b0a089fd058094db4f01366f77e70771101be9ef1e39a31e8a91497364
generated_at: 2026-11-22T02:17:51.563560+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/security/refresh-breached-passwords.ts

## Purpose
A hand-run script (`npm run refresh:breached-passwords`) that rebuilds the bundled breached-password list at `shared/rules/breached-passwords.txt`. It downloads the SecLists `Pwdb_top-10000000` corpus, keeps the first 20,000 distinct lines whose length fits `PasswordNew`'s `minLength`/`maxLength`, and writes them sorted. It is not scheduled, because a top-N breach list changes over years. Re-run it when `PasswordNew`'s length bounds change.

## Key elements
- `SOURCE_COMMIT` / `SOURCE_URL`: pin the corpus to a SecLists commit SHA, so a moved or poisoned branch cannot change the result.
- `SOURCE_SHA256`: expected digest of the corpus. It must be recomputed when the commit is bumped.
- `OUTPUT_PATH`: the committed list, `shared/rules/breached-passwords.txt`.
- `ROOT_CONTRACT_PATH`: the generated, gitignored root `openapi.yaml`.
- `LIST_LIMIT`: 20,000 distinct passwords kept (the corpus is frequency-ordered, so this is the top N).
- `passwordBoundsFromContract()`: parses `openapi.yaml` and returns `{ min, max }` from `components.schemas.PasswordNew`. It throws `TypeError` if either bound is not a number, rather than guessing a fallback.
- `downloadCorpus()`:
  - Fetches the corpus and throws on a non-OK HTTP response.
  - Verifies the SHA-256 digest with `assertCorpusDigest`.
  - Decodes as strict UTF-8 (`fatal: true`).
  - Splits on `\n` and strips only a trailing `\r`.
- `main()`: reads the bounds, downloads, filters, writes the file with a trailing newline, and logs lines read and kept.

## Relationships
- `scripts/run-script.ts`: provides `runScript`, which runs `main` via `runScript(undefined, main, ...)`. The `undefined` argument means no scheduler or job-health tracking.
- `scripts/security/corpus-digest.ts`: provides `assertCorpusDigest`, which checks the downloaded bytes against `SOURCE_SHA256` before any filtering.
- `src/infrastructure/adapters/logger.ts`: provides `logger`, used to report the download start and the final counts.
- `src/infrastructure/config/dotenv.ts`: imported for its side effect, which loads environment configuration.

## Notes
- Length is counted in Unicode code points (`[...line]`), not UTF-16 units or grapheme clusters. This matches the contract's `maxLength` and the PHP twin's `mb_strlen`.
- The PHP backend's `RefreshBreachedPasswords` command is a twin and must produce byte-identical output. Both split on `\n`, strip a trailing `\r`, and count code points.
- There is no composition filter. The only rule is length, and `LIST_LIMIT` bounds the list size.
- It needs the bundled `openapi.yaml` to exist, since it is generated and gitignored.
- Failures are reported through the process exit code rather than a rejected promise, per the comment on the `runScript` call.
