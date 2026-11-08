---
source: src/modules/account/asyncapi.internal.yaml
sha256: 8d10608a20725e79d10a0b467fd302f4a8d6ecd2b50b886a8aa6e3822079b4dd
generated_at: 2026-11-08T03:59:40.104319+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/asyncapi.internal.yaml

## Purpose

AsyncAPI fragment that declares the account module's private worker queue for personal-data export jobs. It exists separately from the module's public contract so the paired frontend never sees the `backend`-only channel, and so the fragment can be merged into `asyncapi.yaml` without carrying its own `asyncapi`/`info`/`servers` envelope.

## Key elements

- **`channels.worker.account.export`** — RabbitMQ channel bound to `rabbitmqLocal` (declared in `shared/contracts/asyncapi.workers.yaml`). One message per export request; at most one outstanding job per account.
- **`operations.workerAccountExportPublish`** (action: `receive`) — Enqueues a job after `POST /account/export`. The payload snapshots the subject the caller was entitled to at request time.
- **`operations.workerAccountExportConsume`** (action: `send`) — Worker collects sections one at a time, writes to the private export store, and mails the link. A record stuck in `building` past the time limit is treated as `failed`.
- **`components.messages.AccountExportJobMessage`** — Wraps the payload schema; named message used by both operations.
- **`components.schemas.AccountExportJobPayload`** — `{ exportId, userId, locale }`, `additionalProperties: false`. The message names the account (`userId`), not the destination mailbox; the worker resolves the address from the account at consume time. `exportId` points at the `accountexports` row created `building` before publish (Claim Check pattern).

## Relationships

- **`src/modules/account/module.ts`** — The account module that produces and consumes this queue. The publish path fires from the `POST /account/export` handler; the consume path is the worker that builds and mails the file.
- **`src/modules/account/module.yaml`** — Sibling module configuration; this file complements it with the queue contract that `module.ts` enforces at runtime.

## Notes

- This is a **fragment**, not a standalone AsyncAPI document. It intentionally omits `asyncapi`/`info`/`servers`, which is why it is excluded from the `lint:asyncapi:modules` glob. Validation happens against the **bundled** output via `npm run lint:asyncapi`.
- It is merged **only** into `asyncapi.yaml`, never `asyncapi.public.yaml`, keeping the channel invisible to the frontend.
- The channel references `#/servers/rabbitmqLocal` and `#/components/...` via relative `$ref`, which resolve only in the merged document—standalone linting of this file will not pass.
- `exportId` follows a Claim Check / EIP pattern: the DB row is the source of truth, so a lost message still leaves a queryable `building` record.
