---
source: src/modules/notifications/tests/integration/ticket-alerts.test.ts
sha256: da7531b0e46d4302513453bf01e737c509a5150766661048f8fffb4ed7c1f193
generated_at: 2026-10-29T04:33:47.648916+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/tests/integration/ticket-alerts.test.ts

## Purpose

Integration tests that drive the ticket-alert pipeline end-to-end through the real registered modules: a contact message or a ticket handover is filed via `ticketService`, and the tests assert on the in-app bell (who is told, with what params) and the email queue (what is and is *not* in the per-person notice or the fallback mailbox). The goal is to lock down the notification contract—audience, content sanitisation, and fallback semantics—without spinning up a mail server.

## Key elements

- **`staff(role, email, locale?)`** — creates a user with an authenticator app so they qualify for personal notice mail.
- **`bellOf(role, userId)`** — reads the in-app notification bell for a given user/role scoped to the deployment tenant.
- **`fileContact(category?)`** — files a contact ticket through `ticketService.create` with a fixed visitor identity (Ada Lovelace).
- **`noticeMails()` / `fallbackMails()`** — filter the mocked `enqueueEmail` call list by template name (`notifications.staff-notice` vs `tickets.contact`).
- **`handOver()`** — creates a refund ticket and two staff (admin + moderator) for the assignment suite.
- **`describe('a contact message')`** — verifies audience targeting (support/admin yes, manager no), mail content (link + category, no visitor PII), uncategorised label, fallback silence, spam silence, and idempotency under duplicate event delivery.
- **`describe('a system ticket')`** — verifies route-set-based targeting (`PaymentRefunding` → moderator), that system tickets never reach the fallback mailbox, and that `TICKET_OPENED` resolves to `'ticket.opened'`.
- **`describe('a ticket handed to a colleague')`** — verifies the assignee-only bell, no mail on assignment, self-assignment exclusion, and that a second handover produces a second bell.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/notifications/services/index.ts` | SUT under test: `notificationsService.listVisible` (bell) and `notificationsService.onTicketOpened` (event handler / idempotency). |
| `src/modules/tickets/index.ts` | `ticketService` is the production entry point for `create` and `assign`; `TICKET_OPENED` constant is asserted. |
| `src/modules/tickets/service.ts` | Concrete implementation behind the `ticketService` import. |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` is fully mocked; all mail assertions read its call list. |
| `src/kernel/registry.ts` | `registerModules(enabledModules)` wires the real module graph each test. |
| `src/modules.ts` | Supplies the `enabledModules` array passed to the registry. |
| `src/kernel/events.ts` | `resetDomainEvents()` clears the in-process bus between tests. |
| `src/kernel/permissions.ts` | `callerInScope` builds the authenticated tenant-scoped context for `bellOf`. |
| `src/kernel/access/tenant.ts` | `DEPLOYMENT_TENANT_ID` pins every scope to the deployment's tenant. |
| `src/modules/users/tests/factories.ts` | `createUser` provisions staff and the unauthenticated fallback user. |
| `src/modules/tickets/tests/factories.ts` | `createRefundTicket` provisions the ticket used in the hand-over suite. |
| `src/types/index.ts` | `TicketCategory` enum values used when filing contact tickets. |
| `tests/support/callers.ts` | `asRole` / `callerContextAs` build the caller identities for service calls. |
| `tests/support/environment.ts` | `setEnvironment` injects `NODE_CONTACT_NOTIFY_EMAIL` for the fallback address. |
| `tests/support/response.ts` | `asSuccess` unwraps the Result envelope on `ticketService.assign`. |

## Notes

- **Mail queue, not mail.** `enqueueEmail` is a jest mock; tests never inspect an SMTP server. All assertions are on the argument tuples (envelope, locale, data) and template name.
- **Idempotency test bypasses the service layer.** It calls `notificationsService.onTicketOpened(fact)` directly twice to simulate duplicate bus delivery, then asserts exactly one bell entry and one notice mail.
- **Spam is detected by the `website` field.** A ticket created with `website` set produces zero `enqueueEmail` calls—no bell, no notice, no fallback.
- **System tickets never trigger the fallback mailbox.** Even with zero permitted users, a `dispute`/`manual_refund_owed` ticket results in no `tickets.contact` mail.
- **Self-assignment is a no-op for notifications.** Assigning a ticket to the caller's own id produces no bell entry.
- **`resetDomainEvents()` runs in both `beforeEach` and `afterEach`.** Forgetting either can leak event listeners into the next test.
- **Locale propagation.** The `staff` helper accepts a locale (default `'en'`); the mail test uses `'it'` and asserts the link prefix and the humanised category string respect it.
