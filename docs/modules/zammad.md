---
type: concept
audience: [developer, operator]
---

# zammad

An optional help desk: hands contact-form messages to a self-hosted Zammad, and keeps its copy of a customer inside the shop's erasure, export and profile rules.

::: tip At a glance
**Owns** — the messages waiting to be handed over, the `{account, Zammad customer}` mapping, the profile-sync rows and the erase jobs. Not the ticket: replies, status and history live in Zammad.
**Depends on** — [`tasks`](./tasks.md) (the port it installs, the to-do it falls back to), [`users`](./users.md) (the verified address, the profile it keeps current), [`account`](./account.md) (the erasure ledger's window, which the erase jobs outlive).
**Breaks if you change** — nothing imports it. It installs `registerContactDelivery` in `tasks` and listens to `user.profile_changed`.
:::

## Its neighbourhood

<!-- module-graph:zammad:start -->

_Solid arrows are imports. Dotted arrows are domain events — the return path an import
graph cannot see._

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 30, 'rankSpacing': 60}}}%%
flowchart LR
    zammad["zammad<br/><i>this module</i>"]
    account["account"]
    tasks["tasks"]
    users["users"]

    zammad --> account
    zammad --> tasks
    zammad --> users
    users -. "user.profile_changed" .-> zammad

    classDef core fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef supporting fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef generic fill:#dcfce7,stroke:#16a34a,color:#111827;
    classDef centre fill:#ede9fe,stroke:#7c3aed,stroke-width:2px,color:#111827;
    class account,tasks,users generic;
    class zammad centre;
```

<!-- module-graph:zammad:end -->

## The story

```mermaid
flowchart LR
    form["POST /tasks"] --> tasks["tasks.submit"]
    tasks -->|"port takes it"| pending[("pending row")]
    tasks -->|"URL unset, or spam"| todo["to-do + mail<br/><i>basic mode</i>"]
    pending -->|"nudge, then sweep every minute"| zammad["Zammad ticket"]
    pending -->|"last retry failed"| todo
```

Three things stay true whatever Zammad does:

- **Basic mode is untouched.** The support mailbox and the contact to-do are always in the code.
- **The module is inert while `NODE_ZAMMAD_URL` is unset.** The port answers "not me" and `tasks` files the to-do.
- **Removing the module returns the app to basic mode.** See [Removing the module](#removing-the-module).

## Configuration

| Variable                     | Meaning                                                                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ZAMMAD_URL`            | Zammad's internal rails address on the `helpdesk` network (`http://zammad-railsserver:3000`), never nginx and never the public host. No default: unset means inert. |
| `NODE_ZAMMAD_API_TOKEN`      | The integration user's token. `NODE_ZAMMAD_API_TOKEN_FILE` stands in for it; in production it is the `zammad_api_token` secret file, and an empty file is unset.    |
| `NODE_ZAMMAD_GROUP`          | The Zammad group a contact message is filed in.                                                                                                                     |
| `NODE_ZAMMAD_RETENTION_DAYS` | Days a ticket is kept after the customer's last contact, else after its creation (default 730). Read by [the retention job](#retention).                            |
| `ZAMMAD_PORT`                | The loopback port Zammad's nginx publishes on (compose only; the app never reads it).                                                                               |

The URL, token and group are set together: a URL without the other two refuses boot.

## The hand-over

The request never waits on Zammad (G13). `POST /tasks` stores a **pending row** and answers `202`.

