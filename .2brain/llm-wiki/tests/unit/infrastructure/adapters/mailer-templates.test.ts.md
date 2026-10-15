---
source: tests/unit/infrastructure/adapters/mailer-templates.test.ts
sha256: abc83346cd1082ca993cf5117f407d6e8ace1c202a2cc8a5d9db366de488ef6c
generated_at: 2026-10-15T13:08:03.955809+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/mailer-templates.test.ts

## Purpose

Guards the email/PDF template collection end-to-end. It replicates exactly how `app.ts` boots the template registry (via each enabled module's own `templates/` manifest), asserts every registered name resolves to a real file, and renders every template in every supported locale to catch missing i18next keys before a customer ever receives a broken email. Because a wrong path or a missing translation key produces no type error and no runtime exception, this suite is the only automated net that catches both.

## Key elements

- **`registerTemplateDirectories(enabledModuleDirectories('templates'))`** — populates the registry identically to production boot so subsequent assertions operate on the real collection.
- **`contentFor(locale)`** — a single function that maps every template name to its `EmailContent` by calling the owning module's builder (e.g. `verifyRequestEmail`, `orderConfirmEmail`, `returnNoticeEmail`). Serves as the source-of-truth list for coverage checks.
- **`render(name, locale)`** — renders a template via `ejs.renderFile` with `root: process.cwd()`, matching the production include-resolution path used by `sendTemplatedEmail`.
- **Template collection tests** — assert ≥ 1 template is registered, sample names resolve to real files, and hostile names (`../etc/passwd`, backslash, `constructor`, etc.) are rejected before path resolution.
- **Locale rendering tests** — for every (template × locale) pair: assert `<html lang="…">` is present and that no dotted i18next identifier (a missing-key tell) survives in the HTML. Also asserts coverage parity between `contentFor` keys and registered names.
- **Invoice document test** — renders `invoicing.document.ejs` directly (it lives outside the name-resolved map) and applies the same no-unresolved-keys rule.
- **Locale-divergence test** — renders `account.reset-confirm` in `en` and `it`, asserting the outputs differ so dictionaries are actually consulted.
- **Apostrophe-escaping test** — verifies a name like `O'Brien` reaches the template raw and is HTML-escaped exactly once by the template, not pre-escaped by i18next.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — imports `registerTemplateDirectories`, `registeredTemplateNames`, `templateFile`, and the `EmailContent` type; the registry this suite exercises.
- **`src/modules.ts`** — imports `enabledModuleDirectories('templates')` to discover each module's template directory exactly as `app.ts` does.
- **`src/infrastructure/i18n/index.ts` / `catalog.ts`** — provides `listSupportedLocales()` which drives the per-locale test matrix.
- **Module `emails.ts` files** (`account`, `orders`, `payments`, `delivery`, `returns`, `api-keys`, `feedback`, `invoicing`, `example`, `webhooks`) — each exports the builder function that fills its own template; this suite calls every one of them to produce render-ready content.
- **`src/modules/example/index.ts`** — re-exports `examplePublishedEmail` used in `contentFor`.

## Notes

- Rendering goes through **EJS directly**, not `nodemailer`, so no SMTP transport is needed; the concern is copy, not delivery.
- `root: process.cwd()` is required because templates use root-relative includes like `/shared/templates/layouts/...`.
- The "no unresolved key" assertion relies on i18next's silent fallback: a missing key returns the key string itself (e.g. `account.reset.title`), which is valid HTML and throws nothing — the regex `/>[^<>]*\b[a-z]+(?:\.[\da-z-]+){2,}\b[^<>]*</` is the only detector.
- The invoice PDF is **not** in the name-resolved registry (nothing calls `templateFile` for it), so the test reaches the file by relative path, mirroring how the invoicing module itself accesses it.
- Adding a new template without adding its builder to `contentFor` will fail the coverage-parity assertion; adding a builder without registering the template will fail the "resolves to a real file" check.
