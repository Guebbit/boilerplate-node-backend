---
source: shared/rules/semantic-log-names.yaml
sha256: 1dda4a96cf8fb11642ad76268e0e457dc558d1e91b26fd01a88128be18746493
generated_at: 2026-11-08T03:11:38.591989+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/semantic-log-names.yaml

## Purpose

Single source of truth mapping each camelCase log-field the code writes to the exact name that appears on the structured log line. It enforces OpenTelemetry semantic-convention names where the spec defines one and reserves the `app.*` namespace for producer-specific attributes. Consumed only by the codegen step (`npm run regenerate`) that emits `src/infrastructure/adapters/semantic-log-names.generated.ts`.

## Key elements

- **`semanticLogNames`** – Flat map of 18 entries. Each key is the camelCase field the emitting code passes; each value is the wire name written to the log record.
  - Standard OTel names (e.g. `service.name`, `http.request.method`, `http.response.status_code`, `client.address`, `user_agent.original`, `event.name`).
  - `trace_id` / `span_id` – top-level (no dot) because the OTel Logs Data Model places trace context at the record root and Grafana's Loki → Tempo link reads that exact key.
  - `app.*` names – all custom/producer-specific attributes (`app.request.id`, `app.request.duration_ms`, `app.audit.outcome`, `app.actor.*`, `app.target.*`).
- **Codegen contract** – `npm run regenerate` reads this file and produces `src/infrastructure/adapters/semantic-log-names.generated.ts`. The generated module is the runtime accessor; the YAML is never loaded at boot.

## Relationships

- **`shared/rules/log-redaction.yaml`** – Both files operate on the same set of log fields. `semantic-log-names.yaml` decides *what the field is called* on the wire; `log-redaction.yaml` decides *which of those wire names get value-redacted* before the line is emitted. They must stay in sync: a field named here and redacted there must use the same target name.

## Notes

- This table is the **only** place target names live. Each calling site converts its own camelCase key to the value in this map; do not hard-code wire names elsewhere.
- `traceId` → `trace_id` and `spanId` → `span_id` are intentionally **not** dotted (`app.trace_id` would break Loki → Tempo correlation).
- Adding a new log field requires editing this file **and** re-running `npm run regenerate` to refresh the generated TS module. Forgetting the regen step means the new field falls back to an un-mapped (or missing) name at runtime.
