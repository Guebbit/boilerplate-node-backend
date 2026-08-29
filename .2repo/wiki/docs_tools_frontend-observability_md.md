# docs/tools/frontend-observability.md

## Purpose

Documents how the paired frontend should be observed using a self-hosted, container-based stack (Grafana Faro + Alloy for errors/traces, Umami for product analytics) instead of SaaS tools. It explains the architecture, the `umami-init` seeding mechanism, and the upgrade path to heavier alternatives (Sentry, PostHog, GlitchTip) without requiring a rewrite.

## Key elements

- **Two-job framing** — separates "error/crash + FE perf" (maps to Sentry) from "product analytics" (maps to PostHog) so each gets the right tool.
- **Grafana Faro Web SDK + `grafana/alloy`** — one new browser-facing collector container; routes errors/logs → Loki, FE traces → existing Tempo (stitching onto BE spans via `trace_id`), web-vitals → Prometheus; all visualized in Grafana.
- **Umami (or Plausible)** — one container + small DB for pageviews and basic product events; replaces PostHog cloud for the common case.
- **`umami-init` one-shot job** (`.docker/observability/umami-init.sh`) — runs after DB is healthy; stamps admin credentials (first-run only, factory-password guarded) and a fixed `UMAMI_WEBSITE_ID` row (idempotent via `ON CONFLICT DO NOTHING`).
- **`UMAMI_*` env vars** — all optional; unset values yield a default `admin`/`umami` login and a `Frontend` website with a fixed UUID.
- **Upgrade path table** — lightweight → heavy rung mapping (Faro/Alloy → self-hosted Sentry; Umami → self-hosted PostHog) with container-cost and capability trade-offs.
- **GlitchTip** — noted as a lighter Sentry-API-compatible middle rung (~2–3 containers) for error triage; no equivalent exists for the analytics side.
- **Provider port swap** — backend already has a PostHog implementation behind `NODE_ANALYTICS_PROVIDER`; switching is a config + DSN repoint, not a code rewrite.

## Relationships

- **`docs/tools/analytics.md`** — this page defers to that file for the provider port abstraction (`analytics/posthog.ts`) and the event taxonomy that stays stable when swapping Umami ↔ PostHog. The upgrade section here explicitly references that implementation.
- **`docs/tools/docker-and-podman.md`** — new containers (Alloy, Umami, or later Sentry/PostHog/GlitchTip) are wired into `docker-compose.yml`; this page's swap procedure (step 3) points there for the compose file edit.

## Notes

- `umami-init` is strictly idempotent: re-running after `down`/`up` never overwrites a website row the user edited in the UI, and never resets an already-changed admin password.
- The `UMAMI_WEBSITE_ID` is a **fixed UUID chosen by the repo**, not a randomly generated one. This lets the frontend hardcode `data-website-id` once and remain stable across machines, teammates, and restarts.
- Umami **rejects** events whose `data-website-id` matches no website row — the frontend is blocked until the init job (or a manual UI action) creates the row.
- The page explicitly does **not** recommend running Sentry or PostHog cloud; the "heavy" path is self-hosted only and is framed as a deliberate, ~3× container-footprint decision, not a default.
- There is no "middle rung" equivalent to GlitchTip on the analytics side; the jump is Umami → full PostHog.
