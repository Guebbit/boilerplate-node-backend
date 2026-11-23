---
source: shared/rules/defaults.yaml
source_sha256: 691cf5262ab61b23a3a34700627f01840a5600e8e0b215541325c4469051d6ed
context_sha256: 77926a1c026ee9650ef3ae1184efc1855168e8ab45114392840a7d8f8eac7592
generated_at: 2026-11-22T02:25:41.799774+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/defaults.yaml

## Purpose
Holds the plain-number default values that both backends start from. Each value has an environment variable that overrides it. The number in this file is what the setting means when that variable is unset.

## Key elements
All values sit under a top-level `defaults:` key.

- `responseCache.devTtlMaxSeconds` (30): the longest TTL a development run may request, in seconds. Env var: `NODE_REDIS_CACHE_DEV_TTL_MAX`.
- `responseCache.maxBytes` (262144, 256 KiB): the largest body the cache stores. Env var: `NODE_REDIS_CACHE_MAX_BYTES`.
- `idempotency.retentionHours` (24): hours a stored response can be replayed. Env var: `NODE_IDEMPOTENCY_RETENTION_HOURS`.
- `pagination.pageSize` (10): rows per page when the caller gives no limit. Env var: `NODE_SETTINGS_PAGINATION_PAGE_SIZE`.
- `images.maxInputPixels` (50000000): the most pixels a decoder may open, which acts as a decompression-bomb cap. Env var: `NODE_IMAGE_MAX_INPUT_PIXELS`.
- `images.maxDimension` (2048): the longest side of a stored original. Env var: `NODE_IMAGE_MAX_DIMENSION`.
- `images.thumbnailDimension` (320): the longest side of a thumbnail. Env var: `NODE_IMAGE_THUMBNAIL_DIMENSION`.
- `images.quarantineRetentionHours` (24): hours a quarantined upload is left alone before it counts as abandoned. Env var: `NODE_QUARANTINE_RETENTION_HOURS`.
- `uploads.maxBytes` (5242880, 5 MiB): the largest accepted upload body. Env var: `NODE_MAX_UPLOAD_BYTES`.

## Relationships
- `shared/rules/images.yaml` is a sibling rules file. The `images.*` defaults here are image-related numbers, and the graph links the two files. This file does not show how they interact, so check `images.yaml` for that.

## Notes
- The file is not read at boot. Per its header comment, `npm run regenerate` generates a TypeScript defaults file from it, so edits take effect only after regeneration.
- The comments in the file document each value's environment variable, so keep them accurate when adding or renaming settings.
