---
source: src/modules/audit-logs/module.yaml
sha256: 7c9fb065c56fdd901c475a3752b8bbf4e5f1cbf26a34ba2a9687feb656059852
generated_at: 2026-11-14T19:24:36.038032+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/module.yaml

## Purpose

Module declaration for the audit-logs domain. It declares the module's ownership boundary (the audit trail itself, including its own read endpoint), classifies it within the platform's taxonomy, and records its upstream dependency.

## Key elements

- **`summary`** — States that this module owns the audit trail and its read endpoint; the platform operator's incident view is explicitly *not* here (it lives in `observability`).
- **`subdomain: generic`** — Categorises the module under the generic subdomain.
- **`group: foundation`** — Places the module in the foundation group.
- **`dependsOn: [access]`** — Declares a dependency on the `access` module. The inline comment specifies the reason: the reasons written onto a refusal row originate there; the operator's incident view omits those details.

## Relationships

- **`src/modules/audit-logs/openapi.yaml`** — The OpenAPI specification for this module's endpoints (the "own" read endpoint referenced in the summary). Together they define the module's public surface.

## Notes

- The module deliberately excludes the operator/incident view of audit events; that surface belongs to `observability`. Do not add operator-facing endpoints here.
- The `dependsOn` entry on `access` is narrowly scoped to refusal-row reason data, not a general permission dependency.
