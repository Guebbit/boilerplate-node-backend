---
source: shared/rules/frontend-links.yaml
sha256: 3caed8ea3fed9c25852ae17f7d1965e03d731652d37324b2b1a19290f37dd279
generated_at: 2026-11-08T03:09:12.865174+00:00
model: ollama:qwen3.8:27b
---

# shared/rules/frontend-links.yaml

## Purpose
Single source of truth for every frontend route path the backend embeds in transactional emails, sitemaps, and work-notice digests. It exists so the frontend and backend agree on URL shapes without either side hard-coding the other's routes; the file is synced into the frontend (`sync:frontend`) where its tests walk the actual router against it, catching 404s before they reach a reader's inbox.

## Key elements

- **`links`** — Named frontend routes (`verify`, `reset`, `restore`, `emailChange`, `emailUndo`, `export`, `order`, `product`, `contact`, `privacy`) that the backend substitutes `{token}` / `{id}` into before sending. Each path is relative to `/<locale>/`. Env vars (per-backend names) can override any entry.
- **`staticPages`** — Flat list of public, parameterless pages (home `''`, `about`, `faq`, `terms`, `privacy`, `legal`, `contact`, `products`). No env override; no placeholders.
- **`staffPages`** — Routes a work-notice mail or the notification bell links to (`user`, `webhookSubscription`, `task`, `return`, `salesPayments`, plus ten summary rows like `transfersDue`, `lowStock`, `staleRefunds`). Not env-overridable; the code-to-screen mapping lives in the notifications module. Query-string parameters on summary rows mirror the list's own URL state so the bell and the digest mail cannot drift.

## Relationships
No graph neighbors are recorded for this file.

## Notes

- Tokens ride in the URL **fragment** (`#token=…`), never the query string, so browsers never transmit them to a server (RFC 3986 §3.5). Do not "fix" them into `?token=`.
- `{token}` and `{id}` are **placeholders only**; the backend performs the substitution. The frontend never sees the filled value in this file.
- `staffPages` entries with query strings (e.g. `sales/orders?fulfillmentStatus=on_hold`) encode the exact filter state the target list expects. Renaming a query key on the list component without updating this file will silently break the bell/digest deep-links.
- The `contact` link pre-fills `?category=account` for GDPR Art. 22(3) purchase-hold questions.
- Because the file is shared via `sync:frontend`, a route that exists only in the backend's memory (not listed here) will 404 in any mail that references it — the frontend test suite is the safety net.
