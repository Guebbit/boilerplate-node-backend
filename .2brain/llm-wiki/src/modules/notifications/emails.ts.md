---
source: src/modules/notifications/emails.ts
source_sha256: e150fdec96255b06f923dcdc60715824a2e5ea2607d317bf55929b4e2f25bb67
context_sha256: ab665a4173c81a5d47b4ef1b7a410e10265c48644285cbda88eb79420ddca6da
generated_at: 2026-11-22T05:53:30.508725+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/notifications/emails.ts

## Purpose
Builds the single email a staff work notice can send: a short "what happened" summary plus a link to the screen where the notice is handled, written in the recipient's language. Only notices whose route says `email: 'now'` are mailed; others appear only in the bell. Wording comes from the notice code's own dictionary path, so modules that add notices ship their copy alongside them.

## Key elements
- `staffNoticeEmail(locale, body, link)` (exported): returns an `EmailContent` for a notice.
  - Uses the `notifications.staff-notice` template.
  - Subject, meta title, title and summary come from the translator. Subject and summary are interpolated with the notice params plus extra words.
  - `link` is built with `frontendLink(template, locale, parameters)`. The label is `notifications.staff-mail.open`.
  - `data` also carries `locale`.
- `taskWhat(t, parameters)` (internal): names a task by its kind (`tasks.task-kind.<kind>`). For `contact` tasks it appends the category (`tasks.task-category.<category>`, or `tasks.task-category.none` if absent), joined as `kind · category`.
- `wordsOf(t, body)` (internal): supplies the extra `what` word for the task codes `task-opened`, `task-overdue`, `task-due-soon` and `task-assigned` (all under `notifications.staff.`). It returns `{}` for every other code.

## Relationships
- `./staff-routing`: provides the `StaffNoticeBody` and `StaffLink` types. Routing decides whether the mail is sent at all (`email: 'now'`), and the notice writer supplies the link.
- `@infrastructure/adapters/mailer`: provides the `EmailContent` type that is returned. The mailer templates test covers the template side.
- `@infrastructure/i18n`: provides `translator(locale)`, used for all wording.
- `@infrastructure/http/frontend-link`: provides `frontendLink`, which builds the localized link URL.
- Related modules and tests: `src/modules/notifications/services/staff.ts`, `src/modules/notifications/index.ts` and the two `staff-routing` unit tests sit in the same dependency graph.

## Notes
- The dictionary path is derived by replacing `.staff.` with `.staff-mail.` in the notice code. For example, `<module>.staff.<kind>` becomes `<module>.staff-mail.<kind>`. A new notice needs matching `subject`, `meta-title`, `title` and `summary` entries under that path.
- Task mails use only closed codes (kind and category), so nothing the visitor typed ends up in the mail.
- The `contact` category falls back to "none" so the mail doesn't look broken.
- A new notice code that interpolates extra words must be added to `wordsOf`. It is not generic.
