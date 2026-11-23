---
source: src/modules/account/services/previous-email-cleanup.ts
generated_at: 2026-11-22T03:39:57.340587+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/services/previous-email-cleanup.ts

## Purpose
Implements the nightly `reap:previous-emails` sweep. When an account's email change has been made, the previous address is kept only so the user can undo the change via a 7-day undo link. Once that link has lapsed, this sweep forgets the old address (data minimisation). Expired sessions and one-time tokens are not handled here, since each row carries its own TTL date and the database deletes it.

## Key elements
- `reapLapsedPreviousEmails(): Promise<number>`: the only export. It fetches the user IDs that still have a live undo token, then asks the account user service to clear the previous email for all other accounts. It resolves to the number of accounts cleared.

## Relationships
- `src/modules/account/repository.ts`: provides the verification token repository. This file calls its `userIdsWithLive(EMAIL_CHANGE_UNDO_TOKEN_TYPE, new Date())` to get the users whose undo link is still live (the "keep" set).
- `src/modules/account/token-types.ts`: supplies `EMAIL_CHANGE_UNDO_TOKEN_TYPE`, which selects the undo-token type to look up.
- `src/modules/users/friends/account.ts`: provides the account user service. This file calls its `clearLapsedPreviousEmail(keep)` to do the clearing, given the keep set.
- `src/modules/account/jobs.ts` and `src/modules/account/services/index.ts`: graph neighbors. Their interaction is not visible in this file, but the `reap:previous-emails` name suggests the job is registered there.

## Notes
- "Lapsed" means "no live undo token". An undo token that expired, was spent, or was revoked all count the same.
- The function passes the set of users to keep rather than the set to clear. Accounts are cleared by exclusion from that set.
- The doc comment refers to the `lapse` edge in `../domain/email-change.ts` as the state transition this sweep carries out; that file is referenced only in the comment, not imported.
