---
source: src/modules/account/asyncapi.domain-events.yaml
source_sha256: 5dadb7a21a908b603ed2eb16c409ef1fb5ba982bb1a9f88ed81ae0718a48be3b
context_sha256: 00e839654585273fafe67f8c383bc7eda6473916ecdc8d6c66b8ed0882c539cf
generated_at: 2026-11-22T03:19:25.317678+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/asyncapi.domain-events.yaml

## Purpose
AsyncAPI fragment declaring the domain events the `account` module emits. Its header says it is merged into the `domain-events` section (`shared/contracts/asyncapi.domain-events.yaml`) and is backend-only. It is a fragment, not a standalone document.

## Key elements
All five channels use `x-transport: outbox`, and each has a `send` operation and a message with a payload schema (`additionalProperties: false`).

| Channel (address) | Meaning | Payload (required) |
|---|---|---|
| `domain.account.sessions_revoked` (`account.sessions_revoked`) | The owner logged out everywhere, recovered the account through a password reset, or reported an email change as not theirs. `api-keys` subscribes and revokes the keys the person minted. | `userId`, `reason` (enum `password-reset`, `logout-all`, `email-change-undo`; titled `SessionsRevokedReason`) |
| `domain.account.authenticator_removed` | A staff member's last authenticator app was removed. Their role grants nothing from then on, and `api-keys` revokes what they minted. Not a compromise, so not a session revocation. | `userId` |
| `domain.account.analytics_consent_withdrawn` | Analytics consent went from `true` to `false`, committed with the profile save. `account` itself subscribes and asks the analytics provider to forget the id (GDPR Art. 7(3), 17). | `userId` |
| `domain.account.export_failed` | A data export could not be built, committed with its row moving to `failed`. `tasks` opens work from it (GDPR Art. 12(3)). | `userId`, `exportId` |
| `domain.account.export_ready` | A data export is ready, committed with its row moving to `ready`. A later ready export closes the work an earlier failure opened. | `userId`, `exportId` |

- **operations**: `domainAccountSessionsRevoked`, `domainAccountAuthenticatorRemoved`, `domainAccountAnalyticsConsentWithdrawn`, `domainAccountExportFailed` and `domainAccountExportReady`. All use `action: send` and reference their channel and message.
- **components.messages**: `Account*DomainEvent`, one per channel, each with a `title` and a payload `$ref`.
- **components.schemas**: `Account*DomainEventPayload`, one per message.

## Relationships
- `src/modules/account/module.ts` is the `account` module that owns these events. The file itself does not show how the module wires them.
- `src/modules/api-keys/module.ts` is the `api-keys` module. The descriptions name it as the subscriber of `sessions_revoked` and `authenticator_removed`, where it revokes keys.
- `src/modules/analytics/openapi.yaml` is an analytics API spec. The file does not reference it directly. The consent-withdrawn description says `account` asks "the analytics provider" to forget the id.
- `tasks` subscribes to `export_failed`. It is named in a description but is not among the graph neighbors.

## Notes
- The `summary` of `domainAccountExportFailed` is truncated at "(GDPR Art." The full text is in the channel `description`.
- Long `$ref` strings in `operations` are split across lines with `\` escapes inside double-quoted YAML, so grep for the full message name may miss them.
