---
source: src/modules/audit-logs/module.yaml
sha256: 2c0d159010dc410c90e86d61105c5ddd1bb3242685648306d0056f7f2d610a93
generated_at: 2026-11-08T05:08:21.607728+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/module.yaml

## Purpose

Module identity file for the audit-logs subdomain within the `foundation` group. It declares that this module *owns* the audit trail (its own read endpoint is authoritative), notes that the platform-operator's incident view lives elsewhere (observability), and records the single upstream dependency.

## Key elements

- **`summary`** — One-line ownership statement: the module is the source of truth for the audit trail; the operator's read view is delegated to observability.
- **`subdomain: generic` / `group: foundation`** — Classification within the platform's module hierarchy.
- **`dependsOn: [access]`** — Depends on the `access` module. The inline comment clarifies *why*: access produces the refusal-reason rows that appear in the audit trail but are omitted from the operator's incident view.
- **`noAudit`** — Exemption marker: this module is the *destination* of audit events, not a writer, so it is excluded from its own audit trail.

## Relationships

- **`access` (upstream dependency)** — Provides refusal-reason data that the audit-logs module records. Without `access`, refusal rows would lack their reason field.
- **`src/modules/audit-logs/openapi.yaml`** — The OpenAPI specification for this module's endpoints (including the read endpoint referenced in `summary`).

## Notes

- The `noAudit` value is a convention, not a config flag consumed by code; it signals to tooling (or reviewers) that this module should not appear in its own log output.
- The distinction between "this module's read endpoint" and "the platform operator's view in observability" is an architectural boundary: if you are looking for operator-facing incident queries, they are **not** defined here.
