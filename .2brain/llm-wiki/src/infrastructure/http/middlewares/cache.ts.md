---
source: src/infrastructure/http/middlewares/cache.ts
sha256: 9f9de78d420a3989e3ff8d1a390579fdcb20240456f69e8e7e005f9aac5efbed
generated_at: 2026-11-08T03:30:12.262176+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/cache.ts

## Purpose

HTTP response-caching middleware layer. It owns the JSON envelope shape, the TTL policy (including a dev-environment clamp), the per-entry size gate, and the cache-key derivation logic — all concerns specific to caching *responses* rather than arbitrary values. The actual Redis read/write lives in `adapters/cache.ts`; this file is the only consumer that shapes data before it crosses that boundary.

## Key elements

- **`CachedResponse`** (interface) — the stored envelope: `status`, `body`, `staleAt` (epoch ms soft-expiry for refresh-ahead).
- **`resolveCacheTtl(seconds)`** (export) — clamps a route's declared TTL to `NODE_REDIS_CACHE_DEV_TTL_MAX` outside production; returns the value unchanged in prod.
- **`CacheOptions`** (interface) — per-route configuration: `keyParameters`, `keyValues`, `orderedKeyParameters`, `keyAs`, `browserRevalidate`, `scopeKey`.
- **`serializeCachedResponse`** (internal) — JSON-serialises the envelope and rejects it (returns `undefined`) if it exceeds `NODE_REDIS_CACHE_MAX_BYTES`, logging a warning.
- **`isCachedResponse` / `parseCachedResponse`** (internal) — structural type-guard and safe parse; corrupt or shape-changed entries degrade to a cache miss.
- **`keySpelling` / key-builder helpers** (internal) — normalise scalars and scalar-arrays into a deterministic key fragment; non-scalar values cause the entry to skip caching.
- **`STALE_WHILE_REVALIDATE_SECONDS` (60) / `STALE_IF_ERROR_SECONDS` (300)** — RFC 5861 constants advertised in `Cache-Control` headers.
- **`CACHE_STATUS_NAME`** (`"api-redis"`) — identifier for the RFC 9211 `Cache-Status` debug header.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — low-level Redis I/O (`getCacheValue`, `setCacheValue`, `claimCacheRefresh`, `invalidateCacheTagsLogged`). This file calls those functions and owns the serialization/deserialization that wraps them.
- **`src/infrastructure/http/config.ts`** — provides `responseCacheConfig()` (TTL max, byte limit, and other tunables read at request time).
- **`src/infrastructure/runtime/config.ts`** — `isRelaxedEnvironment()` gates the dev TTL clamp.
- **`src/infrastructure/observability/metrics-cache.ts`** — `cacheRequestsTotal` counter incremented on cache hits/misses.
- **`src/infrastructure/adapters/logger.ts`** — structured `logger.warn` when a write is skipped for exceeding the size limit.
- **`src/infrastructure/http/request.ts`** — `bodyRecordOf` used to extract key parameter values from the request body.
- **`src/domain-primitives/time.ts`** — `HOUR_SECONDS` used as a time unit in TTL calculations.
- **`src/modules/*/routes.ts`** (account, addresses, cart, delivery, example) — consumers that pass `CacheOptions` (keyParameters, scopeKey, etc.) into the `setCache` middleware per route.
- **`src/kernel/middlewares/locale-preview.ts`** — sits in the same middleware chain; likely interacts with cache scope or key parameters for locale-variant responses.
- **`scripts/audit/api-standards.yaml`** — declarative audit rules that reference caching headers/policies enforced by this module.
- **`scripts/docs/generate-role-matrix.ts`** — documents the `scopeKey` / role-based cache-bypass behaviour this module implements.

## Notes

- **`staleAt` vs Redis TTL:** `staleAt` is the soft refresh-ahead boundary; Redis's own TTL is `ttl + STALE_WHILE_REVALIDATE_SECONDS`, so bytes persist through the grace window. Don't conflate the two when debugging a "stale but still served" entry.
- **`keyParameters` is required** in `CacheOptions` — an empty array is valid (most routes), but omitting it is a type error. Getting it wrong is a correctness bug (shared responses between unrelated requests), not a perf issue.
- **`scopeKey` bypasses Redis entirely** when it returns `false`; the request is never read from or written to the cache. This is the mechanism that prevents an admin's wider view from being served to a guest.
- **Body-before-query precedence** in key derivation: if both body and query carry the same parameter name, the body value wins. The key must match what the controller actually reads.
- **`Object.hasOwn` (not `in`)** is used when checking declared key parameters to avoid prototype-chain pollution (e.g., a parameter literally named `toString`).
- **Stryker markers** (`Stryker disable all` / `restore all`) wrap the size-gate log line to exclude it from mutation testing.
- **Dev TTL opt-out:** set `NODE_REDIS_CACHE_DEV_TTL_MAX=0` to disable the clamp entirely (useful in local dev where long TTLs are fine).
