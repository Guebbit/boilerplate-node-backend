---
source: shared/rules/semantic-log-names.yaml
source_sha256: c41f334b81832e7e081d165fa7642405b714c3aeb41c45321a3394c8e13f06e9
context_sha256: 0c95844c03af7e2bb807e99f0749eb3d86ac3c2fe5ae589f772b2d352b59cdfd
generated_at: 2026-11-22T02:28:32.622434+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/semantic-log-names.yaml

## Purpose
Single source of truth mapping each camelCase field the code logs to the name it is written with in structured log lines. It uses standard OpenTelemetry semantic-convention names where the spec defines one, and `app.*` for custom attributes, so custom fields never sit on a standard namespace. `traceId` and `spanId` become top-level `trace_id` and `span_id`, matching the OpenTelemetry Logs Data Model and Grafana's Loki → Tempo link.

## Key elements
- `semanticLogNames`: the only top-level key, a flat map of `camelCaseField: target.name`.
- Process and host fields: `service` → `service.name`, `pid` → `process.pid`, `hostname` → `host.name`.
- Trace context: `traceId` → `trace_id`, `spanId` → `span_id`.
- Request fields:
  - Standard names: `method` → `http.request.method`, `route` → `http.route`, `statusCode` → `http.response.status_code`, `ip` → `client.address`, `userAgent` → `user_agent.original`.
  - Custom names: `requestId` → `app.request.id`, `clientRequestId` → `app.request.client_id`, `durationMs` → `app.request.duration_ms`.
- Audit and actor fields:
  - Standard names: `action` → `event.name`, `actorUserId` → `user.id`.
  - Custom names: `outcome` → `app.audit.outcome`, `actorRoleName` → `app.actor.role_name`, `actorCredentialId` → `app.actor.credential_id`, `actorScope` → `app.actor.scope`.
- Target fields: `targetType` → `app.target.type`, `targetId` → `app.target.id`.

## Relationships
- `shared/rules/log-redaction.yaml` is a sibling rules file under `shared/rules/`. This file defines the names fields are written with. The redaction file presumably covers which logged fields are redacted. No direct reference between the two is visible in this file's content.

## Notes
- It is not read at boot. `npm run regenerate` generates `src/infrastructure/adapters/semantic-names.ts` from it. After editing the YAML, regenerate rather than hand-editing the generated file.
- Each side converts the case of its own field names, so this table is the only place the target names are defined.
- Custom attributes belong under the producer's own `app.*` namespace, not under a standard one.
