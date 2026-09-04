# Security attack coverage — plan for a deep scan

Idea only. No scan has been run yet — this is what the scan should produce and where it goes.

## What exists today

- `docs/theory/web-attack-catalog.md` (BE) — generic, project-agnostic list of attack categories.
  Theory-only, no word about this codebase. This is the shared reference; the same content
  belongs in any Guebbit boilerplate, BE or FE.
- `docs/theory/web-attack-defences.md` (BE) — the project-specific half: per catalog row, which
  control stops it and where (`file#function`), or an explicit "not mitigated, and why that is a
  decision" when there's a deliberate gap. Linked from the catalog page.

This pairing is already the right shape. The gap is coverage, not structure:

1. **`web-attack-defences.md` only covers authentication and session hardening.** It says so in
   its own scoping line. Everything else in the catalog — injection rows beyond NoSQL, money/stock
   business-logic abuse in `orders`/`payments`/`inventory`, upload/image rows beyond the
   magic-byte check, SSRF, path traversal, dependency management beyond one `npm audit fix` note —
   has never been walked row by row against this repo.
2. **`boilerplate-vue-frontend` has no equivalent at all.** No catalog copy, no defences page.
   Browser-side rows matter uniquely there and are currently unrecorded either way: XSS / output
   encoding, CSRF token handling, clickjacking / frame-ancestors, where the access token is stored
   and why, CSP, cookie flags as _read_ client-side (not just set by BE), dependency
   vulnerabilities in the FE's own package tree.
3. **No single "what's still open" list.** Today the only recorded gaps are the few named in
   BE's "Not mitigated, and why that is a decision" section — a byproduct of the auth-only pass,
   not a deliberate sweep of the full catalog.

## What the scan should produce

Same pattern as today's `web-attack-defences.md`, extended to the whole catalog, per repo:

- **BE**: walk every remaining catalog section (not just auth/session) against
  `boilerplate-node-backend`. Per row: found a control → name it and its file location; found
  nothing → say so explicitly, same honesty as the existing "not mitigated, and why" section
  (silence is not evidence of safety).
- **FE**: create `boilerplate-vue-frontend/docs/theory/web-attack-defences.md` from scratch,
  same per-row shape, covering both the rows only the browser side can answer and the FE half of
  rows BE already covers (e.g. token storage vs. BE's token minting).
- Both pages keep linking back to the shared catalog, same as BE's does now.

## Not now

This file only records the idea and where the gap is. Running the actual row-by-row scan is
future work — a fresh session, one repo (or one catalog section) at a time, same discipline as the
audit batches: read the catalog row, read the code, write the verdict, don't rely on memory of
"we probably handle that."
