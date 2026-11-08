---
source: shared/rules/defaults.yaml
sha256: 691cf5262ab61b23a3a34700627f01840a5600e8e0b215541325c4469051d6ed
generated_at: 2026-11-08T03:09:04.756248+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/defaults.yaml

## Purpose

Single source of truth for the fallback numeric limits both backends start from when no environment variable is set. It is a build-time template, not a runtime config file: `npm run regenerate` reads it and emits `src/infrastructure/config/defaults.generated.ts`.

## Key elements

- **`defaults.responseCache`** – `devTtlMaxSeconds` (30 s dev-only TTL ceiling) and `maxBytes` (256 KiB cached-body cap).
- **`defaults.idempotency`** – `retentionHours` (24 h replay window for stored responses).
- **`defaults.pagination`** – `pageSize` (10 rows/page when the caller omits a limit).
- **`defaults.images`** – `maxInputPixels` (50 M-pixel decompression-bomb cap), `maxDimension` (2048 px longest side of a stored original), `thumbnailDimension` (320 px), `quarantineRetentionHours` (24 h before a quarantined upload is treated as abandoned).
- **`defaults.uploads`** – `maxBytes` (5 MiB maximum accepted upload body).

Each key is paired in-line with the environment variable that overrides it (e.g. `NODE_REDIS_CACHE_MAX_BYTES`, `NODE_MAX_UPLOAD_BYTES`).

## Relationships

- **shared/contracts/openapi.root.yaml** – The OpenAPI contract documents these same limits (upload size, pagination default, image dimension caps) as request/response constraints. Changing a value here is expected to keep the generated defaults and the published spec in agreement.

## Notes

- **Not read at boot.** The YAML is consumed only by the codegen step; the runtime reads `defaults.generated.ts`. Editing this file has no effect until `npm run regenerate` is run.
- The numbers represent "unset-variable" fallbacks, not hard ceilings in the code. Any env var listed in the inline comments takes precedence at runtime.
- Byte values are written as raw integers (e.g. `262144` for 256 KiB, `5242880` for 5 MiB) rather than human-readable strings, so the generated TypeScript can use them directly as numeric comparisons.
