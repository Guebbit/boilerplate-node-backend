# docs/modules/feedback.md

## Purpose

Documents the feedback (contact-request) module: an open form anyone can use to file a message by email address, with an admin triage workflow. It exists as a leaf module (no dependencies, no dependents) to give the module system a simple reference point.

## Key elements

- **Status enum** (`new → in_progress → resolved`, plus `spam` as a non-linear exit) — defines the entire triage workflow; breaking it breaks the module.
- **Email-address storage** — the record stores an email string, not a user reference, because the form is public and unauthenticated.
- **`adminNotes` / `respondedAt`** — operator-side fields; never exposed to the person who filed the request.
- **`status: 1, createdAt: -1` index** — backs the admin queue, the only list this module serves.
- **Public write route** — the sole unauthenticated write endpoint in the application.

## Relationships

- **docs/modules/index.md** — parent modules overview; this page is listed there as a leaf module and linked back as context. No other files depend on or are depended upon by this module.

## Notes

- Because storage is by email (not user ID), deleting a user account leaves their feedback records intact.
- The public write route is rate-limited (see the security page referenced in the doc); this is the only place in the app where that applies to a write.
- Together with the wishlist module, feedback is the pair to study when you want to see the module system without cross-module coupling.
