---
source: src/modules/account/asyncapi.internal.yaml
source_sha256: 8d10608a20725e79d10a0b467fd302f4a8d6ecd2b50b886a8aa6e3822079b4dd
context_sha256: 659cc48641da87ab988fd42296ceaaec034a9aa0b1b3fe41af9c03fb203515d9
generated_at: 2026-11-22T03:19:37.173411+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/asyncapi.internal.yaml

## Purpose
Private AsyncAPI fragment describing the account module's own RabbitMQ queue for personal-data export jobs. It is merged only into the backend-only `asyncapi.yaml`, never into the public document, so the paired frontend never sees it.

## Key elements
- **Channel `worker.account.export`**: the export job queue, bound to the `rabbitmqLocal` server. It carries the `AccountExportJobMessage`.
- **Operation `workerAccountExportPublish`** (`action: receive`): enqueues one account's export build. At most one job per account is outstanding, because only one live export is allowed per account. The job carries the subject the request saw.
- **Operation `workerAccountExportConsume`** (`action: send`): the worker collects each section, writes the file to the private export store, and mails the link. A failure marks the record `failed`. A record still `building` past the job's time limit also counts as `failed`.
- **Message `AccountExportJobMessage`**: titled "Account export job", with payload `AccountExportJobPayload`.
- **Schema `AccountExportJobPayload`**: a closed object (`additionalProperties: false`) with three required string fields:
  - `exportId`: the `accountexports` row, created as `building` before publishing. It acts as a Claim Check, so a lost message still leaves a queryable trace.
  - `userId`: the account being exported. The job reads the address from the account itself, so the message never names a mailbox.
  - `locale`: the language the mail is written in.

## Relationships
- Its description says `POST /account/export` (the account module's HTTP API, see `src/modules/account/openapi.yaml`) enqueues one message per request. The YAML has no `$ref` to that file, so the link is only in the description text.

## Notes
- This is a fragment, not a full document: it has no `asyncapi`, `info` or `servers` keys. For that reason it is excluded from the `lint:asyncapi:modules` glob.
- Its `$ref` to `#/servers/rabbitmqLocal` only resolves once the fragment is merged into the bundled document, where that server is declared. It is validated only as part of the bundled output (`npm run lint:asyncapi`).
- The operation `action` values read oddly: the publish operation uses `receive` and the consume operation uses `send`.
