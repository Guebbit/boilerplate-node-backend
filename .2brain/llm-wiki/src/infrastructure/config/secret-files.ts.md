---
source: src/infrastructure/config/secret-files.ts
sha256: 4ddfe3d5078b0d6118e6903f03d63e41165b08d25cb00a45bd2950469d86acfc
generated_at: 2026-10-14T07:51:57.545298+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/config/secret-files.ts

## Purpose

Resolves `NODE_X_FILE` secret-file variables into their plain `NODE_X` counterparts and merges standalone password variables into their corresponding connection URLs, so downstream config consumers see fully resolved credentials without any trace of file-based mounting.

## Key elements

- **`URL_PASSWORDS`** (exported, const) — Mapping of connection-URL env vars to their password env vars (e.g. `NODE_DB_URI` → `NODE_DB_PASSWORD`). The four entries cover Mongo, Redis, RabbitMQ, and rate-limit Redis.
- **`resolveSecretFiles(environment)`** (exported) — The main entry point. Returns a new `Variables` object where every `NODE_X_FILE` value has been read from disk into `NODE_X`, and every known URL now carries its password. Never mutates the input; never writes to `process.env`.
- **`readSecretFile(variable, filePath)`** (internal) — Synchronously reads a secret file, strips one trailing newline (`\r?\n`), and returns `undefined` for an empty file (meaning "not set"). Throws a named error (variable + path, never the value) on read failure.
- **`mongoWithPassword(url, password)`** (internal) — Parses a `mongodb://` or `mongodb+srv://` URI via `mongodb-connection-string-url`, assigns the password (percent-encoded), returns the stringified URI or `undefined` on parse failure.
- **`genericWithPassword(url, password)`** (internal) — Same for non-Mongo URLs using WHATWG `URL.parse`; returns `undefined` if the URL doesn't parse.
- **`withPassword(url, password)`** (internal) — Dispatches to the Mongo or generic helper based on a scheme regex; falls back to the original URL string if the parser rejects it.
- **`fileValues(environment)`** (internal) — Iterates the environment, reads every `NODE_*_FILE` entry, and returns a partial record of the resolved values.
- **`MONGO_SCHEME`**, **`FILE_SUFFIX`**, **`OWNED_PREFIX`** (internal consts) — Regex `/^mongodb(?:\+srv)?:\/\//i`, `'_FILE'`, `'NODE_'` respectively.

## Relationships

- **`src/infrastructure/config/store.ts`** — The config store calls `resolveSecretFiles` over its merged environment so that every downstream slice, check, and presence rule sees the final resolved values. This is the sole consumer in production code.
- **`tests/unit/infrastructure/config/secret-files.test.ts`** — Unit tests for `resolveSecretFiles`, the password-merging helpers, and the empty-file / error paths.

## Notes

- **Synchronous by contract.** `readFileSync` is used deliberately; the config path has no async form. ESLint suppressions document this.
- **Empty file ≠ missing value.** An empty secret file resolves to `undefined` (i.e. "not set"), which is how managed-service deployments that have no secret to mount satisfy a required file-mount without injecting an empty credential.
- **Only `NODE_`-prefixed variables are touched.** `GIT_INDEX_FILE` or any other tool's `_FILE` variable is ignored, preventing accidental clobbering.
- **File value always wins over inline value.** When both `NODE_X` and `NODE_X_FILE` are present, the file content replaces the inline one; there is no conflict error.
- **No `process.env` mutation.** The function returns a new object; the caller (the store) decides where to apply it. This is the mechanism that keeps secrets out of child-process environments.
- **Error messages never include the secret value** — only the variable name and file path.
