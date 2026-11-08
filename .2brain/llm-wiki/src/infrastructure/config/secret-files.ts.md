---
source: src/infrastructure/config/secret-files.ts
sha256: 1acff9a3e6a80dd0c25665090d5d7b571b7ba3700ad400e91bbc53b0e4a021e3
generated_at: 2026-11-08T03:25:36.088635+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/secret-files.ts

## Purpose

Resolves `NODE_*_FILE` environment variables (which hold file paths) into their actual secret values, then merges the resulting passwords into their corresponding connection-URL variables. It exists so secrets can be delivered as mounted files (invisible to `docker inspect` and child processes) while every downstream consumer sees a plain resolved value, as if the secret had been set inline.

## Key elements

- **`resolveSecretFiles(environment)`** — the sole export. Reads every qualifying `NODE_*_FILE` entry, overlays the file value onto the base variable, then injects each password into its paired connection URL. Returns a **new** object; the input is never mutated. Throws if a named secret file is unreadable.
- **`URL_PASSWORDS`** — maps four connection-URL variables (`NODE_DB_URI`, `NODE_REDIS_URL`, `NODE_RABBITMQ_URL`, `NODE_RATE_LIMIT_REDIS_URL`) to their password counterparts.
- **`readSecretFile(variable, filePath)`** — synchronous `readFileSync`; strips exactly one trailing newline (`\r?\n$`); returns `undefined` for an empty file (meaning "not set"). Errors include the variable name and path but never the secret value.
- **`withPassword(url, password)`** — dispatches on scheme: Mongo URIs go through `mongodb-connection-string-url` (the driver's own parser, so replica-set hosts work); everything else goes through WHATWG `URL.parse`. Both percent-encode the password on assignment.
- **`MONGO_SCHEME`** — regex matching `mongodb://` and `mongodb+srv://`; the only gate deciding which parser to use.
- **`OWNED_PREFIX` / `FILE_SUFFIX`** — restricts resolution to `NODE_*` names ending in `_FILE`, so unrelated tool variables like `GIT_INDEX_FILE` are never touched.

## Relationships

- **`src/infrastructure/config/store.ts`** — the config store calls `resolveSecretFiles` over its merged environment (inline overrides included) so that every subsequent slice, check, and presence rule sees the resolved value. This file is a pure function with no side effects on `process.env`.
- **`tests/unit/infrastructure/config/secret-files.test.ts`** — unit tests for the resolution logic, including empty-file handling, file-wins-over-inline precedence, URL password injection, and error paths.

## Notes

- **Never writes to `process.env`.** The resolved copy is handed back to the caller; mutating the global environment would re-expose the secret to child processes, defeating the purpose.
- **Synchronous by contract.** `readFileSync` and the try/catch pattern are deliberate — the config path has no promise form.
- **Empty file ≠ read error.** An empty file returns `undefined` (treated as "not set"), which matters for managed-service deployments where the compose file insists on a mount but there is no secret to write.
- **File value wins unconditionally.** If both `NODE_X` and `NODE_X_FILE` are present, the file content replaces the inline value with no conflict warning.
- **Parser choice matters.** `mongodb-connection-string-url` is used for Mongo URIs because the WHATWG `URL` parser rejects multi-host replica-set strings; all other schemes (Redis, AMQP) are single-host and parse fine with `URL.parse`.
