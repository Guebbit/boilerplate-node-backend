---
source: shared/rules/frontend-links.yaml
sha256: b40117610379a2380c7d626e2347f74c93267e09ac31f08e5baefd658aceb372
generated_at: 2026-11-14T17:45:48.958018+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/frontend-links.yaml

## Purpose

Canonical map of every user-facing URL path the backend embeds in transactional mail, sitemap entries, and staff work-notice links. It exists so the frontend's router is tested against the exact same paths the backend emits, preventing 404s in a reader's inbox. The file is synced into the frontend (`sync:frontend`) and serves as the single source of truth for route strings shared across services.

## Key elements

- **`links:`** — Named URL paths (under `/<locale>/`) for account-lifecycle and content pages: email verification, password reset/setup/restore, email change/undo, account export, order/product lookups, GDPR contact, privacy, and terms. `{token}` and `{id}` are placeholders the backend fills at send time. Each entry can be overridden by a per-backend env var.
- **`staticPages:`** — Flat list of public, id-less pages (home, about, faq, terms, privacy, legal, contact, products). Used by the sitemap generator.
- **`staffPages:`** — Named paths for internal work-notice mail (users, webhooks, tasks, returns, orders, inventory, payments, and ten "things need you" summary rows with pre-filtered query strings). Not env-overridable; the mapping lives in the notifications module.
- **Token transport convention** — All `{token}` values ride in the URL fragment (`#token={token}`), which per RFC 3986 §3.5 is never sent to a server, keeping secrets out of access logs.

## Relationships

No graph neighbors are recorded for this file.

## Notes

- `staffPages:` is intentionally excluded from env-var override: the code-to-screen mapping is owned by the notifications module, not by per-deployment configuration.
- The ten "summary rows" in `staffPages:` (e.g. `transfersDue`, `lowStock`, `unshipped`) share their query-string keys with the bell UI and the digest mail, so the two cannot drift. Some rows open a list broader than the count (e.g. `unshipped` shows every age, not just overdue).
- Frontend tests walk the router against this file; adding a route here without a matching frontend route will fail the sync test.
- `contact` carries a query param (`?category=account`) to pre-fill a GDPR Art. 22(3) purchase-hold question.
- `staticPages` uses `''` (empty string) to denote the locale home page, not `/`.
