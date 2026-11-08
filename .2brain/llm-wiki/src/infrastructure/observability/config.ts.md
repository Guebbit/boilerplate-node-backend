---
source: src/infrastructure/observability/config.ts
sha256: 504507dcaa78f247a66412f97d0863ec73a293954e6a010a783965541ea07757
generated_at: 2026-11-08T03:39:21.799612+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/config.ts

## Purpose

Declares the full analytics configuration surface: which provider is active, whether a consent gate is required, and every endpoint/credential the supported providers (Umami, PostHog) need. It exists as a single, typed schema so the provider registry and the app-boot probe can validate and consume one object rather than scattered env reads.

## Key elements

- **`analyticsConfig`** (exported) — the `defineConfig` result named `"analytics"`. Its `shape` contains:
  - `NODE_ANALYTICS_PROVIDER` — text, lower-cased, defaults to `'umami'`. Intentionally *unconstrained* here; the set of valid names is enforced by the provider registry, not this file.
  - `NODE_ANALYTICS_REQUIRE_CONSENT` — boolean flag, defaults to `true`.
  - `NODE_UMAMI_HOST`, `NODE_UMAMI_INGEST_HOST`, `NODE_UMAMI_WEBSITE_ID` — Umami endpoint/credential fields.
  - `NODE_POSTHOG_API_KEY` (sensitive), `NODE_POSTHOG_PERSONAL_API_KEY` (sensitive) — PostHog credentials.
  - `NODE_POSTHOG_HOST`, `NODE_POSTHOG_PROJECT_ID`, `NODE_POSTHOG_API_HOST` — PostHog endpoint/identity fields.

## Relationships

- **`@infrastructure/config/define`** (`defineConfig`) — wraps the shape into a named, validated config object.
- **`@infrastructure/config/fields`** (`text`, `flag`) — field-type builders used to declare each env variable's type, default, case-sensitivity, and sensitivity.
- **`src/infrastructure/observability/analytics/index.ts`** (provider registry) — imports `analyticsConfig`, reads `NODE_ANALYTICS_PROVIDER`, and resolves the concrete provider. This is the *only* place the provider name is validated against a known set.
- **`src/infrastructure/observability/analytics/umami.ts` / `posthog.ts`** — the provider implementations that consume the respective endpoint/credential fields from this config at runtime.
- **`src/app/config.ts`** — probes the analytics config at application boot (via the registry resolver) to fail fast on an unknown provider name.

## Notes

- `NODE_ANALYTICS_PROVIDER` is deliberately a plain `text` field, **not** an enum. Do not add a `choices` or validation list here — that responsibility belongs to the provider registry (`analytics/index.ts`), which imports this file. Adding constraints here would create a circular dependency.
- Fields marked `sensitive: true` (`NODE_POSTHOG_API_KEY`, `NODE_POSTHOG_PERSONAL_API_KEY`) are handled differently by the config infrastructure (e.g., redacted in logs). Treat any new credential fields the same way.
- The `case: 'lower'` option on the provider field normalises input so `'Umami'` and `'umami'` resolve identically.
