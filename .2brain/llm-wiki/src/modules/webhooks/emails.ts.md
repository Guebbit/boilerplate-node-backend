---
source: src/modules/webhooks/emails.ts
sha256: d0aab7730d2dc108fc9505dfca161d17a9d1f2ac7cd4d0d3d95ca61fe3880321
generated_at: 2026-10-15T12:18:49.832083+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/emails.ts

## Purpose

Holds the finished-text email copy for the webhooks module. Follows the same convention as `@modules/account/emails`: the caller passes a locale, and the function returns fully resolved strings ready for template interpolation. Currently contains one email — the auto-disable notice sent to the subscription owner when repeated delivery failures switch the endpoint off.

## Key elements

- **`subscriptionDisabledEmail(locale: string, url: string): EmailContent`** — Builds the auto-disable notice. Returns an `EmailContent` object with template `webhooks.subscription-disabled`, a resolved `subject`, and a `data` bag (greeting, body, meta title, footer, and the disabled endpoint `url`) for the mailer to render.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Imports the `EmailContent` return type; the mailer adapter is the downstream consumer of the object this function produces.
- **`src/infrastructure/i18n/index.ts`** — Imports the `translator` factory to obtain a locale-bound translation function at call time.
- **`src/infrastructure/i18n/context.ts`** — Underlying context for the translator (locale resolution).
- **`src/modules/webhooks/services/attempt.ts`** — The trigger: `recordFailure` auto-disables a subscription and calls this function to compose the notice.
- **`src/modules/webhooks/index.ts`** — Module barrel; re-exports or routes to this file as part of the webhooks module surface.
- **`tests/unit/infrastructure/adapters/mailer-templates.test.ts`** — Validates the `webhooks.subscription-disabled` template referenced here.

## Notes

- The audience is strictly the **subscription owner** (their own endpoint). Sustained cross-subscription failures produce a separate operator-facing alert (`QueueJobsParked`-style) and never reuse this template.
- Because auto-disable is a system event with no inbound request, the locale comes from the **shop's default**, not a per-request preference.
- The `data` field in `EmailContent` is the interpolation surface for the mailer template; every value is already a finished string — no further translation happens at send time.
