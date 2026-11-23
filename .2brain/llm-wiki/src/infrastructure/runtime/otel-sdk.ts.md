---
source: src/infrastructure/runtime/otel-sdk.ts
source_sha256: 87f6b823e76906e89ce70d57bb999ee7ba8ff63bb230f546339ee5d821d93bcc
context_sha256: fefcb093dafd5016678ead456aae503cc20232469d73877c7d30eabd90a1e3ed
generated_at: 2026-11-22T03:06:43.315692+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/otel-sdk.ts

## Purpose
Bootstraps the OpenTelemetry Node SDK for the app. It must be imported before `serve` loads the instrumented libraries (express, http, mongoose, redis), because the instrumentations patch those modules at `sdk.start()`. It also holds the privacy and security policy for spans: query-string redaction, caller-address pseudonymisation, a trace-context propagator that ignores inbound trace ids, and Redis statement stripping.

## Key elements
- `redactUrlSecrets(target)` – exported. Rewrites a request target's query string. Values of parameters listed in `traceUrlSecrets` (from the `log-redaction` shared rules) become `REDACTED`. Emails and IPs in any other value are replaced by a stand-in. Returns the input unchanged if nothing changed.
- `redisCommandOnly(commandName)` – exported. Returns only the Redis command name, so spans never carry keys or values (a rate-limit key contains a caller address).
- `publicEndpointPropagator()` – exported. A `TextMapPropagator` that injects `traceparent` but never adopts an inbound one and never reads `baggage`. Inbound requests therefore get a root span. It is modelled on Go's `WithPublicEndpoint`.
- `trustedIngressPropagator()` – not exported. A `CompositePropagator` of W3C trace-context and baggage, used behind a trusted ingress (`NODE_TRUSTED_INGRESS`).
- `linkInboundTrace(span, request)` – exported. For an `IncomingMessage` with a valid `traceparent`, adds a span link to the caller's trace instead of adopting it.
- `stampClientAddress(request, _response, next)` – exported Express middleware, mounted after `trust proxy`. It sets the server span's `client.address` from `request.ip`, because the instrumentation's own value comes from the caller-controlled `X-Forwarded-For`. It tracks server spans through a `WeakMap<IncomingMessage, Span>`.
- Internal helpers:
  - `standIn(address)` – picks the replacement for an address by `NODE_LOG_PERSONAL_FIELDS`: `plain` keeps it, `redact` gives `[REDACTED]`, otherwise `correlationDigest`.
  - `redactQueryPair` and `redactIncomingUrl` – rewrite a span's `url.query`.
  - `pseudonymiseAddresses` – applies `standIn` to `client.address` and `network.peer.address`.
- Imports `NodeSDK`, `BatchSpanProcessor`, `NoopSpanProcessor`, `OTLPTraceExporter` (OTLP over HTTP), `resourceFromAttributes`, and the HTTP, Express, Mongoose and Redis instrumentations. The code that assembles them is beyond the part of the file shown here.

## Relationships
- `./config` – supplies `isRelaxedEnvironment`, `loggingConfig` (`NODE_LOG_PERSONAL_FIELDS`) and `tracingConfig`.
- `../security/pseudonymise` – `correlationDigest` gives the same digest a log line shows, so traces and logs correlate.
- `../adapters/log-scrub` – `maskMessage` finds emails and IPs inside query values.
- `./span-scrub` – `scrubbingExporter`, a wrapper for the span exporter.
- `../config/shared-rules/load` and `../config/shared-rules/log-redaction` – `loadSharedRules` and `logRedactionSchema` load the `traceUrlSecrets` list used for query redaction.
- `package.json` – imported for service metadata. `ATTR_SERVICE_VERSION` suggests the version comes from it.
- Entry points and wiring, based on the neighbor list: `src/main.ts`, `src/worker.ts`, `src/app.ts`, `src/app/security.ts` and `server-lifecycle.ts`. The excerpt shown does not confirm how each uses this module.
- Tests: `tests/unit/infrastructure/runtime/otel-sdk.test.ts`, `tests/integration/span-client-address.test.ts`, `tests/cross-cutting/log-redaction-conformance.test.ts`.

## Notes
- Import order matters: this module must load before the instrumented libraries.
- Imports from `./config` are relative on purpose, because path aliases are not wired yet when this file loads.
- URL attributes use `REDACTED` without brackets, following the OTel `url.query` convention. Every other span attribute and every log uses `[REDACTED]`.
- `client.address` is first pseudonymised from the instrumentation's value, which trusts the caller's `X-Forwarded-For`. `stampClientAddress` later replaces it with Express's resolved `request.ip`.
- `pseudonymiseAddresses` reads attributes back through a narrowing cast to `Partial<ReadableSpan>`, because the `Span` interface cannot be read.
- Only four instrumentations are loaded, instead of the `auto-instrumentations-node` bundle, to keep startup cheaper.
