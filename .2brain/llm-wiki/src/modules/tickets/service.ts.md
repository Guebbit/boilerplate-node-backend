---
source: src/modules/tickets/service.ts
sha256: 8c38dcdfaa49b573093be4cc2cb313924faf25fceebc61675c270f8d24a725c8
generated_at: 2026-10-29T06:05:30.660081+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tickets/service.ts

## Purpose

Service layer for the tickets module's non-workflow operations: creating contact-form tickets (with spam screening and domain-event announcement), staff search and read, the fallback-mailbox notification, and the module's two `personalData` halves (export and erasure). State-transition operations (resolve, assign, add note) live in `./workflow`; the business rules they enforce live in `./domain`.

## Key elements

- **`create(payload, subjectId?)`** – Persists a new contact ticket. Screens the sender via honeypot (`payload.website`) and `checkEmailPolicy`; suspected spam is stored as `status: closed / resolution: spam` and emits no event. Legitimate tickets get a `dueAt` SLA stamp and fire `TICKET_OPENED` on the event bus.
- **`mailFallbackMailbox(ticketId)`** – If no assignee has an address, emails the visitor's message to `NODE_CONTACT_NOTIFY_EMAIL` with a `Reply-To` header. No-op when the mailbox is unset, the ticket is missing, or the kind is not `contact`. Queue failures are logged, never thrown.
- **`scopeOf(filters, context, now)`** – Builds the MongoDB `$and` clause set for a search: jurisdiction bound, optional `overdue` (open + `dueAt < now`), `assignee` (`none` / `me` / id), plus pass-through for `status`, `category`, `source`, `kind`.
- **`search(filters, context)`** – Paginated ticket search via `ticketRepository.search`. Resolves assignee display names, applies the viewer's presentation view, and records an `ADMIN_TICKET_VIEWED` audit entry.
- **`getById(id, context)`** – Single-ticket read. Returns 404 (not 403) when the ticket is absent **or** outside the caller's jurisdiction. Hydrates assignee name and, for linked records, fetches up to 20 earlier tickets via `earlierThan`.
- **`earlierThan(ticket, context)`** – Queries prior tickets sharing the same `link.type` / `link.id`, newest first, within jurisdiction, capped at 20.
- **`contactSlaMs()`** – Derives the overdue deadline offset from `ticketsConfig().NODE_TICKETS_CONTACT_SLA_HOURS`.
- **`TicketFilters`** – Omit type over `SearchTicketsRequest` that widens `page`/`pageSize` to accept string inputs from HTTP.

## Relationships

- **`@infrastructure/adapters/antibot.ts`** – Calls `checkEmailPolicy(email)` during `create` to detect disposable-inbox domains.
- **`@infrastructure/adapters/logger.ts`** – `logger.error` in `mailFallbackMailbox` when the mail queue rejects.
- **`@infrastructure/adapters/mailer.ts`** – `enqueueEmail` delivers the fallback-mailbox message.
- **`@infrastructure/http/response.ts`** – `generateSuccess` / `generateReject` shape the HTTP envelopes returned by `getById`.
- **`@infrastructure/i18n/*`** – `t` for user-facing error strings (404 message); `getDefaultLocale` for the operator-facing fallback email.
- **`@infrastructure/observability/audit.ts`** – `recordAudit` logs `ADMIN_TICKET_VIEWED` in `search`.
- **`@infrastructure/persistence/create-repository.ts`** – `toObjectId` converts string ids to Mongoose `ObjectId`; `Lean` type used in return shapes.
- **`@infrastructure/persistence/normalize-email.ts`** – `normalizeEmail` lowercases/strips the sender address before storage.
- **`@infrastructure/persistence/search.ts`** – Provides `PaginatedMeta` and the pagination constants used by `search`.
- **`@kernel/access/tenant.ts`** – `DEPLOYMENT_TENANT_ID` stamped into the `TICKET_OPENED` event payload.
- **`@kernel/events.ts`** – `emitDomainEvent(TICKET_OPENED, …)` is the sole outbound signal of a legitimate ticket creation.
- **`@kernel/registry.ts`** – `PersonalDataSubject` type anchors the export/erasure (personal-data) operations.
- **`src/modules/notifications/services/subscribers.ts`** – Consumes `TICKET_OPENED` to fan out assignment/notification logic; this file never mails the sender directly for that purpose.

## Notes

- **Spam is silent.** Both honeypot and disposable-email rejections return `201 Created` and store the row as `resolution: spam` so that automated scripts learn nothing from the response. No domain event, no email.
- **404, not 403, for out-of-jurisdiction reads.** `getById` and the search scope both enforce jurisdiction; a ticket the caller cannot see is indistinguishable from one that does not exist.
- **`assignee=me` with an API-key caller** (no linked account) resolves to a match-nothing clause (`_id: { $in: [] }`) rather than an error.
- **`replyTo` hygiene.** The fallback-mailbox email sets `Reply-To` to the bare normalised address only; the visitor's free-text `name` is deliberately excluded from headers.
- **SLA is configurable but not per-category.** `contactSlaMs` reads a single env-driven value (`NODE_TICKETS_CONTACT_SLA_HOURS`); there is no per-kind or per-category override visible in this file.
- **The file is the "one event, not write-then-remember" boundary** for ticket creation: the HTTP layer calls `create` and gets the document back; the event bus and notifications module do the rest.
