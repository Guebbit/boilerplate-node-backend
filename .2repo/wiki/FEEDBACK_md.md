# FEEDBACK.md

## Purpose

A decision document (not executable code) that frames what the feedback module is, identifies two unaddressed gaps (no deletion path, no per-identity rate limit on the public endpoint), and recommends a minimal fix path (Option A: finish the contact form). It exists to stop the boilerplate from carrying PII indefinitely with no erasure mechanism and an unthrottled outbound-mail amplifier.

## Key elements

- **Current-state table** — maps each piece of the feedback module (public `POST /feedback/contact`, admin-only list/search/`PUT`, `model.ts` schema, `FeedbackRequestStatus` enum, `emails.ts` side effect) to its location and constraint.
- **Two "owed" fixes** — (1) retention: a TTL index on `createdAt` *and* an admin-only `DELETE /feedback/{id}`; (2) rate limiting: apply `credentialLimiters` (or a sibling keyed on submitted email) to `/contact`. Both are framed as non-alternatives.
- **Three directions (A / B / C)** — finish the form / grow into a thread / delete and outsource — each scored on standardness, speed, and boilerplate budget.
- **Comparison table** — side-by-side on six criteria.
- **Recommendation** — "A, and only A," with a four-step ordered plan (rate limiter → TTL → DELETE → `respondedAt`).
- **"What NOT to do"** — guardrails against symmetry-driven additions, over-scoped search, indexing `email`, or replying to unverified addresses.
- **Open question** — the TTL retention window is a legal decision (12 vs 24 months) that blocks step 2.

## Relationships

No graph neighbors are registered. The document *references* several files for context (`routes.ts`, `model.ts`, `emails.ts`, `src/app/security.ts`, `src/modules/account`) and two sibling docs (`CONTRACT_PLAN_POLYMORPHISM.md` as the triggering question, `REINVENTING_THE_WHEEL.md` as an analogous framing), but these are citations, not import-level dependencies.

## Notes

- This is a **prose decision record**, not a module. It does not export, import, or register anything.
- Step 3 (the `DELETE` endpoint) is the only step that changes the API contract; it requires the `contracts:bundle` → `gen:api` → `sync:frontend` pipeline.
- Steps 1 and 2 are independent and can land in either order.
- The document explicitly rejects adding `email` to the index (`model.ts:68` explains why) and rejects a three-spelling delete pattern for symmetry with other modules.
- Written 2026-08-31; the retention-window number is still unresolved, so the TTL index line is intentionally not specified.