| Step              | What happens                                                                                                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Take              | `tasks.submit` screens the message. A honeypot catch stays local; an email-check catch goes to Zammad as [spam](#spam). Otherwise the port stores a pending row and starts an in-process nudge. |
| Send              | A claimed row (leased, like the outbox) becomes one `POST /api/v1/tickets`: group, customer, one `web` article from the customer with an HTML-escaped body.                                     |
| Our fields        | `shop_category`, `order_number`, `shop_sender_verified`, `request_ref` (the row's id) and `shop_account` (a link to the account in our admin).                                                  |
| Retry             | A failure pushes the row out by the outbox's backoff, without jitter. The sweep `sweep:zammad-contacts` runs every minute as the safety net.                                                    |
| Unclear outcome   | A timeout, a 5xx or a 429 may have created the ticket. The next attempt searches `request_ref` first and adopts the ticket it finds; otherwise it resends.                                      |
| Last retry failed | The message becomes a to-do and the link-only mail goes to the support mailbox. The row is blanked to a tombstone that the fallback alert counts for a week.                                    |

**Dedup.** Zammad has no idempotency key. `request_ref` is ours: a `condition` search with no `query`, which Zammad runs as plain SQL, with or without Elasticsearch.

**A missing `request_ref`.** Zammad drops a field it does not know. An answer without it is logged as an error: `zammad:setup` never ran.

**The link-only mail (L7).** While the module is on, the mail to the support mailbox carries `[#ref]` and the admin link and nothing else: no customer data, no `Reply-To`. A help desk reading that mailbox would otherwise file the visitor's words as a second conversation. The overdue and due-soon reminders are link-only too, and the erasure notice to the mailbox is not sent.

### The customer

Zammad's key for a customer is the email address. We add one thing, a local `{userId, zammadUserId}` mapping, written only under the **signed-in-sender rule**: the sender was signed in and the address they typed is their account's verified address. A guest, an unverified account or a different address gets a customer keyed by the address alone, with no mapping. **Every** hand-over is sent as `customer_id: "guess:<email>"`, mapped or not (a `customer: "guess:…"` is a `422`; `customer_id` is the form Zammad takes): the stored id is never sent, because after a Zammad restore it can be dead or reused by a stranger, while the verified address is the sender's own. The mapping is kept for profile sync, the export and erasure, and each hand-over rewrites it to the customer Zammad actually used.

## Profile sync

`user.profile_changed` carries field names, never values. The subscriber writes one row per account, and only when the **email** moved and the account has a mapping. `sweep:zammad-profiles` reads the **current** address and overwrites the customer's, so a burst of changes is one call. Only the address is sent: Zammad accepts a customer with an email alone, and a name is data it does not need.

Zammad refusing for good is logged and dropped: a `422` means the new address already belongs to another customer (Zammad has no merge, so staff move the tickets by hand, see [the staff guide](../use-the-shop/support.md)), a `404` means the customer is gone.

## Personal data

| Data                             | Export                                               | Erase                                                                                      |
| -------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Pending messages                 | `zammad.pendingContacts`                             | deleted by account id, or by verified email                                                |
| The `{userId, zammadUserId}` row | `zammad.customerId`                                  | deleted, after its id is copied into the erase job                                         |
| The profile-sync row             | not exported (a pointer, no data)                    | deleted                                                                                    |
| Zammad's own copy                | `zammad.customers`: customer, tickets, every article | an [erase job](#erasure) has Zammad delete the customer, their tickets, articles and files |

The erase hook runs inside the erasure transaction.

### Erasure {#erasure}

```mermaid
flowchart LR
    hook["erase hook<br/><i>in the erasure's transaction</i>"] --> job[("erase job<br/>pending")]
    job -->|"sweep:zammad-erasures, every minute"| task["POST /data_privacy_tasks<br/>one per customer"]
    task -->|"poll"| done{"state"}
    done -->|"completed, or customer gone"| completed[("completed<br/><i>address dropped, id kept</i>")]
    done -->|"in process"| job
    done -->|"failed"| failed[("failed<br/><i>alert, a technician looks</i>")]
```

The row `{userId, zammadUserIds[], email, state}` is written **inside the erasure's transaction**, so it exists exactly when the account is gone. The ids come from the mapping, read before it is deleted. `email` is the account's address and is stored **only when verified and only where Zammad was ever set up here** (the `groups-verified` marker `zammad:setup` leaves; with no marker no help desk ever held this person, so no job and no kept address), whether or not the URL is set now: anyone can sign up with a stranger's address, and looking it up would erase a stranger. It covers a person who wrote before they had an account.

`sweep:zammad-erasures` claims a job (leased) and, per customer:

| What it finds                            | What it does                                                                     |
| ---------------------------------------- | -------------------------------------------------------------------------------- |
| the verified address not yet looked up   | finds every user holding it, once, and adds the ones with the Customer role only |
| a non-customer holding the address       | never targeted; once the customers are filed the job is parked `failed` (below)  |
| the customer is already gone from Zammad | counts it as done, files nothing                                                 |
| no task yet                              | `POST /api/v1/data_privacy_tasks {deletable_type: "User"}`                       |
| a `422` (a task is already queued)       | looks that task up in the list and follows it                                    |
| a task `in process`                      | waits for the next pass; never files a second one                                |
| a task `completed`                       | done                                                                             |
| a task `failed`                          | parks the whole job as `failed`: it is not retried                               |
| Zammad unreachable or refusing           | retries by the outbox's backoff; **never gives up**, because the erasure is owed |

When every customer is done the row becomes `completed`, **drops the address**, and stays until the erasure ledger forgets it (`NODE_ERASURE_LEDGER_RETENTION_DAYS`, 220 days): it is what [the replay](../operate/zammad.md#restore) reads. A `failed` or an hour-old `pending` job never expires. `ZammadEraseFailed` and `ZammadEraseStuck` say so.

**How long a task takes.** Zammad runs its Data Privacy tasks from a scheduler with a ten-minute period, so a task reaches `completed` up to about ten minutes after it was filed (five seen on a quiet instance). The sweep polls every minute until then.

**An agent who shares the address.** The address lookup lists roles. A user with any role besides Customer (an agent, an admin) is never put in a task, **whichever path named it** (the address lookup, the mapping, a ticket's customer, a race): the customers that hold the address are filed as normal, then the job is parked `failed`, so `ZammadEraseFailed` reaches staff, who decide by hand. The log names the Zammad user id and role names only, never an address.

**What Zammad's task removes:** the customer, their tickets and articles, their search-index entries, and the attachments and raw mail nothing else refers to.

**Mentions stay.** An article on **another** customer's ticket that names the person is not found: Zammad has no tool for it. The staff guide rule is to write the order number, not the name; the mention ends with that ticket's [retention](#retention). For the rare case, staff file a Ticket deletion task by hand.

**Zammad keeps a masked task row** (`j*e@e*e.com` and the ticket numbers) and its audit log keeps a password change someone else made, with the full name. A Ticket deletion task keeps the masked title. All of it is cleaned after 12 months. The [data retention page](../understand/data-retention.md#the-help-desk-zammad) says so.

**The erasure race.** An account erased between the claim and the sender lookup files nothing: the worker finds the account gone, drops the row and logs a warning, so the words never go out under the typed address (the erasure's own job already covers the address). When an earlier attempt's outcome was unclear, a ticket may already exist: the worker looks it up by its `request_ref` and asks Zammad to delete **that ticket** (a Data Privacy task on the ticket, not on its customer, who may be someone else); if Zammad cannot be asked the row stays for the next attempt. The last-retry fallback makes the same check right before it files its to-do, so an erased person's words never come back as one. A worker that created a ticket deletes its row by id afterwards. A row already gone means one of two things: the account was erased while the call was in flight, or a second worker took over a lapsed lease and settled the row first. Only the first is an erasure, so the worker looks the account up: while it exists nothing is queued. A guest message has no account to look up, so it is race-erased only when an erase job still holds its address (positive evidence); otherwise the worker logs and stops. When it is gone, nothing is mapped, and the worker writes an erase job for the customer the ticket created, **but only when that customer is the erased person's**: the sender was linked to the account (typed its verified address), or there was no account and the row went by the verified address. A signed-in sender who typed someone else's address made a customer that is the stranger's, which stays; the worker logs an error instead.

### Export {#export}

`zammad.customers` reads Zammad through its API on every export: the customer, their tickets, every article (**internal notes included, the author left out**: `from`, `to` and `cc` appear only on what the customer wrote) and **the files the customer sent**, base64 in the file itself. Art. 15(3) asks for a copy, and an export that named files without carrying them would look complete without being. It finds the account's mapped customer and any customer holding the verified address, and keeps only tickets that name that customer. A Zammad that ignores paging fails the export. A file over 50 MiB, or files past 64 MiB together, fail the export too: it is built in memory, and a cut-down copy must not look complete. **If Zammad cannot be read the whole export fails**: an incomplete Art. 15 answer must never look like a complete one.

## Retention {#retention}

`reap:zammad-retention` runs daily, leased, and files the same Data Privacy task the erase job uses. Zammad has no retention of its own, so the clock is ours.

| What                    | When it is deleted                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A ticket                | its last customer message (`last_contact_customer_at`), else its creation, is older than `NODE_ZAMMAD_RETENTION_DAYS` (730), open or closed |
| A customer              | created before that cutoff, holding the Customer role only, with no ticket left, and `zammad:setup` has confirmed the groups                |
| A suspected-spam ticket | tagged `suspected-spam` and older than 30 days                                                                                              |

Reaping a customer also drops the account mapping that pointed at it, so a later message from that account is filed under its address instead of a dead id. Agents, admins and the integration user carry another role and are never listed. **Customers are reaped only once `zammad:setup` has confirmed the integration role reads every group** (it leaves a `groups-verified` row in `zammadsetups`): a customer whose tickets sit in a group the role cannot read looks ticketless. Without that row the tickets and spam still go, the customers are skipped and the run fails, so `ScheduledJobStale` hears of it. Every search is only a net: each ticket is re-checked in code (its age, and for spam the tag read back) before a task is filed, so a Zammad that ignored a search condition cannot cause a mass deletion. Every page is read until a short one; the lease is 60 minutes. A full page that adds nothing new (Zammad ignoring `page`) fails the run, so the failure reaches `ScheduledJobStale`. The pass files tasks and does not follow them: one Zammad has not run by tomorrow answers `422` and is skipped. This relies on `ticket_last_contact_behaviour = based_on_customer_reaction`, so that every customer message moves the clock ([Setup](#setup)).

## Spam {#spam}

| Signal                                            | Where it goes                                                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Email check (a disposable or unreachable address) | Zammad, created already `closed`, tagged `suspected-spam`, with the `X-Zammad-Suppress-Notifications` header so nobody is mailed |
| Honeypot                                          | a closed local spam to-do, as in basic mode                                                                                      |

Zammad refusing `state: closed` on create makes the worker create the ticket and then close it, in the same step. After a lost answer the retry adopts the ticket it finds and tags it again. Either way the visitor got the ordinary `202`. Both kinds are deleted after **30 days**: the retention pass for the tickets, and a TTL index on `tasks` for the local to-dos (`tasks_spam_ttl`; a database that already exists needs `npm run db:sync`).

## Restore after Zammad alone is restored {#restore-replay}

A restored dump brings back customers erased after it. `npm run zammad:replay-erasures -- --since <dump time>` sets the erase jobs completed since then back to `pending`, runs one erase pass, and writes a restoration-log audit row (`zammad.erasures.replayed`). A customer the restored Zammad does not hold counts as done, so a customer created after the dump needs no special case. The order of the whole recovery is in [the runbook](../operate/zammad.md#restore). A whole-host restore is already covered: `ops:reapply-erasures` brings the erase hook back to life.

## Setup

The technician does this once, in Zammad, before setting `NODE_ZAMMAD_URL`.

1. **Two-factor on the Agent and Admin roles** (an authenticator app or a security key). Staff log in with a password; there is no SSO.
2. **Settings:** `api_password_access = false` (basic auth skips 2FA on the calendar feeds) and `geo_ip_backend` off (it sends every client address to a third party). `ticket_last_contact_behaviour = based_on_customer_reaction` is **done by `zammad:setup`** (step 7), which writes it only when Zammad holds another value. It is **not Zammad's default** (that is `check_if_agent_already_replied`, under which a customer's second message moves nothing), and the retention clock rests on it.
3. **Roles:** remove `user_preferences.access_token` from the Agent and Admin roles (a token skips 2FA). Turn off "New User Accounts" and `user_lost_password`. An admin resets a staff password.
4. **Turn off the default "auto reply (on new tickets)" trigger.** It fires on API tickets too, mails whatever address a visitor typed, and points customers at Zammad's portal. Basic mode sends the visitor nothing, and so does this.
5. **The integration user:** `integration@helpdesk.invalid`, in no notification group, with a random password nobody uses. Make a role named exactly **`Shop integration`**, holding `ticket.agent` and `admin.data_privacy` and **not** `admin.user`, and give it to this user (and only this role). Its group access is not yours to set: step 7 gives it `read` on every group and `create` and `change` on the intake group only.
6. **The token.** A user can only mint tokens for themselves and the access-token permission is removed, so use the Rails console: `Token.create!(action: 'api', user_id: <id>, persistent: true, expires_at: 12.months.from_now, preferences: {permission: ['ticket.agent', 'admin.data_privacy']})`. Put it in `NODE_ZAMMAD_API_TOKEN` (or the `_FILE`). **Rotation:** create a new token, deploy, delete the old one. Tokens coexist, so there is no gap.
7. **The fields and the last-contact setting:** `ZAMMAD_ADMIN_TOKEN=<an admin token> npm run zammad:setup`. It also finds the `Shop integration` role and gives it `read` on every group (a role that already holds more keeps it; `create` and `change` stay on the intake group, `NODE_ZAMMAD_GROUP`, only (a spam ticket is closed and tagged after it is made, and Zammad answers 403 to either without `change`)), adding only what is missing and logging it as `roleGranted`. It is **fail-closed**: it exits non-zero when the role is missing or any group is still unreadable after the grant, and a run deletes the old `groups-verified` marker when it starts, so only a passing run leaves the one that [retention](#retention) and the erase hook check. The script therefore needs the app's database settings (`NODE_DB_URI`), as `zammad:replay-erasures` does. A group added later needs the script run again. It is idempotent: it sets `ticket_last_contact_behaviour` (and logs `settingsChanged`, empty when it was already right) and creates or updates `shop_category` (one option per `TaskCategory`), `order_number`, `request_ref`, `shop_sender_verified` and `shop_account`. Creating a field makes Zammad restart itself once; compose brings it back. Changing the options later needs neither migration nor restart.
8. **The email channel:** an IMAP + SMTP channel on the support mailbox, so staff replies leave from it and customer replies come back to it. Pointing `NODE_SUPPORT_EMAIL` at that mailbox is the usual choice; taking the module out means pointing it back.
9. **The privacy deadline:** `privacy` messages owe an answer within one month (GDPR Art. 12(3)). Add an SLA whose condition is `shop_category is privacy`: an SLA condition can read a custom field (confirmed on 7.2.3), so no tag is needed.

10. **A "Suspected spam" view:** an overview whose condition is the tag `suspected-spam`, so staff can glance over what the email check caught before the retention pass deletes it after 30 days. Nobody is mailed about them.

**Reply-To.** Every transactional mail carries `Reply-To: NODE_SUPPORT_EMAIL`, so a customer's reply to an order mail becomes a ticket. That is intended: it is support traffic.

**Turning search on.** The module ships with `ELASTICSEARCH_ENABLED=false`: staff search is substring-only and Zammad's reports refuse to run. To turn it on, add an Elasticsearch service and set the variable; Zammad's init container rebuilds a missing index on its next start, so the switch is reversible. Nothing here needs it: the lookups use `condition` searches, which run as SQL.

## Watching it

| Signal                   | Where                                                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `ZammadHandoverStuck`    | The oldest waiting message is older than 15 minutes: the sweep is not running, or Zammad refuses.                                            |
| `ZammadHandoverFellBack` | A message gave up and fell back to a to-do. Look at Zammad; the to-do is resolved in our admin.                                              |
| `ZammadEraseFailed`      | Zammad reported a deletion task failed: an erased person may still be in the help desk. Look at the task in Zammad and at `zammaderasejobs`. |
| `ZammadEraseStuck`       | An erase job has waited over an hour: the sweep is not running, Zammad is unreachable, or its task is not moving.                            |
| Zammad's health check    | [Gatus](../operate/gatus.md) reads `/api/v1/monitoring/health_check`, which also reports a failing email channel (IMAP errors).              |

The gauges are read from the database when Prometheus scrapes the app, not counted in the cron container, which nobody scrapes. The module is never part of `/readyz`: a help-desk outage must not take the shop down.

## Staff entry

The frontend shows a "Helpdesk" link to staff only when its own runtime setting `ZAMMAD_URL` (falling back to `VITE_ZAMMAD_URL`) is set. There is no `GET /config` change: the backend does not tell the frontend where Zammad is.

## Removing the module

Delete `src/modules/zammad/` and its line in `src/modules.ts`, then what the module owned outside its folder:

- `scripts/ops/zammad-setup.ts` and `scripts/ops/zammad-replay-erasures.ts`, the `zammad:setup`, `zammad:replay-erasures` and `test:zammad` scripts, with `jest.config.zammad.js` and `jest.sequencer.zammad.js`;
- the four `Zammad*` alerts in `docker/observability/prometheus.alert-rules.yaml` and their cases in the test file;
- `tests/support/zammad-stub.ts`, `tests/integration/zammad-erasure.test.ts`, and the `NODE_ZAMMAD_*` block of `.env-example`.

The port goes with the module, so `tasks` files the to-do again and sends the full mail; point the mailbox back by hand.

**The module's data is personal data, so it does not stay behind.** Before deleting the code, let the pending messages drain: while `NODE_ZAMMAD_URL` is set the sweep hands each to Zammad or, after the last retry, falls it back to a to-do, so wait until `zammadcontacts` holds no `pending` row. (With the URL unset the sweep does nothing.) Let the erase jobs finish as well: `zammaderasejobs` must hold no `pending` or `failed` row, or an erased person is still in Zammad. Then drop the five collections by hand: `zammadcontacts` (waiting messages and fallback markers), `zammadcustomers` (the account to Zammad customer map), `zammadprofilesyncs`, `zammadsetups` (the groups-verified marker) and `zammaderasejobs` (the completed rows are the replay's record). Removing the code alone leaves them in the database. The `tasks_spam_ttl` index stays: it belongs to `tasks`. The deletability check passes: with the module gone, `tsc` and the `tasks` and cross-cutting suites stay green ([how to re-run it](../build/module-removal.md#re-running-the-deletability-check)).

## Testing {#testing}

Three layers, each answering what the one before cannot:

| Layer              | Where                                                           | What it proves                                                               |
| ------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| The double         | `tests/` of this module, against `tests/support/zammad-stub.ts` | Our logic: retries, dedup, the erase job's states, the export, retention.    |
| The adapter        | `tests/real-zammad/adapter.contract.test.ts`                    | That the real Zammad answers the calls the adapter makes the way it expects. |
| The journeys, GDPR | `tests/real-zammad/{journeys,gdpr}.test.ts`                     | That what we send is kept, and what we ask to be deleted is deleted.         |

The last two run with `npm run test:zammad` against a booted Zammad (`NODE_TEST_ZAMMAD_URL`, `NODE_TEST_ZAMMAD_TOKEN`, `NODE_TEST_ZAMMAD_ADMIN_TOKEN`; an unset variable fails the run, it never skips it). `npm test` ignores them. The `zammad` job in `ci.yml` boots the pinned services, runs `npm run zammad:setup`, mints the two tokens and runs the suites on every push, so a bump of the Zammad pin is proven before it merges ([Upgrade](../operate/zammad.md#upgrade)). The journeys wait for Zammad's own Data Privacy scheduler (a ten-minute tick), so a run takes about ten minutes. `jest.sequencer.zammad.js` runs the GDPR file last: its retention case files a deletion for everything older than its shifted clock.

**What the real Zammad confirmed (7.2.3):**

| Question                                                                                | Answer                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A `condition` search on `request_ref` finds the ticket                                  | Yes, without Elasticsearch (tested); with it, untested.                                                                                                                                                                                |
| `customer_id: "guess:<email>"` makes, then reuses, a customer                           | Yes. `customer: "guess:<email>"` answers 422, so the adapter sends `customer_id`.                                                                                                                                                      |
| A ticket can be created with `state: closed`                                            | Yes, in one call.                                                                                                                                                                                                                      |
| `X-Zammad-Suppress-Notifications` silences a create                                     | Yes, for a token with `ticket.agent`: an agent watching the group gets nothing, and gets notified of an ordinary create.                                                                                                               |
| `POST /tags/add`, and reading tags back                                                 | Yes. The read answers `{"tags": [...]}`, not a bare list; adding a tag twice is a no-op.                                                                                                                                               |
| The conditions `ticket.tags` (contains one) and `ticket.created_at` (before (absolute)) | Yes, together.                                                                                                                                                                                                                         |
| A user search by address without Elasticsearch                                          | Yes, exact address found.                                                                                                                                                                                                              |
| `/users?expand=true` lists role names                                                   | Yes (`["Customer"]`, `["Agent"]`), which is what keeps retention off staff.                                                                                                                                                            |
| `tickets/search` honours `per_page=100` and `page`                                      | Yes: 101 tickets come back in two pages.                                                                                                                                                                                               |
| The Data Privacy task                                                                   | Lists at `GET /data_privacy_tasks`, states `in process` and `completed`; a second task for the same object answers 422 "already queued". Deletes the customer, their tickets, articles and stored files.                               |
| An SLA on a custom field (`shop_category`)                                              | Yes: tickets of that category get an escalation time, others none.                                                                                                                                                                     |
| `last_contact_at` under `based_on_customer_reaction`                                    | Moves on a customer's message, not on an internal note. Under Zammad's default setting it does not move on the second message.                                                                                                         |
| `last_contact_customer_at`                                                              | The customer's own last message: an agent's public reply moves `last_contact_at`, not this, so retention reads it. _(asserted by the real-Zammad GDPR suite)_                                                                          |
| A role's group access                                                                   | `GET /roles` lists `group_ids` as `{"<group id>": ["create","read",…]}`; `PUT /roles/:id` with the whole hash grants. A new role holds none. A role is created with `permissions: [names]`; there is no `/permissions` route (404).    |
| What the integration role needs on the intake group                                     | `read`, `create` **and `change`**: tagging (`/tags/add`), closing (`PUT /tickets/:id`) and adding an article answer 403 without `change`. The first run with a role-only token found it; the admin token CI used before had hidden it. |
| `/users/:id`, `/users/search`, `/users` role names                                      | Only with `expand=true`; without it no `roles` come back, so a caller that forgot reads a staff user as unknown.                                                                                                                       |
| A search result carries our `request_ref`                                               | Yes, on every ticket in the list (the lookup keeps an exact match only).                                                                                                                                                               |

## Libraries

None. The adapter uses `fetch`, `AbortSignal.timeout` and Zod, all already in the project.

## Read next

- [tasks](./tasks.md) — the port, the to-do and the lifecycle this module falls back to
- [Task lifecycle](./tasks-lifecycle.md) — jurisdiction and the hand-over's place in it
- [Support guide](../use-the-shop/support.md) — what staff do by hand
