---
source: src/infrastructure/observability/config.ts
sha256: 504507dcaa78f247a66412f97d0863ec73a293954e6a010a783965541ea07757
generated_at: 2026-10-29T02:09:25.844329+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/observability/config.ts

## Purpose

Declares the runtime configuration shape for product analytics: which provider is active, whether consent gating applies, and the per-provider endpoint/credential fields (Umami, PostHog). It is a single `defineConfig` export that every analytics consumer reads at runtime.

## Key elements

- **`analyticsConfig`** — the sole export; a `defineConfig` object named `'analytics'` whose `shape` maps env-var names to typed fields:
  - `NODE_ANALYTICS_PROVIDER` (`text`, default `'umami'`, lowercased) — selects the active provider.
  - `NODE_ANALYTICS_REQUIRE_CONSENT` (`flag`, default `true`) — gates all analytics behind a consent flow.
  - Umami fields: `NODE_UMAMI_HOST`, `NODE_UMAMI_INGEST_HOST`, `NODE_UMAMI_WEBSITE_ID`.
  - PostHog fields: `NODE_POSTHOG_API_KEY` (sensitive), `NODE_POSTHOG_HOST`, `NODE_POSTHOG_PERSONAL_API_KEY` (sensitive), `NODE_POSTHOG_PROJECT_ID`, `NODE_POSTHOG_API_HOST`.

## Relationships

- **Imports** `defineConfig` from `@infrastructure/config/define` and the `flag`/`text` field constructors from `@infrastructure/config/fields`.
- **Imported by** the provider registry (`analytics/index.ts`), which validates the `NODE_ANALYTICS_PROVIDER` string against known names. The registry in turn is probed at boot by `src/app/config.ts`.
- **Read by** the provider implementations (`analytics/umami.ts`, `analytics/posthog.ts`) to obtain their endpoints and credentials at runtime.
- **Referenced by** `modules/observability/services/health.ts` as part of observability health reporting.

## Notes

- `NODE_ANALYTICS_PROVIDER` is deliberately a plain `text` field, **not** an enum. The set of valid names lives in the provider registry (which imports this file); making it an enum here would create a circular import. The registry's resolver rejects unknown values at boot.
- Fields marked `sensitive: true` are excluded from logs/dumps by the config layer; all other analytics fields are treated as non-sensitive.
- Only the fields for the *active* provider are required at runtime; the other provider's fields can be empty without error.
