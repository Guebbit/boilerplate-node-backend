---
generated_at: 2026-11-15T00:27:05.001513+00:00
model: ollama:qwen3.8:27b
---

# Repository Overview

## What This Is

A TypeScript/Node.js HTTP API service built around **users** and **products** modules. It is containerized with Docker, backed by MongoDB (including replica-set initialization), and wrapped in a full observability stack. The project ships with its own VitePress documentation site, backup/restore tooling, and deployment drills.

## Main Areas and How They Relate

| Area | Location | Role |
|------|----------|------|
| **Application core** | `src/` | Domain modules (`users`, `products`), shared types (`src/types/`), HTTP layer, i18n, logging, adapters. `src/types/index.ts` is the central type hub (imported by ~648 files). |
| **Tests** | `tests/` | Integration test suite with dedicated support infrastructure (test DB setup, HTTP helpers, factory objects per module). |
| **Container & deployment** | `docker/`, `docker-compose*.yml` | Dockerfiles, MongoDB entrypoint/replica-set init, SuperCronic scheduling, deploy/restore-drill scripts. Multiple compose files separate dev, test, production, proxy (Traefik), and backup-server topologies. |
| **Observability** | `docker/observability/` | Prometheus (+ alert rules), Grafana dashboards/datasources, Loki, Tempo, OpenTelemetry Collector, Alertmanager, Gatus (black-box checks), and Umami (analytics). Config templates and validation scripts included. |
| **Backup & DR** | `docker/backup/` | Scripted backup, maintenance, restore-drill, and server-maintenance routines. |
| **Documentation site** | `docs/` | VitePress site covering getting-started guides, API reference (errors, responses, write-methods), operational reference, and design-theory pages (authorization, data protection, API standards). |
| **Repo tooling** | root files | `CLAUDE.md` (AI-assistant guidance), `commitlint.config.cjs` (conventional-commit enforcement), `SECURITY.md`, `INSTALL.md`. |

**Relationship in one line:** `src/` is the API → `tests/` verifies it → `docker/` packages and runs it → `docker/observability/` monitors it → `docs/` explains it to humans and operators.

## Where to Start Reading

1. **`README.md`** – project purpose, quick-start, and pointer to the docs site.
2. **`CLAUDE.md`** – conventions and context tailored for AI-assisted work.
3. **`src/types/index.ts`** – the shared type surface; understanding it unlocks the module APIs.
4. **`src/infrastructure/http/response.ts`** – canonical HTTP response shape (imported by ~313 files).
5. **`docs/getting-started.md`** → **`docs/getting-started-production.md`** – local vs. production setup.
6. **`docs/reference/ops.md`** and **`docs/reference/tests.md`** – operational and testing workflows.
7. **`docker-compose.yml`** + **`docker/Dockerfile`** – how the pieces are wired together at runtime.

> **Note:** The repository contains 2 500+ additional files beyond those listed here (the dependency graph truncates at 2 506). The modules under `src/modules/` likely extend beyond `users` and `products`; explore that directory tree for the full domain surface.
