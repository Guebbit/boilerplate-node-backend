---
source: src/infrastructure/observability/config.ts
sha256: c8105ea97321ee278f6315f4e80a5641a851ffabce9f8e2d9721e6edb2fb2ae9
generated_at: 2026-10-14T08:05:46.437294+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/config.ts

## Purpose

Declares the runtime configuration shape for product analytics: which provider is active, whether a consent gate is required, and the per-provider endpoints and credentials. It is a leaf config definition that other layers (the provider registry, individual providers, and the app boot sequence) consume to resolve and validate analytics settings.

## Key elements

- **`analyticsConfig`** — The single exported `defineConfig` object (name: `'analytics'`). Its `shape` maps seven env-var keys to typed fields:
  - `NODE_ANALYTICS_PROVIDER` — `text`, default `'umami'`, lowercased. Identifies the active analytics provider.
  - `NODE_ANALYTICS_REQUIRE_CONSENT` — `flag`, default `true`. Toggles the consent gate.
  - `NODE_UMAMI_HOST` / `NODE_UMAMI_INGEST_HOST` / `NODE_UMAMI_WEBSITE_ID` — Umami-specific connection settings.
  - `NODE_POSTHOG_API_KEY` — marked `sensitive: true`.
  - `NODE_POSTHOG_HOST` — PostHog endpoint.
- **`defineConfig`** (imported) — Wraps the shape into the project's config-construction contract.
- **`flag`, `text`** (imported) — Field constructors that add defaults, case handling, and sensitivity metadata.

## Relationships

- **`src/infrastructure/config/define.ts`** & **`src/infrastructure/config/fields.ts`** — Direct imports; supply `defineConfig`, `text`, and `flag` used to build `analyticsConfig`.
- **`src/infrastructure/observability/analytics/index.ts`** (provider registry) — Imports this file to read the provider name and resolve it; per the module comment, the registry is the authority on which provider names are valid.
- **`src/infrastructure/observability/analytics/umami.ts`** / **`posthog.ts`** — Individual providers that consume the UMAMI/POSTHOG fields defined here at runtime.
- **`src/app/config.ts`** — Probes `analyticsConfig` at boot to fail fast on an unrecognised provider name before the app starts serving.

## Notes

- `NODE_ANALYTICS_PROVIDER` is intentionally a plain `text` field (not an enum/union) *here*. Validation of the provider name is deferred to the registry in `analytics/index.ts`, which imports this file. This inverts the dependency: the registry knows the valid names, but the config definition stays provider-agnostic.
- `NODE_POSTHOG_API_KEY` carries the `sensitive: true` flag, so downstream tooling (logging, redaction, secret-scanning) must respect that marker.
- See `docs/tools/configuration.md` for the broader env-var contract and setup instructions.
