---
source: src/modules/observability/module.yaml
sha256: 42e2a1ab7d66983e7bbdbe43d637640a3381995c626a7fac10e33eafff48f6ab
generated_at: 2026-11-08T06:40:03.249047+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/module.yaml

## Purpose

Module manifest for the **observability** subdomain. It declares the module's identity (summary, subdomain, group) and its dependency on the `audit-logs` module, serving as the routing/configuration entry point that the platform uses to register this module's endpoints (health, metrics, audit read, SSE stream).

## Key elements

- **`summary`** — Human-readable description: "Health, metrics, the platform operator's audit read and the SSE stream."
- **`subdomain: generic`** — Places the module in the *generic* subdomain namespace.
- **`group: foundation`** — Classifies the module under the *foundation* group.
- **`dependsOn`** — Lists `audit-logs` as a required dependency, annotated with the endpoint `GET /observability/audit` that this module consumes.

## Relationships

- **`module.ts`** — The TypeScript entry point for this module; this YAML is its declarative manifest (identity + dependencies) that the loader reads alongside the code.
- **`openapi.yaml`** — The OpenAPI specification describing the actual request/response schemas for this module's endpoints; the manifest here references the module that that spec belongs to.
- **`audit-logs` module** — Upstream dependency; the observability module calls its `GET /observability/audit` endpoint.

## Notes

- The `dependsOn` entry carries an inline comment naming a specific route (`GET /observability/audit`). This is the only cross-module contract made explicit in the file; the remaining endpoints (health, metrics, SSE) are self-contained.
- `subdomain: generic` + `group: foundation` together determine how this module is grouped in generated docs and admin UIs—do not change these without coordinating with the platform's module registry.
