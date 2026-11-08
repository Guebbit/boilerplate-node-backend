---
source: src/modules/notifications/emails.ts
sha256: 406fc6bcc68eea631cfea9ebf254053dc6058823074372a5baecb22f12eb0d51
generated_at: 2026-11-08T06:31:16.659891+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/emails.ts

## Purpose

Builds the single email a work-notice can send to a staff member: a short "what happened" summary in the recipient's language plus a deep link to the relevant screen. Only notices whose routing specifies `email: 'now'` produce a mail; all others remain bell-only. The wording is resolved from the notice code's own i18n dictionary path so each module ships its email copy alongside its notice definitions.

## Key elements

- **`staffNoticeEmail`** *(exported)* — The sole public function. Takes `locale`, a `StaffNoticeBody`, and a `StaffLink`; returns a fully-formed `EmailContent` object (subject, title, summary, link, link label) ready to hand to the mailer.
- **`taskWhat`** *(private)* — Resolves a task's human-readable label (kind, plus category when kind is `contact`) via i18n. Falls back to `tasks.task-category.none` when no category was chosen.
- **`wordsOf`** *(private)* — Returns the extra `what` interpolation for the four task-related notice codes; returns `{}` for all other codes.

## Relationships

- **`@infrastructure/adapters/mailer`** — Imports the `EmailContent` type; the returned object is the shape the mailer adapter consumes.
- **`@infrastructure/i18n`** — Imports `translator` to obtain a locale-bound `t` function used for every string in the email.
- **`@infrastructure/http/frontend-link`** — Imports `frontendLink` to assemble the deep-link URL from `template`, `locale`, and `parameters`.
- **`./staff-routing`** — Imports the `StaffLink` and `StaffNoticeBody` types that define the input contract.
- **`./index.ts`** — Barrel file that re-exports `staffNoticeEmail` to the rest of the module.
- **`services/staff.ts`** — Upstream caller that assembles the `StaffNoticeBody` and `StaffLink` and invokes `staffNoticeEmail` when routing dictates an immediate email.
- **Tests** (`staff-routing.test.ts` in two locations, `mailer-templates.test.ts`) — Exercise the email output and the routing decisions that gate whether this file is called.

## Notes

- **Dictionary-path convention:** the email copy lives under a sibling key of the notice code — `notifications.staff.task-opened` → `notifications.staff-mail.task-opened` (the `.staff.` segment is replaced with `.staff-mail.`). Adding a new staff notice requires adding both the notice definition *and* its `staff-mail` dictionary entry.
- **Interpolation scope:** only the four `task-*` codes inject the `what` parameter into the translated strings. Other codes rely solely on `body.params`.
- **No user-typed text in the mail:** the `taskWhat` helper deliberately uses only closed enum codes (`kind`, `category`) so the email never carries free-form visitor input.
