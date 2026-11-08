---
source: src/modules/observability/authorization.yaml
sha256: 6fc15f2b623dbbf37887bfc4000ea5185747df590b20ba38c5b6db9f86f9f8c4
generated_at: 2026-11-08T06:38:00.499390+00:00
model: ollama:qwen3.8:27b
---

# src/modules/observability/authorization.yaml

## Purpose
Declares the authorization rules and rule-set for the observability module. It is the sole platform-scope module in the boilerplate, granting read access to health, metrics, and the operational audit — concerns that belong to the installation as a whole rather than to any single shop's content.

## Key elements
- **rules** — a single entry: `read` on subject `ObservabilitySnapshot` (module `observability`, scope `platform`).
- **sets → ObservabilityDisplay** — a named bundle wrapping `read:ObservabilitySnapshot` so that clients or policies can reference the full observability read permission as one identifier.

## Relationships
- `src/modules/observability/openapi.yaml` — defines the `ObservabilitySnapshot` resource whose access is governed by the rule in this file.

## Notes
- This is the only boilerplate module with `scope: platform`. The inline comment states this is intentional: it makes the platform-scope invariant testable in the boilerplate itself rather than only in a downstream project.
- The single rule and single set mean `ObservabilityDisplay` is effectively an alias for the one available permission; there is no write or partial-access variant.
