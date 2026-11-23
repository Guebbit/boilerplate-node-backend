---
source: shared/rules/frontend-links.yaml
source_sha256: b40117610379a2380c7d626e2347f74c93267e09ac31f08e5baefd658aceb372
context_sha256: 1db6f1e92515af6467e76d17917651897685b578d8c480dda6db78731674b2a0
generated_at: 2026-11-22T02:25:48.380753+00:00
model: claude-code:claude-sonnet-5-5
---

# shared/rules/frontend-links.yaml

## Purpose
Single source of truth for the frontend route paths that the backend embeds in outgoing mail and sitemap links, relative to the paired frontend's `/<locale>/` prefix. It exists so that a link in a reader's inbox never points at a route the frontend lacks (a 404). The file is synced to the frontend (`sync:frontend`), whose tests walk the router against it.

## Key elements
- `links:` – path templates for mail links: `verify`, `reset`, `setup` (first password for a staff-created account), `restore`, `emailChange`, `emailUndo`, `export`, `order`, `product`, `contact` (pre-filled `?category=account`), `privacy`, `terms`.
  - `{token}` and `{id}` are placeholders filled in by the backend.
  - Tokens go in the URL fragment (`#token=`), which browsers never send to a server (RFC 3986 §3.5).
  - Each entry can be overridden by an env var; the env var names are defined per backend.
- `staticPages:` – public pages with no id (sitemap-style list). `''` is the home page. Entries: about, faq, terms, privacy, legal, contact, products.
- `staffPages:` – staff screens that work-notice mails point to:
  - Entity screens: `user`, `webhookSubscription`, `task`, `return`, `order` (with `{id}`).
  - Fixed screens: `inventory`, `salesPayments`.
  - Ten summary-row entries, each opening a list pre-filtered to what the row counts: `transfersDue`, `preordersLate`, `deliveryHoldsOpen`, `returnsAwaitingGoods`, `returnsUndecided`, `lowStock`, `unshipped`, `awaitingTracking`, `undelivered`, `staleRefunds`.

## Relationships
No graph neighbors are listed. Per its own comments, the file is consumed by the backend (mail and sitemap link building, and the notification bell and digest mail, which share the summary-row paths) and is synced to the frontend, whose router tests check it.

## Notes
- `staffPages:` is not env-overridable; the code-to-screen mapping stays in the notifications module.
- The query keys in the summary-row paths must match the ones the target list's own URL state reads.
- Some rows open a wider list than their count (e.g. `unshipped` covers every age).
- `awaitingTracking` and `undelivered` currently share the same path (`sales/orders?status=shipped`).
