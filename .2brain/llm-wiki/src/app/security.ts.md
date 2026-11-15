---
source: src/app/security.ts
sha256: 06721ea8ada2505c94f31cf759f3784280dcb46d15673d3f252857335bdfb5d7
generated_at: 2026-11-14T17:49:47.074340+00:00
model: ollama:qwen3.8:27b
---

# src/app/security.ts

## Purpose

Configures all transport-level protections (secure headers, CORS, rate limiting, body parsing) for the Express application. The ordering is load-bearing and non-obvious, so this file is the single place that decides *which* middleware handlers get installed and *in what sequence*. It is split into two exported install functions so `src/app.ts` can serve static files between them (static files get headers but don't consume rate-limit budget or pay for body parsing).

## Key elements

- **`installSecurity(app)`** — Mounts the first half of the pipeline: ETag policy, `dropUnownedValidators`, `trust proxy` (hop count), `stampClientAddress`, `helmet()`, unconditional `Vary: Origin`, strict CORS (allowed origins via `isAllowedOrigin`, `preflightContinue`, credentials, explicit `allowedHeaders`/`exposedHeaders`), and `answerOptions` as the sole `OPTIONS` responder.
- **`installRequestParsing(app)`** — Mounts the second half: `rateLimiter` first (a throttled request never pays for parsing), then the JSON body parser with a raw-body exception for webhook paths, plus `requireDeclaredContentType`, `limitJsonDepth`, and `requireJsonObjectBody`.
- **`applyServerTimeouts(server)`** — Sets Node's `headersTimeout`, `requestTimeout`, and `keepAliveTimeout` from `appConfig()` to defend against Slowloris/slow-POST while leaving handler execution unbounded.
- **`RAW_BODY_PATHS` / `isRawBodyPath(url)`** — A fixed list (built once at import from each module's `rawBodyPaths` declaration) of URLs whose request body must reach the handler as the original buffer (HMAC webhook verification). Matching is lowercased and done at a segment boundary, not a bare prefix.

## Relationships

- **`src/app.ts`** — Calls `installSecurity` and `installRequestParsing` around its static-file mount; the two-function split exists for that call site.
- **`src/app/config.ts`** — Supplies `appConfig()` for `NODE_HTTP_*` timeout values and `NODE_TRUST_PROXY_HOPS`.
- **`src/modules.ts`** — Provides `enabledModules` (to build `RAW_BODY_PATHS`) and `servedModuleNames` (passed to `answerOptions`).
- **`src/infrastructure/http/origins.ts`** — `isAllowedOrigin` is the sole authority for CORS origin acceptance.
- **`src/infrastructure/http/preconditions.ts`** — `dropUnownedValidators` is mounted by `installSecurity` to reject foreign `If-Match`/`If-None-Match` tags.
- **`src/infrastructure/http/middlewares/method-not-allowed.ts`** — `answerOptions` is the single `OPTIONS` handler.
- **`src/infrastructure/http/middlewares/rate-limit.ts`** — `rateLimiter` is mounted first in `installRequestParsing`; it must run after `trust proxy` is set so it keys rate-limit buckets on the resolved client address.
- **`src/infrastructure/http/middlewares/content-type.ts`** — `requireDeclaredContentType` rejects bodies without an explicit `Content-Type`.
- **`src/infrastructure/http/middlewares/json-depth.ts`** — `limitJsonDepth` and `JSON_BODY_TYPES` guard against deeply nested JSON.
- **`src/infrastructure/http/middlewares/json-object.ts`** — `requireJsonObjectBody` enforces a top-level JSON object.
- **`src/infrastructure/runtime/otel-sdk.ts`** — `stampClientAddress` records the resolved client address into the OTel span; must run after `trust proxy` is set.
- **`package.json`** — Declares `helmet`, `cors`, and `cookie-parser` as dependencies consumed here.
- **`tests/cross-cutting/security-headers-conformance.test.ts`** — Verifies the headers produced by `installSecurity`.
- **`tests/integration/span-client-address.test.ts`** — Exercises the `trust proxy` → `stampClientAddress` interaction.
- **`tests/integration/scenarios/demo-routes.test.ts`** — Integration tests that pass through the full security + parsing pipeline.

## Notes

- **Two-install split is intentional.** `src/app.ts` mounts static files *between* `installSecurity` and `installRequestParsing`. Do not merge them or reorder the call sites.
- **`trust proxy` is a hop count, never `true`.** A value of `0` is translated to `false` (not `0`) so that `express-rate-limit` correctly detects "no proxy configured" and warns on stray `X-Forwarded-For` headers.
- **CORS refusal uses `callback(null, false)`, never an `Error`.** Throwing into the Express error chain would turn a valid same-origin request into a 500.
- **`Vary: Origin` is added unconditionally** (separate middleware) because the `cors` package only adds it for allowed origins; a missing `Vary` lets a shared CDN serve the header-less (refused-origin) variant to the real frontend.
- **`RAW_BODY_PATHS` is frozen at import time.** It is not rebuilt per request; adding a new raw-body path requires updating the owning module's `rawBodyPaths` declaration.
- **`isRawBodyPath` matches at a segment boundary** (`/`, `?`) after lowercasing, so `/Payments/webhook` works and `/payments/webhook-test` does not accidentally match `/payments/webhook`.
