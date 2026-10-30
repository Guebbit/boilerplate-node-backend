---
source: src/infrastructure/config/secret-files.ts
sha256: 1acff9a3e6a80dd0c25665090d5d7b571b7ba3700ad400e91bbc53b0e4a021e3
generated_at: 2026-10-29T01:58:19.652163+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/secret-files.ts

## Purpose

Resolves secret-file references in the application's environment: any `NODE_X_FILE` variable is replaced by the content of the file it points to, and standalone password variables are merged into their associated connection URLs. This lets secrets live in mounted files (invisible to `docker inspect` and child processes) while downstream config code sees only plain values.

## Key elements

- **`resolveSecretFiles(environment)`** (exported) — Entry point. Reads every applicable `_FILE` variable, then merges each `NODE_*_PASSWORD` into its paired connection URL. Returns a new object; never mutates the input.
- **`fileValues(environment)`** — Scans for `NODE_*_FILE` entries, calls `readSecretFile`, and returns a map of base variable → resolved value.
- **`readSecretFile(variable, filePath)`** — Synchronously reads a file, strips one trailing newline, and returns `undefined` for an empty file. Throws a descriptive error (variable name + path + OS code) on failure.
- **`withPassword(url, password)`** — Routes to the Mongo or generic parser and returns the URL with the password injected (percent-encoded). Falls back to the original URL if parsing fails.
- **`mongoWithPassword` / `genericWithPassword`** — Parser-specific implementations using `mongodb-connection-string-url` and WHATWG `URL.parse` respectively.
- **`URL_PASSWORDS`** — Maps connection-URL variables (`NODE_DB_URI`, `NODE_REDIS_URL`, `NODE_RABBITMQ_URL`, `NODE_RATE_LIMIT_REDIS_URL`) to their password variables.
- **`OWNED_PREFIX` / `FILE_SUFFIX`** — Guards that only `NODE_*_FILE` variables are treated as secret references, avoiding false positives like `GIT_INDEX_FILE`.

## Relationships

- **`src/infrastructure/config/store.ts`** — The config store calls `resolveSecretFiles` over its merged environment (including overrides) before any slice, check, or presence rule reads a value. This file is the mechanism by which the store translates file-based secrets into resolved strings.
- **`tests/unit/infrastructure/config/secret-files.test.ts`** — Unit tests covering file resolution, URL password injection, error paths, and the empty-file / "not set" convention.

## Notes

- **Synchronous by contract.** `readFileSync` is used deliberately; the config path has no async form. An eslint-disable documents this.
- **Empty file ≠ missing file.** An empty file yields `undefined` (treated as "not set"), allowing managed-service deployments where compose insists on mounting a file but there is no actual secret.
- **Never writes to `process.env`.** The resolved values are returned as a new object so child processes never see the plaintext.
- **File wins over inline value.** If both `NODE_X` and `NODE_X_FILE` are set, the file content takes precedence unconditionally.
- **Two different URL parsers.** Mongo URIs (including multi-host replica sets) go through `mongodb-connection-string-url`; everything else uses WHATWG `URL.parse`. The `MONGO_SCHEME` regex dispatches between them.
- **Error messages never include the secret value**, only the variable name, file path, and OS error code.
