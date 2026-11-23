---
source: src/infrastructure/config/secret-files.ts
source_sha256: 02b379197371343cb1f42bbcc7765b68304d10fb851594c0bea5f0935e7c6fd2
context_sha256: e88ad5f953b3db09fecd5a4fa6f50dd818dc986c49cb7c2733f9a9eff3c40ef8
generated_at: 2026-11-22T02:44:22.830754+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/config/secret-files.ts

## Purpose
Implements "secrets as files": a variable `NODE_X_FILE=/run/secrets/x` stands in for `NODE_X=<secret>`. This keeps secrets out of `docker inspect` and out of child processes' environments. The config store runs it over its merged environment, so downstream slices, checks and presence rules only see the resolved values.

## Key elements
- `resolveSecretFiles(environment)` is the only export. It returns a copy of the environment with two changes:
  - Every `NODE_*_FILE` variable is read, and its content is set under the name without the suffix. The file wins over a plain `NODE_X` if both are set, and no error is raised for that.
  - Each password variable is merged into its connection URL. The pairs are `NODE_DB_URI`/`NODE_DB_PASSWORD`, `NODE_REDIS_URL`/`NODE_REDIS_PASSWORD`, `NODE_RABBITMQ_URL`/`NODE_RABBITMQ_PASSWORD` and `NODE_RATE_LIMIT_REDIS_URL`/`NODE_RATE_LIMIT_REDIS_PASSWORD`. The merge only happens when both the URL and the password are set.
  - The input is never mutated.
- `fileValues` (internal) scans for names starting with `NODE_` and ending with `_FILE` that have a non-empty path.
- `readSecretFile` (internal) reads the file synchronously as UTF-8 and strips a single trailing `\r?\n`. An empty file yields `undefined`, which means "not set". On a read failure it throws an error naming the variable, the path and the error code, never the value, and keeps the original error as `cause`.
- `withPassword` (internal) dispatches on the URL scheme:
  - `mongodb://` and `mongodb+srv://` URLs go through `mongoWithPassword`, which uses `mongodb-connection-string-url`. This parser handles multi-host replica-set URIs.
  - Anything else goes through `genericWithPassword`, which uses `URL.parse`.
  - Both parsers percent-encode the password. The username already in the URL is kept and any existing password is replaced.
  - A URL that fails to parse is returned unchanged.

## Relationships
- `src/infrastructure/config/store.ts` is the caller. Per the module doc, the store runs `resolveSecretFiles` over its merged environment.
- `tests/unit/infrastructure/config/secret-files.test.ts` is the unit test for this module.
- `src/infrastructure/adapters/logger.ts` is a graph neighbor. The file itself shows no direct interaction with it, and it does not import the logger.

## Notes
- Only the `NODE_` prefix is resolved. Other tools' `*_FILE` variables, such as `GIT_INDEX_FILE`, are deliberately ignored.
- It never writes to `process.env`, so child processes don't receive the secret values.
- An empty secret file leaves the variable unset. A deployment on a managed service can then rely on the credentials already in its own URL.
- The read is synchronous because the config path is synchronous by contract.
- Error detection avoids `instanceof Error`, because fs errors can come from another realm (the jest sandbox).
- A password is merged into a URL only when both the URL and the password are present after file resolution. A password supplied via `NODE_DB_PASSWORD_FILE` therefore works too.
