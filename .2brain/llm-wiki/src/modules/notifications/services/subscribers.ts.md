---
source: src/modules/notifications/services/subscribers.ts
sha256: e62114003c3bd05cd181cea8020c72fe8e11d61c2409c45cf79241fa5160616d
generated_at: 2026-11-08T06:34:08.251846+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/services/subscribers.ts

## Purpose

Maps each domain event in the notifications domain to the staff "notice" it should produce in the inbox. Each exported function is a pure mapping from an event payload to a `notifyStaff` / `notifyStaffMember` call; the module's `subscribe()` (wired in `services/index.ts`) attaches them to the event bus. The actual persistence of notices is delegated to `./staff`. Project-specific (shop) notices do **not** live here — they call `notificationsService` directly from the module that adds them.

## Key elements

- **`onWebhookSubscriptionAutoDisabled`** – Notifies staff on webhook disable; deduped by `subscriptionId` + timestamp.
- **`onOutboxEventDead`** – Notifies admins that a delivery was parked after final retry; always scoped to `DEPLOYMENT_TENANT_ID`.
- **`onTaskOpened`** – Notifies the working sets for the task kind; if kind is `contact`, also mails the main mailbox via `taskService.mailMainMailbox`.
- **`onTaskOverdue`** – Same shape as opened, plus a main-mailbox reminder for `contact` tasks.
- **`onTaskDueSoon`** – 3-day-before-due alert; same contact-mailbox side effect.
- **`onTaskAssigned`** – Single-recipient notice to the new assignee (uses `notifyStaffMember`).
- **`alertSetsOf`** (private) – Resolves which permission sets hear about a task; `contact` kind always resolves to `TaskManagement`, all others use the event's `routeSet`.
- **`taskParametersOf`** (private) – Builds the `params` object (taskId, kind, optional category/work).
- **`notifyTaskStaff`** (private) – Shared helper that assembles the notice and calls `notifyStaff`; suppresses per-person email for `contact` tasks (`email: 'none'`).
- **`CONTACT_ALERT_SET`** (private) – Constant `'TaskManagement'`, the set that *works* contact messages (as opposed to `TaskDisplay`, which only reads them).

## Relationships

- **`@kernel/events`** – `DomainEventMap` provides the typed payload shapes for every handler.
- **`@kernel/permissions`** – `PermissionSetName` types the set constants.
- **`@kernel/access/tenant`** – `DEPLOYMENT_TENANT_ID` is the fixed tenant for outbox-dead notices (a system-level, not tenant-scoped, event).
- **`../staff-routing`** – `STAFF_ROUTES` supplies the routing (bell, email) per notice code; `staffLinkOf` builds the deep link embedded in each notice.
- **`./staff`** – `notifyStaff` / `notifyStaffMember` perform the actual notice write; this file only prepares the arguments.
- **`@modules/tasks`** (→ `service.ts`) – `taskService.mailMainMailbox` delivers the contact-message reminder to the shared mailbox.
- **`services/index.ts`** – Imports these handlers and calls `subscribe()` to bind them to the bus.

## Notes

- **Contact-message special-casing is pervasive.** A `contact` task (a) alerts `TaskManagement` rather than the event's `routeSet`, (b) suppresses per-person email, and (c) triggers `taskService.mailMainMailbox`. All three behaviors are intentional: staff answer from the main mailbox, so it is the single inbox.
- **Deduplication is the only idempotency guard.** Outbox delivery is at-least-once; the `dedupeKey` (task id + event kind) is what prevents duplicate notices. Do not rely on "claim-once" semantics in the sweep.
- **`onOutboxEventDead` ignores the event's `tenantId`.** It hard-codes `DEPLOYMENT_TENANT_ID` because a dead outbox entry is a platform-level incident, not a tenant-level one.
- **`TaskDisplay` vs `TaskManagement`.** `TaskDisplay` includes managers (read-only); alerting them on `contact` tasks would notify people who cannot act. The module deliberately restricts to the working set.
