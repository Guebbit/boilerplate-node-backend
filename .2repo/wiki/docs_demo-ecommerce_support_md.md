# docs/demo-ecommerce/support.md

## Purpose

Documents the support-desk surface of the demo e-commerce app: the public contact form, self-service account and order actions, locale editing, and the health/audit pages that answer "is the shop broken?" questions. It exists so a reader understands what a support agent (or a confused customer) can do without opening source code.

## Key elements

- **Contact form** — the only write-surface available to unauthenticated visitors; messages flow through four states (new → being handled → resolved, or new → spam). Private staff notes attach to a message but are invisible to the sender.
- **Self-service account actions** — password reset, verification-email re-send, "log out everywhere." No staff intervention required.
- **Order self-service** — order list, status step, tracking code, PDF invoice, and self-cancel with automatic refund.
- **Locale editing** — staff can edit existing wording and register/retire languages; new labels require a developer.
- **Health & audit** — a plain health page, a live activity view, and a 90-day audit log of staff actions.
- **"What is pretend" table** — enumerates demo fakes (card payments, courier, outbound email, persistence).
- **Glossary table** — defines Triage, Verified, Session, Audit log, Health check in plain terms.

## Relationships

- **`shopper.md`** — the "Where is my order?" section defers order-detail and cancellation behavior to the shopper page.
- **`modules/account.md`** — "I can't get in" section links here for the session/device model and verification semantics.
- **`modules/feedback.md`** — the contact form is described as a feedback workflow; the Triage glossary entry points here.
- **`modules/locales.md`** — the Languages section is a summary; the module doc holds implementation detail.
- **`modules/observability.md`** — the health page and live activity view are detailed there.
- **`modules/audit-logs.md`** — the 90-day staff-action record is scoped in that module.
- **`modules/orders.md`** — order status, tracking, and refund-on-cancel logic live there.
- **`tools/demo-profile.md`** — the "What is pretend" table points to the demo profile for the authoritative list of fakes.
- **`index.md`** — parent index for the demo-ecommerce docs set.

## Notes

- Deleting a customer account does **not** delete their contact-form messages; messages are keyed to an email address, not an account record.
- An unverified account is fully functional (can order, can see everything). Verification is informational only.
- Locale editing can only *replace* existing wording; introducing a brand-new label is a code change.
- The demo database is ephemeral — any message, order, or audit entry is lost when the demo stops.
- One specific card number always refuses payment; all other card numbers succeed. This is intentional for testing.
