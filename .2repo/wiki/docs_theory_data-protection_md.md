# docs/theory/data-protection.md

## Purpose

GDPR accountability record for the controller (the party that deploys this codebase). Every entry is derived from specific code behaviour, not aspirational policy. It covers the Art. 30 processing register, the sub-processor list, the Art. 15–21 subject-request runbook, and the Art. 33/34 breach runbook.

## Key elements

- **Processing register (Art. 30)** — table with one row per personal-data collection (`users`, `orders`, `payments`, `carts`, `wishlists`, `shipments`, `feedbackrequests`, `auditlogs`, analytics events). Each row lists the personal data, purpose, lawful basis, retention window, and the exact mechanism that erases or anonymises it.
- **Sub-processor list** — analytics provider (Umami / PostHog), SMTP provider, Loki. Notes which are self-hosted (no DPA) vs. genuine third parties (DPA required). Explicitly states no object-storage sub-processor in the default stack.
- **Subject-request runbook (Art. 15–21)** — maps each GDPR right to its endpoint (`POST /account/export`, `DELETE /account`, `PUT /account`), the caller, and explicit exclusions (e.g. feedback tickets excluded from export by default; soft-delete does not discharge an erasure request).
- **Breach runbook (Art. 33, 72-hour clock)** — Mermaid flowchart: Detect → Contain → Scope → risk gate → notify authority / subjects / document internally.
- **Env-var knobs** — `NODE_INACTIVE_ACCOUNT_DAYS`, `NODE_ORDER_PII_RETENTION_DAYS`, `NODE_CART_RETENTION_DAYS`, `NODE_FEEDBACK_RETENTION_DAYS`, `NODE_AUDIT_RETENTION_DAYS`, `NODE_LOG_PERSONAL_FIELDS`, `NODE_ANALYTICS_PROVIDER`, `NODE_POSTHOG_HOST`, `NODE_SMTP_HOST`, `NODE_PUBLIC_PATH`, `NODE_EXPORT_INCLUDE_FEEDBACK`.
- **Key scripts** — `npm run reap:inactive-accounts`, `npm run reap:orders`.

## Relationships

- **docs/reference/ops.md** — explicitly linked from the processing register table ("Full mechanics for each retention window"). Holds the operational detail (TTL index definitions, cron schedules) that this page only summarises.
- **docs/theory/index.md** — parent index; lists this page as a theory-level document.
- **docs/reference/index.md** — parent index for the reference section that ops.md belongs to.
- **docs/theory/web-attack-defences.md** — thematically adjacent: both deal with security monitoring; the `auditlogs` row here (actor, IP, user-agent, free-form metadata) is the data plane that attack-defence tooling reads.
- **docs/tools/security.md** — the breach runbook's "Contain: revoke sessions, rotate secrets" step and the audit-log hashing (`NODE_LOG_PERSONAL_FIELDS`) are operational concerns that the security tooling doc would cover in more detail.

## Notes

- This file is **not** a compliance certificate. It is the record a controller must *have*, assembled from what the code actually does.
- `feedbackrequests` is **deliberately not cascaded** on account deletion — a ticket can predate the account that later reuses the same email. See `feedback/module.ts`.
- A **soft** delete (`hardDelete` unset) is reversible and does **not** satisfy an Art. 17 erasure request; only `?hardDelete=true` does.
- `orders`/`payments` are anonymised (not deleted) after `NODE_ORDER_PII_RETENTION_DAYS` because invoices are retained for tax law.
- Uploaded images live on the app server's local disk (`NODE_PUBLIC_PATH`); adding S3/R2 creates a new sub-processor row.
- Pre-login analytics traffic is always coarsened (never identified), regardless of consent state.
- The 72-hour breach clock starts at "becoming aware," not at detection. Art. 33(5) permits internal documentation without authority notification if no likely risk exists.
