---
source: src/infrastructure/observability/audit.ts
source_sha256: 75113fa26f2ae2c8ff191c85e9e0714c65a849e3465fe98c20e29a56ae4f0eb1
context_sha256: 2e16232cf10a5fd23c7dcd2a9b354f989311158d794a9ab3a4673c2ed4b001fd
generated_at: 2026-11-22T02:58:11.091797+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/observability/audit.ts

## Purpose
Defines the audit trail: the "who did what to which resource, and did it work" record. It is deliberately separate from application logging. Entries go to a dedicated always-on `auditLogger` with a stable, machine-readable field set. Optionally, a registered persistence sink also stores them so an admin endpoint can query them back.

## Key elements
- `coreAuditActions` (re-exported from `./audit-actions.generated`): app-level action constants in `domain.resource.verb` form. They cover requests refused by guards before any domain saw them. The source list is `shared/rules/audit-actions.yaml`.
- `AuditActionMap`: an empty interface that modules augment through declaration merging with their own actions. This keeps `infrastructure` from importing any module.
- `AuditAction`: the union of the core actions and every module-declared action.
- `AUDIT_ACTOR_ROLES`, `AUDIT_OUTCOMES`, `AUDIT_LEVELS`: value arrays taken from the generated `AuditEntryItem*` enums. They are the schema's `enum`s.
- `AuditEvent`: the entry shape. Required fields are `actorUserId` (`'unknown'` when unresolvable), `actorRole`, `actorScope`, `action` and `outcome`. Optional fields are `actorRoleName`, `actorCredentialId` (public api-key prefix only), `ip`, `userAgent`, `requestId`, `traceId`, `targetType`, `targetId`, `subjectId` and `metadata`.
- `AuditEntry`: an `AuditEvent` plus `timestamp` and `level`, both added at emit time.
- `AuditSink` / `registerAuditSink(sink)`: a port for persistence. `app.ts` supplies the implementation at boot, and the call is made from `@modules/audit-logs/module`'s `onRegistered`.
- `emitAuditEvent(event)`: scrubs credentials and logs the line via `auditLogger.log(level, action, scrubbed)`. If a sink is registered, it then builds the `AuditEntry` and passes it to the sink inside a try/catch. A sink failure is logged as `audit.sink.failed`.
- `extractRequestContext(context)`: pulls `ip`, `userAgent`, `requestId` and `traceId` from a `CallerContext`. The trace id comes from `getActiveSpanContext()`.
- `resolveActorRole` (internal): derives `actorRole` from the caller context. The file shown ends partway through its body.

## Relationships
- Depends on `src/infrastructure/adapters/logger.ts` for `auditLogger` and `redactCredentials`.
- Depends on `src/infrastructure/observability/span-context.ts` for the active trace id.
- `scripts/docs/generate-audit-actions.ts` is the likely producer of the generated actions file that this file re-exports.
- The remaining neighbors (`src/infrastructure/http/middlewares/origin.ts`, `src/infrastructure/http/middlewares/rate-limit.ts`, `src/infrastructure/observability/forbidden.ts`, `src/infrastructure/observability/security-events.ts`, `src/kernel/middlewares/authorizations.ts`, `src/kernel/staff-read.ts`, and the access and account services) are consumers that emit audit events. The visible part of this file does not show their exact usage. The docblocks name the guards and `requirePermissionGuard` as emitters of the core actions.

## Notes
- `infrastructure` sits at the bottom of the dependency graph and may not import `@kernel/*` or `@modules/*`. This is why the sink is a port, the action map is augmented by modules, and `resolveActorRole` reads `unrestricted` and `system` from `context.caller` rather than re-deriving them.
- Level mirrors outcome: `success` logs as `info`, anything else as `warn`.
- Credentials in `metadata` are scrubbed once, so the log line and the stored row match. Personal fields stay raw in the stored row and are handled only by the logger's own pipeline for the line.
- Sinks MUST be fire-and-forget and MUST NOT throw or reject. An unregistered sink is a supported state (unit tests, queue workers), and the log line is still written.
- `context.caller` is always resolved in tenant scope. A platform-key check must therefore pass `actorScope` explicitly, as `requirePermissionGuard` does.
- `ip` reflects the proxy address unless Express `trust proxy` is configured.
- Field names are camelCase here, in Mongo and in the API. The logger's `semanticNamesFormat` renames them to OpenTelemetry names in the log line only.
