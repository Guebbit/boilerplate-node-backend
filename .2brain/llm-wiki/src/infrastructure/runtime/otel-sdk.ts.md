---
source: src/infrastructure/runtime/otel-sdk.ts
sha256: a1d7b412eab7c2bb085a0761b553c8137e5d291cfd05292c547540b5782eaeef
generated_at: 2026-11-14T18:16:58.598722+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/otel-sdk.ts

## Purpose

Bootstraps the OpenTelemetry `NodeSDK` for the application: configures the resource, span processor/exporter pipeline, auto-instrumentations (HTTP, Express, Mongoose, Redis), context propagators, and security guards that redact secrets and pseudonymise addresses on every span. It must be imported before any instrumented library processes traffic, because instrumentation packages patch their targets at SDK start time.

## Key elements

- **`redactUrlSecrets(target)`** — exported; rewrites a request target's query string, replacing values for parameters listed in `traceUrlSecrets` (from shared rules) with `REDACTED` and replacing email/IP values in other parameters with the configured stand-in.
- **`redisCommandOnly(commandName)`** — exported; returns only the Redis command name so arguments (which may contain caller addresses) are never recorded on the span.
- **`publicEndpointPropagator()`** — exported; returns a `TextMapPropagator` that injects `traceparent` on outgoing calls but **never** extracts an inbound trace context or reads baggage, preventing untrusted callers from grafting onto existing traces or forcing sampling.
- **`linkInboundTrace(span, request)`** — exported; if an inbound `traceparent` header is present and valid, adds it as a span *link* (correlation without parent-child control).
- **`stampClientAddress(request, _response, next)`** — exported Express middleware; overwrites the `client.address` span attribute with the value derived from `request.ip` (post `trust proxy`), replacing the instrumentation's leftmost `X-Forwarded-For` reading.
- **`standIn(address)`** — internal; applies the `NODE_LOG_PERSONAL_FIELDS` policy (`plain` → raw, `redact` → `[REDACTED]`, `hash` → `correlationDigest`).
- **`pseudonymiseAddresses(span)`** — internal; rewrites `client.address` and `network.peer.address` on a span using `standIn`.
- **`serverSpans`** — a `WeakMap<IncomingMessage, Span>` that lets `stampClientAddress` find the in-flight server span by request object.
- **`trustedIngressPropagator()`** — internal; full W3C trace-context + baggage propagator, used when `NODE_TRUSTED_INGRESS` is set.
- **`redactIncomingUrl(span, request)`** — internal; calls `redactUrlSecrets` and overwrites the span's `url.query` attribute.
- **`QUERY_SECRETS`** — a `Set<string>` loaded at module init from `shared/rules/log-redaction.yaml` → `traceUrlSecrets`.

## Relationships

- **`src/infrastructure/runtime/config.ts`** — reads `loggingConfig`, `tracingConfig`, and `isRelaxedEnvironment` to decide redaction mode, exporter selection, and span-sampling behaviour.
- **`src/infrastructure/adapters/log-scrub.ts`** — calls `maskMessage` to detect and replace email/IP patterns inside query-parameter values.
- **`src/infrastructure/security/pseudonymise.ts`** — calls `correlationDigest` to produce a stable pseudonym when `NODE_LOG_PERSONAL_FIELDS=hash`.
- **`src/infrastructure/runtime/span-scrub.ts`** — consumes `scrubbingExporter` (a span processor that applies log-scrub rules before export) and wraps it in the `BatchSpanProcessor` chain.
- **`src/infrastructure/config/shared-rules/load.ts` / `log-redaction.ts`** — loads the `log-redaction` shared rule (schema + `traceUrlSecrets`) at module load time.
- **`package.json`** — imports the package's name and version to build the OTel resource descriptor.
- **`src/main.ts`** — entry point that imports this module first to ensure the SDK is configured before any library handles traffic.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — manages the SDK lifecycle (initialisation and shutdown) during the server's start/stop sequence.
- **`src/app.ts`** — mounts `stampClientAddress` middleware in the Express app after `trust proxy`.
- **`src/app/security.ts`** — provides security context that this module's redaction logic aligns with.
- **`src/cluster.ts`** — in cluster mode, each worker imports this module independently so the SDK starts per-process.
- **`tests/unit/infrastructure/runtime/otel-sdk.test.ts`** — unit tests for `redactUrlSecrets`, `redisCommandOnly`, `publicEndpointPropagator`, `linkInboundTrace`, `stampClientAddress`.
- **`tests/integration/span-client-address.test.ts`** — verifies the caller-address span attribute matches the `trust proxy`-resolved address.
- **`tests/cross-cutting/log-redaction-conformance.test.ts`** — confirms span and log redaction use the same markers and the same shared-rules source.

## Notes

- **Import order is load-bearing.** This module must be the first import in `main.ts`; if an instrumented library loads first, its code path is already bound and no spans are produced.
- **Two redaction markers.** Log lines and most span attributes use `[REDACTED]` (bracketed). The `url.query` span attribute uses bare `REDACTED` (no brackets) to match the OTel `url.query` semantic convention and to avoid percent-encoding issues in a query string.
- **`client.address` is written twice.** The HTTP instrumentation sets it from the leftmost `X-Forwarded-For` entry (caller-controlled). `stampClientAddress` middleware, mounted after `trust proxy`, overwrites it with the address Express resolves by counting configured proxy hops. Do not reorder these.
- **Public vs. trusted propagator.** When `NODE_TRUSTED_INGRESS` is unset, the propagator is inject-only (public endpoint). Inbound `traceparent` is preserved only as a span link via `linkInboundTrace`, never as a parent context.
- **`span as Partial<ReadableSpan>`** cast is a single narrowing escape to *read* attributes off an otherwise write-only `Span` interface; it is used only in `pseudonymiseAddresses`.
