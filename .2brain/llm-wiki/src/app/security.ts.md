---
source: src/app/security.ts
source_sha256: 212708be0fada1d2bb0a84e5bfc68a4cb660e954b426487b28f97be02f28aeaa
context_sha256: e825dd80cb07e93b5867ee4beb6de17fe9985d90c1fdff0ad0fc798bf6982bbf
generated_at: 2026-11-22T02:31:34.588148+00:00
model: claude-code:claude-sonnet-5-5
---

# src/app/security.ts

## Purpose
Groups the transport-level protections and body parsing for the Express app. Order matters: `trust proxy` comes before the rate limiter (which keys on `request.ip`), the rate limiter before the body parsers (a throttled flood shouldn't pay for parsing), and the parsers before anything reading `request.body`. It is split into two installs so `src/app.ts` can serve static files between them. Infrastructure supplies the handlers. This file chooses which are installed and in what order.

## Key elements
- `RAW_BODY_PATHS` (internal) – lowercased paths, built once at import from each enabled module's `rawBodyPaths`, prefixed with the module's first mount `basePath`. These are paths whose body must survive parsing verbatim (e.g. signed webhooks).
- `isRawBodyPath(url)` (internal) – case-insensitive match at a segment boundary (exact, `?`, or `/`). `/payments/webhook-test` does not match `/payments/webhook`.
- `applyServerTimeouts(server)` – sets `headersTimeout`, `requestTimeout` and `keepAliveTimeout` on the Node `Server` from `appConfig()` (`NODE_HTTP_HEADERS_TIMEOUT_MS`, `NODE_HTTP_REQUEST_TIMEOUT_MS`, `NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS`). This bounds how long a client may take to *send* a request (slowloris and slow-POST). It does not bound handlers.
- `installSecurity(app)` – installs, in order:
  1. strong ETags (`etag` set to `'strong'`);
  2. `dropUnownedValidators`;
  3. `trust proxy` from `NODE_TRUST_PROXY_HOPS` (`false` when 0, otherwise the hop count);
  4. `stampClientAddress` (OTel span client address);
  5. `helmet()`;
  6. a middleware adding `Vary: Origin` to every response;
  7. strict `cors` using `isAllowedOrigin`, with `credentials: true`, `preflightContinue: true`, an explicit method list, allowed request headers and exposed response headers;
  8. `answerOptions(OPERATION_ROUTES, servedModuleNames, REQUEST_CONTENT_TYPES)`, the single `OPTIONS` answer.
- `installRequestParsing(app)` – installs `rateLimiter` first, then the JSON body parsing. The JSON parser also has an exception for raw-body (webhook) paths. The visible part of the file ends partway through this function.

## Relationships
- `src/app.ts` calls the two install functions (and presumably `applyServerTimeouts`), serving static files between `installSecurity` and `installRequestParsing`.
- `src/app/config.ts` supplies `appConfig()` values: trust-proxy hops and the three HTTP timeouts.
- `src/modules.ts` supplies `enabledModules` (for `rawBodyPaths` and `mounts`) and `servedModuleNames`.
- `src/infrastructure/http/middlewares/*` supplies the handlers: `rate-limit` (`rateLimiter`), `content-type` (`requireDeclaredContentType`), `json-depth` (`limitJsonDepth`, `JSON_BODY_TYPES`), `json-object` (`requireJsonObjectBody`) and `method-not-allowed` (`answerOptions`).
- `src/infrastructure/http/origins.ts` supplies `isAllowedOrigin` for CORS.
- `src/infrastructure/http/preconditions.ts` supplies `dropUnownedValidators`. It is also the source of the `If-Match` header declared in the CORS allow list.
- `src/infrastructure/runtime/otel-sdk.ts` supplies `stampClientAddress`.
- `@api/request-content-types` and `@api/operation-routes` feed the `OPTIONS` handler.
- `package.json` is the source of the `express`, `helmet`, `cors` and `cookie-parser` dependencies.
- Tests: `tests/cross-cutting/security-headers-conformance.test.ts`, `tests/integration/scenarios/demo-routes.test.ts` and `tests/integration/span-client-address.test.ts` exercise this behaviour.

## Notes
- `trust proxy` is `false` rather than `0` when there are no proxies. `express-rate-limit` distinguishes "off" with `=== false`, and only then warns about an unexpected `X-Forwarded-For`. It is never set to `true`, so Express counts hops back from the forgeable end of `X-Forwarded-For`.
- The CORS origin callback passes `false`, never an `Error`, for a refused origin. An error would turn a valid call into a generic 500. Requests with no `Origin` header (curl, healthchecks) are allowed.
- `Vary: Origin` is added on every response so shared caches don't serve a header-less variant, which would fail CORS in the browser. This matters for the publicly cached `GET /products/facets`.
- `preflightContinue: true` means `answerOptions` answers every `OPTIONS` request the same way, whatever the Origin.
- New custom request or response headers must be added to `allowedHeaders` or `exposedHeaders` in the CORS config, or browsers will fail the preflight or be unable to read them.
- `keepAliveTimeout` must stay above the reverse proxy's idle-to-app timeout, or the proxy may send requests into closed sockets and return 502.
- Raw-body path matching is case-insensitive because Express routes regardless of case.
