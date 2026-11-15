---
type: concept
audience: [developer]
---

# Sibling doors, purchase hold and erasure

What other modules may call on users, the purchase hold, and the difference between a soft delete and an erasure.

## The doors a sibling module may use {#the-doors-a-sibling-module-may-use}

A sibling reaches `users` through two objects, and the second is for one module only:

| Object               | Where                                          | Who may import it                              |
| -------------------- | ---------------------------------------------- | ---------------------------------------------- |
| `userService`        | the barrel, `@modules/users`                   | any module, except `account` (lint refuses it) |
| `accountUserService` | `@modules/users/friends/account` (`@internal`) | `account` only (and tests)                     |

`userService` holds what other modules really use: `search`, `getById`, `staffContacts`,
`findAuthenticatableById`, `touchApiKeyUse`, `purchaseHoldOf`, `purchaseHoldCountingSince`,
`flagPurchaseHoldReview`, the staff admin writes (`create`, `updateById`, `activate`, `deactivate`,
`removeById`, `restoreById`, `setPurchaseHold`, `liftPurchaseHold`, `assignUserRole`,
`revokeUserRole`, which check role or grant protection themselves) and the shapers `toAccount`,
`toUserContract`, `toUserListItems`. `accountUserService` holds every step `account` calls (the doors
below, credentials, sign-up, the OAuth link, the reaper's reads); they trust that `account` checked.
`getById`, `findAuthenticatableById` and `toAccount` are the same functions under both names.
`account` cannot import `userService`, so a new `account`-only function can only go in its own
object; publishing one is a deliberate step for another module. The same pattern gives `orders` the
one hold it may take (`friends/orders.ts`). See
[Published language](../understand/strategic-ddd.md#_5-published-language-—-the-barrel).

Two writes skip the ban check and the staff protection the admin routes enforce: the raw `update`
and `remove`. Both are `@internal` and never leave the module. `account` reaches the record through
named doors instead, each narrower than the write beneath it:

| Door                     | Who calls it                      | What it cannot do                                                                      |
| ------------------------ | --------------------------------- | -------------------------------------------------------------------------------------- |
| `updateOwnProfile`       | the owner, `PUT`/`PATCH /account` | take `active` or `role`: a profile edit cannot ban its own account                     |
| `scheduleOwnDeletion`    | the owner, `DELETE /account`      | erase anything: it locks the row, stamps `purgeAt` and moves the session epoch         |
| `restoreOwnAccount`      | the owner, by link or at sign-in  | restore a row past `purgeAt`, or one the owner did not schedule (a conditional update) |
| `eraseScheduledDeletion` | the purge job                     | erase a row not yet due: its first write is a claim on `purgeAt <= now`, else `false`  |
| `softDeleteInactive`     | the inactivity reaper             | take an account never warned (rejects), or one that holds a staff role (`false`)       |
| `eraseInactive`          | the inactivity reaper             | erase a row the reaper did not soft-delete itself (rejects)                            |

These three are job steps, not routes: a refusal they can reach by a race resolves `false`, and one only
misuse can reach rejects, so none of them answers an HTTP error and none has an error code.

The state itself is the proof: an owner-scheduled row carries `deletedBy: 'owner'` and a `purgeAt`,
as a reaper row carries `deletedBy: 'reaper'`. No rank check applies, so a staff member may delete
and later be erased like anyone else. The purge hands a system context, so the trail says
`system.user.erased`, not an admin erase.

`updateById` and `removeById` stay the doors for an admin: they load by id and ask first.

`staffContacts(ids)` is the read a staff notice makes of the members it found: of those ids, the
accounts that are live, enabled and have an authenticator app armed, with their address and
language. An account without an app has its staff role withheld, so it could not act on the notice
and is left out; so is a banned or deleted one.

## Purchase hold {#purchase-hold}

A protective pause on checkout for one account, so a person steps in before a bot or a loop does
damage. It is a field on the user (`purchaseHold`) with its own two doors and one reader:

| Door                                   | Who                                 | What it does                                                                                                                                                                              |
| -------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /users/{id}/place-purchase-hold` | staff with `ban:User`               | a manual hold ending at `until`, with an optional `note` written for the buyer; replaces any; the same staff hold again (same `until` and `note`) is `409 USER_PURCHASE_HOLD_ALREADY_SET` |
| `POST /users/{id}/lift-purchase-hold`  | staff with `ban:User`               | the review: ends the hold now and restarts the count; `409 USER_PURCHASE_HOLD_NOT_SET` with none                                                                                          |
| `takeAutomaticPurchaseHold`            | `orders` only (`friends/orders.ts`) | the shop's own hold after repeated cancellations; atomic, so only one of two racing calls wins                                                                                            |
| `purchaseHoldOf`                       | `cart`'s checkout                   | the hold in force, if any                                                                                                                                                                 |

A hold is in force while `until` is in the future, so every reader ignores an expired one at once.
Reads show it only while in force, to staff on `/users` and to the buyer on `/account` and in the cart
(a banner). `setBy` (which staff member) is never in any output, the export included: the audit row
names them. The data export carries the stored hold, so an ended one is in it until the nightly
`reap:purchase-holds` reduces it to `purchaseHoldResetAt`, the later of its own `setAt` and the last
staff lift, which is where `orders` restarts the count of cancellations. The count and the trigger are
`orders'` ([the purchase hold](./orders.md#the-purchase-hold)).

**The buyer's mail.** Every hold placed, by staff or by the shop's rule, mails the account's own
address once (an automatic race has one winner, so one mail). It says until when (the instant in UTC:
`users` is a foundation module and may not read the shop's timezone), why (the rule's count and window,
or the staff note), what still works, a link to the contact page pre-filled for an account question
(`NODE_FRONTEND_LINK_CONTACT`), and, in its own paragraph, the right to object and to complain with the
privacy notice linked (`NODE_FRONTEND_LINK_PRIVACY`). The greeting names nobody: the display name is
free text. A mail that cannot be built or queued is logged and never undoes the hold.

**The review flag.** `User.purchaseHoldFlaggedAt` marks an account for a person to look at: it is set
in the same write as an automatic hold, or alone when only PAID cancellations reached the limit
(`system.user.purchase_hold_flagged`; those are statutory withdrawals and never pause anyone). It
outlives the hold, so an unreviewed pause does not drop off the staff list when it ends by itself; it
stays until a staff member acts. Placing a hold or lifting one clears it. Setting the flag alone (paid
cancellations only) announces `user.review_flagged` and clearing it `user.review_cleared`, in the same
transaction: [`tasks`](./tasks.md#system-tasks) opens and closes the review task from them. The
automatic hold announces neither; it has its own staff notice. The `/users` reads show it
(never `/account`); the data export carries it with the rest of the profile.

Audit: `admin.user.purchase_hold_set`; `admin.user.purchase_hold_lifted` (`metadata.inForce` says
whether a hold was still running, so "reviewed, no hold" is audited too; a lift with nothing to clear
is refused, so it writes no row); `system.user.purchase_hold_set`; `system.user.purchase_hold_flagged`. The users list
takes `purchaseHold=true` (held right now) and `purchaseHoldReview=true` (flagged, not yet reviewed)
to find them.
The nightly job `reap:purchase-holds` is listed with the others in
[scheduled jobs](../reference/ops.md#scheduled-jobs).

## Soft delete vs. erasure {#soft-delete-vs-erasure}

`DELETE /users/:id` soft-deletes by default — `deletedAt` is stamped, the account's sessions are
revoked (the [session epoch](./account-sessions.md#the-session-epoch) moves in the same save, as it
does when the account is deactivated, so a restore or an activation never revives an old token), and a
repeated `DELETE` changes nothing. `POST /users/:id/restore` undoes it; the owner
signs in again. `?hardDelete=true` is the one that runs every module's `personalData.erase` hook (the cascade above) and
actually removes the row.

Only the hard path **discharges an Art. 17 erasure request**. The audit trail says
so explicitly: a soft delete emits `admin.user.soft_deleted`, a hard one `admin.user.erased` — two
actions rather than one `admin.user.deleted`, so "was this request actually closed out" is
answerable from the log alone, not from remembering which flag an admin clicked.

[`access`](./access.md#when-the-account-is-erased) is one of the modules in that cascade: the account's roles, tenant and platform, leave in the same
transaction as the row, so a failed erasure takes no role from an account that stays.

Every erase hook receives the **subject** (`userId`, `email`, `emailVerified`, built once by
`personalDataSubjectOf` from the stored account), not just the id: a module that also matches rows
by address, as [`tasks`](./tasks.md) does, needs the address and whether it was proven. The
cascade still writes exactly one `user.erased` outbox row per erasure, inside the same transaction.

A module's erase hook may hand back work to run once the transaction has committed (`AfterErase`):
anything that is not a database write, so a rollback could not undo it. `orders` uses it to cancel
the account's never-paid orders, see [When the account is erased](./orders.md#when-the-account-is-erased).
A failing step is logged and never turns a committed erasure into an error.

A third kind of soft delete is the **owner's own**: `DELETE /account` stamps `deletedAt` (the request
time), `deletedBy: 'owner'` and `purgeAt`, and the account is erased by the `reap:scheduled-deletions`
job once `purgeAt` passes ([the grace](../understand/data-retention.md#self-deletion-a-grace-under-one-month)).
Staff see it in the list (`User.purgeAt`, "erases on {date}") and may restore it with
`POST /users/{id}/restore` while `purgeAt` is ahead, the same `delete:User` key as any restore. Past
it the answer is 409 `USER_ERASURE_DUE` and `actions.restore` is false. The restore commits with the
outbox event `user.deletion_canceled`; `account` drops the restore link and tells the owner staff did
it. There is no reason field: the audit row records who.

## What this module adds to the data export {#what-this-module-adds-to-the-data-export}

Two sections of `POST /account/export`: `profile` (the record, its purchase hold included while one is in force) and `signInMethods`. The second
exists because a linked provider's own subject id is an online identifier (GDPR Art. 4(1)) and
part of what an access request answers (Art. 15), yet it sits behind `select: false` and so is not
in `profile`.

| Exported                                                      | Never exported                                                 |
| ------------------------------------------------------------- | -------------------------------------------------------------- |
| each linked provider: `provider`, `providerId`, `connectedAt` | a second factor's secret, a code in flight, its delivery state |
| each armed second factor: `method`, `enrolledAt`              | the backup-code digests, the password hash                     |

A factor whose setup was never confirmed has no `enrolledAt`, guards no login, and is left out.

## Read next

- [users](./users.md) — the module's own page
