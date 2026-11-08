---
source: src/modules/tasks/service.ts
sha256: 876a55fab3230844609e25b95efddb2aac2361ab4cd431738466ab534cb45fb5
generated_at: 2026-11-08T08:36:49.832679+00:00
model: ollama:qwen3.8:27b
---

# src/modules/tasks/service.ts

## Purpose

The task service that handles contact-form creation (with anti-spam gating), staff search, and the two `personalData` halves (export/erasure). It is the entry point where a visitor's message becomes a persistent, event-announced task row. Status transitions (resolve, assign, note) live in `./workflow`; domain rules live in `./domain`.

## Key elements

- **`create(payload, subjectId?)`** — Validates the honeypot field and disposable-email policy, then atomically writes the task and publishes `task.opened` via `announceInTransaction`. Suspected spam is stored closed-at-birth with `resolution: spam` and no event is announced.
- **`contactDueAt(category, now)`** — Returns the due date: one calendar month (GDPR Art. 12(3)) for `privacy` category, otherwise `tasksConfig().NODE_TASKS_CONTACT_SLA_HOURS`.
- **`mailMainMailbox(taskId, reminder?)`** — Enqueues the visitor's message to `NODE_SUPPORT_EMAIL` with `Reply-To` set to the visitor's address. Logs (never raises) on queue failure. Uses a deterministic `Message-Id` derived from the task ID.
- **`mailErasureNotice(ids)`** — Enqueues a notice to the support mailbox listing erased task refs. Rejects (propagates) if the queue fails, so the caller can log.
- **`scopeOf(filters, context, now)`** — Builds the MongoDB scope object: jurisdiction clause is always present; `overdue`, `assignee` (`me`/`none`/id), `status`, `category`, `source`, `kind` are composed into `$and`/top-level fields.
- **`search(filters, context)`** — Paginated, jurisdiction-bounded search. Resolves assignee names, computes viewer-relative data, and records `ADMIN_TASK_VIEWED` audit.
- **`TaskFilters`** (type) — Search filter shape; `page`/`pageSize` accepted as `string | number` for HTTP-query compatibility.
- **`contactSlaMs()`** — Converts the configured SLA hours to milliseconds.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/outbox.ts` | `announceInTransaction` — atomic write + event publish for `create`. |
| `src/domain-primitives/time.ts` | `HOUR_MS`, `oneCalendarMonthLaterUtc` — SLA and GDPR deadline math. |
| `src/infrastructure/adapters/antibot.ts` | `checkEmailPolicy` — disposable-domain verdict before create. |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` — all outgoing mail (main mailbox, erasure notice). |
| `src/infrastructure/adapters/config.ts` | `supportEmail()` — target address for support mail. |
| `src/infrastructure/adapters/logger.ts` | `logger.error` — swallows mail-queue failures in `mailMainMailbox`. |
| `src/infrastructure/i18n/index.ts` | `getDefaultLocale`, `t` — locale-aware email rendering. |
| `src/infrastructure/http/response.ts` | `generateReject` / `generateSuccess` — HTTP response shapes (imported; used in truncated section). |
| `src/infrastructure/persistence/normalize-email.ts` | `normalizeEmail` — canonicalises the visitor address on create. |
| `src/infrastructure/persistence/create-repository.ts` | `toObjectId`, `Lean` — type helpers for Mongo queries. |
| `src/infrastructure/persistence/search.ts` | `readAll`, `MAX_CONFIGURED_PAGE_SIZE`, `PaginatedMeta` — pagination primitives. |
| `src/infrastructure/observability/audit.ts` | `recordAudit` — logs admin view/delete actions. |
| `src/kernel/registry.ts` | `AfterErase`, `PersonalDataSubject` types — personal-data contract. |

## Notes

- **Honeypot field (`payload.website`)** is declared in the request contract but never persisted or read back. A non-empty value silently marks the task as spam; the bot still receives `202`.
- **Spam is stored, not rejected.** This keeps the row for audit while suppressing all notifications.
- **`mailMainMailbox` swallows errors** (task already committed); **`mailErasureNotice` propagates them** (caller decides whether the erasure stands).
- **`Reply-To` uses the bare email address only** — the visitor's free-text `name` is never placed in a mail header.
- **`assignee=me`** resolves to `caller.id`; if the caller has no account (API key) or the id is invalid, the clause degenerates to `{_id: {$in: []}}` (matches nothing) rather than throwing.
- **Jurisdiction scope is always applied** in `scopeOf`; there is no code path that searches across jurisdictions.
