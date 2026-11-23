---
source: src/modules/shop-tasks/emails.ts
generated_at: 2026-11-22T07:41:13.697189+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/emails.ts

## Purpose
Builds the staff digest email for the shop-tasks module: one line per summary that appeared or grew, each with a count and a link to the page that lists it, localized to the recipient's language. It carries counts and links only, with no names or addresses.

## Key elements
- `DigestItem` – interface for one digest line: a `code` (`SummaryCode`) and a `count`.
- `staffDigestEmail(locale, items)` – returns an `EmailContent` using the template `shop-tasks.staff-digest`. `items` is documented as never empty.
  - Subject, meta title and title come from the translator for `locale`.
  - `data.lines` has one entry per item, each with `text` (localized, with the count passed as `n`) and `link` (a frontend URL).

## Relationships
- `src/modules/shop-tasks/staff-routing.ts` – supplies `SummaryCode` and `summaryLinkOf(code)`, which returns the link `template` and `parameters` for each line.
- `src/infrastructure/i18n/index.ts` – `translator(locale)` provides all the translated strings.
- `src/infrastructure/http/frontend-link.ts` – `frontendLink(template, locale, parameters)` builds each line's link.
- `src/infrastructure/adapters/mailer.ts` – defines the `EmailContent` type returned here. The `shop-tasks.staff-digest` template is rendered by the mailer, and `tests/unit/infrastructure/adapters/mailer-templates.test.ts` exercises the mailer templates.
- `src/modules/shop-tasks/services/digest.ts` – the digest service in the same module; the graph links it to this file.
- `src/modules/shop-tasks/index.ts` – the module's index, linked to this file in the graph.

## Notes
- Line text is looked up by rewriting the summary code: `.staff.` becomes `.staff-mail.digest.`. For example, the code `shop-tasks.staff.<n>` maps to the dictionary path `shop-tasks.staff-mail.digest.<n>`. Every summary code therefore needs a matching `staff-mail.digest` dictionary entry.
- The file's header comment points to a "the staff digest" section of the shop-tasks module documentation for detailed behavior.
