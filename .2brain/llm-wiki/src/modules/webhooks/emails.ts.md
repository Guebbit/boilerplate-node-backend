---
source: src/modules/webhooks/emails.ts
sha256: 7813b9f006ef6eedd468ebe493cfe19edd161d5763b2b0ceb60d73bac1752807
generated_at: 2026-09-23T19:39:54.674563+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/emails.ts

## Purpose

Resolves the email copy for every notification the webhooks module sends into finished, locale-ready strings. Follows the same convention as `@modules/account/emails`: language is an argument, the output is a complete `EmailContent` object, and the template only interpolates. Currently contains a single email — the auto-disable notice delivered to the subscription owner when repeated failures switch the endpoint off.

## Key elements

- **`subscriptionDisabledEmail(locale: string, url: string): EmailContent`** — Builds the email payload for the subscription auto-disable notice. Calls `translator(locale)` to resolve subject, greeting, body, meta-title, and footer strings. Returns an `EmailContent` with template key `webhooks.subscription-disabled` and a `data` object containing the translated strings plus the disabled endpoint's `url`. `pageMetaLinks` is always an empty array.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Provides the `EmailContent` type used as this function's return type.
- **`src/infrastructure/i18n/index.ts`** — Exports the `translator` factory that this file calls to produce a locale-bound `t` function.
- **`src/infrastructure/i18n/context.ts`** — Underlying i18n context that `translator` resolves against.
- **`src/modules/webhooks/services/attempt.ts`** — `recordFailure` is the caller: when auto-disable triggers, it invokes `subscriptionDisabledEmail` to compose the outgoing notice.
- **`src/modules/webhooks/index.ts`** — Module barrel; re-exports this file's public surface.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Unit-tests the `webhooks.subscription-disabled` template that this function references.

## Notes

- The locale passed in is the **shop's default locale**, not a per-request preference. Auto-disable is a background system event with no incoming request to carry the owner's own language choice.
- This email is deliberately scoped to *one endpoint the operator created*. The broader "all subscriptions failing" alert (a `QueueJobsParked`-style signal on parked deliveries) is a separate channel and never shares this template.
- `pageMetaLinks` is hardcoded to `[]` — this notice has no navigation links.
