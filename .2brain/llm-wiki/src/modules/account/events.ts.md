---
source: src/modules/account/events.ts
source_sha256: c1e86e09bdb50fdc1b6556a48fb1766958e05d975999d600624b9a8692c75e85
context_sha256: 4da102a37e0ff28e21a5f5c55dcd4a178ac9ed71cd05dae3c9c8d42c2f5349ba
generated_at: 2026-11-22T03:29:31.332805+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/events.ts

## Purpose
Declares the domain event name constants emitted by the `account` module. The event definitions live in `./asyncapi.domain-events.yaml`; this file exposes their names as typed constants so emitters and subscribers don't use raw strings.

## Key elements
- `ACCOUNT_SESSIONS_REVOKED` — `'account.sessions_revoked'`
- `ACCOUNT_AUTHENTICATOR_REMOVED` — `'account.authenticator_removed'`
- `ACCOUNT_ANALYTICS_CONSENT_WITHDRAWN` — `'account.analytics_consent_withdrawn'`
- `ACCOUNT_EXPORT_FAILED` — `'account.export_failed'`
- `ACCOUNT_EXPORT_READY` — `'account.export_ready'`
- `SessionsRevokedReason` — type re-exported from `./domain/revocation`.

## Relationships
- `src/kernel/events.ts`: supplies the `DomainEventName` type. Each constant uses `satisfies DomainEventName`, so the compiler checks it against the kernel's event-name type while keeping its literal string type.
- `src/modules/account/domain/revocation.ts`: the source of the re-exported `SessionsRevokedReason` type.
- The other neighbors (`index.ts`, `module.ts`, and the `services/` files `export-job.ts`, `profile.ts`, `revocation.ts`, `two-factor-enrollment.ts`) are linked to this file in the dependency graph. The file itself only exports constants and a type. Their specific usage isn't visible here.

## Notes
- The constants are the source of truth for names in code. The AsyncAPI YAML is the source of truth for event schemas and channels.
- Adding a new event means declaring it in the YAML and adding a constant here that satisfies `DomainEventName`.
- The file contains no runtime logic.
