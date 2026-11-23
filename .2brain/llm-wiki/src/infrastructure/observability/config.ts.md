---
source: src/infrastructure/observability/config.ts
source_sha256: c631d3ff85f96453ba69925a26a3a3323fe5b20cdb8978534dd73bf36e87ea77
context_sha256: 6f570e18939b5fdd292bb13bc24928f1fca386e91d75607532df80edfd6cf7e6
generated_at: 2026-11-22T02:58:22.949664+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/config.ts

## Purpose
Declares the product-analytics configuration: which analytics provider is active, whether user consent gates it, and the endpoint and credentials for each supported provider (Umami and PostHog). It is a single `defineConfig` declaration of environment-variable fields.

## Key elements
- `analyticsConfig`: the config definition, named `'analytics'`, built with `defineConfig`. Its shape has these fields:
  - `NODE_ANALYTICS_PROVIDER`: `text`, defaults to `'umami'`, lower-cased (`case: 'lower'`).
  - `NODE_ANALYTICS_REQUIRE_CONSENT`: `flag`, defaults to `true`.
  - Umami: `NODE_UMAMI_HOST`, `NODE_UMAMI_INGEST_HOST`, `NODE_UMAMI_WEBSITE_ID`.
  - PostHog: `NODE_POSTHOG_API_KEY` (sensitive), `NODE_POSTHOG_HOST`, `NODE_POSTHOG_PERSONAL_API_KEY` (sensitive), `NODE_POSTHOG_PROJECT_ID`, `NODE_POSTHOG_API_HOST`.

## Relationships
- Imports `defineConfig` from `src/infrastructure/config/define.ts` and the `flag` and `text` field builders from `src/infrastructure/config/fields.ts`.
- Per the file's doc comment, the provider registry (`src/infrastructure/observability/analytics/index.ts`) imports this file. Its resolver rejects an unknown provider name.
- `src/app/config.ts` probes `NODE_ANALYTICS_PROVIDER` at boot, according to the doc comment.
- `src/modules/observability/services/health.ts` is a graph neighbor. This file does not show any interaction with it.

## Notes
- `NODE_ANALYTICS_PROVIDER` is deliberately plain `text`, not an enum. The valid names live in the provider registry, which imports this file, so validating them here would create a circular dependency.
- The two PostHog API key fields are marked `sensitive: true`. The other fields, including the Umami ones, are not.
- Consent is required by default (`NODE_ANALYTICS_REQUIRE_CONSENT` defaults to `true`).
