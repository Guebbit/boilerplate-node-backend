---
source: src/modules/audit-logs/openapi.yaml
source_sha256: 9c0b91625a03ccd7fab604a9cb514aca3c4000735fcce71d1bbfeebb41b3f361
context_sha256: e246d121d37d93d543af42e76d6c62764ed9fb9a779f21d091977435dec7f6b1
generated_at: 2026-11-22T04:27:18.806888+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/audit-logs/openapi.yaml

## Purpose
OpenAPI 3.1.0 contract (v0.1.0) for the `audit-logs` module. It defines a single read-only endpoint, `GET /audit`, which returns a shop's own action history, and the schemas for that data. It also declares the module's contribution to the account data export. Per its own description, this is separate from Observability's platform-operator audit.

## Key elements
- **Tag `Audit`** (`x-family: Core`): groups the module's operations.
- **`x-personal-data`**: adds two sections to `AccountExportResponse` for `POST /account/export`, which the bundler assembles.
  - `auditLog` is an array of `AuditEntryItem`.
  - `consultations` is an `AuditConsultations`.
  - Removing the module removes these sections.
- **`GET /audit`** (`listAuditEntries`):
  - Returns entries newest first, with no `sort` parameter.
  - Security: `bearerAuth` or `apiKeyAuth`, both requiring the `read:AuditLog` scope. The description says `admin` holds it in the demo.
  - Query filters:
    - `actor`
    - `action`
    - `outcome` (`success` or `failure`)
    - `target`
    - `subject` (the `subjectId`, used to answer "who looked at this person's data")
    - `since` (exclusive lower bound)
    - `ownOrder` (boolean, matches `metadata.ownOrder`)
    - the shared `PageParam` and `PageSizeParam`
  - `meta.totalItems` counts all matching entries, not only the current page.
  - Responses: 200 (`AuditEntriesResponse`), 401, 403 and 422, the last three shared from the root contract.
- **`AuditEntryItem`**: the single row shape. Required fields are `actorUserId`, `actorRole`, `actorScope`, `action`, `outcome`, `timestamp` and `level`.
  - `actorRole` is one of `admin`, `user`, `anonymous` or `system`.
  - `actorScope` is `tenant` or `platform`.
  - `action` must match a dotted lowercase pattern such as `order.created`.
  - `level` is `info` or `warn`.
  - Optional fields include `actorCredentialId`, `actorRoleName`, `ip`, `userAgent`, `requestId`, `traceId`, `targetType`, `targetId`, `subjectId` and `metadata`.
  - `metadata` is deliberately open. Its documented keys are `ownOrder`, `changes` and `changedFields`.
- **`AuditConsultations`**: `windowDays` plus a list of `AuditConsultation` entries. It covers staff opening records about the person, for their GDPR Art. 15 export.
- **`AuditConsultation`**: holds `timestamp`, `targetType`, `targetId` and `purpose`. It deliberately omits the staff member.
- **`AuditEntriesResponse`**: `{ items: AuditEntryItem[], meta: PaginationMeta }`.

## Relationships
- `src/modules/audit-logs/authorization.yaml` is the module's neighbor. The `read:AuditLog` scope used by `GET /audit` is presumably defined there, but that file's content isn't visible here.
- `AuditEntryItem` is shared with `GET /observability/audit` and the account export. The file comments say one serializer, `applyAuditLogTransform`, produces all three.

## Notes
- `ip` is recorded as-is in this API. The platform trail instead returns a keyed digest (`hmac:` plus 12 hex characters).
- `metadata` is left open on purpose, because a declared-properties object would be validated as closed by the generated schema.
- Updates log only the NAMES of free-text and personal fields (`changedFields`), never their values. The trail is not scrubbed on erasure.
- Consultations cover only the last `windowDays` days (`NODE_AUDIT_RETENTION_DAYS`). Guest orders and the orders CSV export are not covered.
- All object schemas set `additionalProperties: false`, except `metadata`.
- The shared parameters (`PageParam`, `PageSizeParam`), `PaginationMeta` and the 401/403/422 responses are `$ref`s into `shared/contracts/openapi.root.yaml`.
