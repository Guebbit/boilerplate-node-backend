---
type: task
audience: [operator]
---

# Restoring

Restore the database and the uploads, and handle erasures after a restore.

## Before you start

- A reachable restic repository and its `restic_password`.
- A stack with an empty or replaceable database.

## Steps

### 1 · Restoring

The drill proves the machinery. For a real incident:

| Situation                                           | Restore command                                                                        | Why                                                                                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Give one client its own data back                   | `mongorestore --archive --ssl --sslCAFile ... --nsInclude="<client>.*" --drop`         | `--nsInclude` and `--oplogReplay` cannot be combined; this restores the client's collections as of the dump's end, not perfectly cross-collection consistent |
| Disaster recovery: the host, or the volume, is gone | `mongorestore --archive --ssl --sslCAFile ... --oplogReplay` into a **fresh** instance | Full, oplog-consistent. Restoring `admin` and `config` over a LIVE replica set's own identity is not what you want, hence a fresh target                     |

Both read the dump from restic: `restic dump <snapshot> mongodump.archive | mongorestore --archive ...`.
The Database Tools spell TLS `--ssl --sslCAFile`, and the bundled `database` requires it.

0. **Silence the pages the restore will cause.** Stopping the stack on purpose fires `ApiDown`,
   `WorkerDown` and the stale-job alerts. Hold those back for the restore window; monitoring itself stays up:

    ```sh
    docker compose --env-file "clients/$COMPOSE_PROJECT_NAME/.env" -f compose.yaml -f compose.production.yaml \
        exec alertmanager amtool --alertmanager.url=http://localhost:9093 silence add \
        --author "<your name>" --comment "restore of <restic id>" --duration 2h \
        'alertname=~"ApiDown|WorkerDown|ScheduledJobStale|FrequentSweepStale|HeldJobsStuck"'
    ```

    Skip this step when the monitoring profile is off: there is no Alertmanager. The silence ends by itself. Expire it earlier with `amtool silence expire <id>` once step 5 is healthy.

1. **Stop every process that touches the database, by name.** `docker compose stop app worker worker-heavy cron backup`.
   Leave the rest of the stack running (the database, the broker, Redis, monitoring). They stay stopped until step 5.
2. **Restore the database**, then the files (`restic restore <files snapshot> --target <dir>`, then copy
   into the `uploads` volume and `storage/mail-spool`).
3. **Put the newest erasure ledger back.** The restored copy only knows erasures from before the snapshot.
    - **The live database still answers:** copy its `erasureledgers` collection over the restored one
      (`mongodump --collection erasureledgers`, then `mongorestore --nsInclude="<db>.erasureledgers" --drop`).
    - **The host is gone:** restore the **newest** snapshot's `erasureledgers` the same way
      (`--nsInclude` cannot be combined with `--oplogReplay`, so this is its own `mongorestore` run after the
      full restore of step 2).
4. **Re-apply the erasures, before anything starts:**

    ```sh
    docker compose --env-file "clients/$COMPOSE_PROJECT_NAME/.env" -f compose.yaml -f compose.production.yaml \
        run --rm --no-deps cron \
        node --import tsx scripts/ops/reapply-erasures.ts --since <the snapshot time, ISO> --snapshot <restic id> --by <your name>
    ```

    `--env-file` is not optional: without it the client's settings never reach `cron` and the script stops
    with "DB connection refused by configuration". A manual run also needs `APP_IMAGE` exported: the image
    currently deployed, the image on the last line of `clients/<name>/deploys.log` (`docker/deploy.sh` sets
    it for you). `docker compose` stands for your engine's compose: `podman compose` where the engine is
    podman (the repo's `npm run compose` picks it).

    Run it in `cron`: it mounts `uploads`, so an erased account's avatar is deleted again too, and the
    production image has no npm. `--no-deps` because step 1 stopped `app`, `worker`, `worker-heavy` and `cron`, and
    `run` would otherwise start their dependencies. Step 1 is the guard: nothing checks that they are stopped, and
    the purge job (which has no HTTP port to probe) must not run beside it. It erases again each account the
    ledger names since `--since`, keeping the original erasure date, and writes one restoration-log audit row
    (`auth.erasures.reapplied`: who, which snapshot, the counts and ids). Safe to repeat; it exits non-zero
    while any account could not be erased.

    It also deletes the **held jobs** that still name an erased account's address (a mail waits in `jobs`
    while the broker is down, and a dead one keeps its payload for 7 days), spooled attachments included. It
    does this twice: inside each erasure, and once more at the end, because re-sending the restored outbox
    rows can hold a new job for an address that was just erased. The log row lists the ids of the jobs removed
    (`heldJobsRemoved`), never the addresses. If it fails in the final sweep (the account is then listed under
    `failed` and the exit code is 1), restart from step 2 (restore again) and rerun: the restored accounts bring
    their addresses back.

    **4b · Empty the work queues.** The broker still holds messages from before the restore: mails and
    exports for accounts and orders the restored database may not know, and for people just erased. With
    `app`, `worker`, `worker-heavy` and `cron` still stopped:

    ```sh
    docker compose --env-file "clients/$COMPOSE_PROJECT_NAME/.env" -f compose.yaml -f compose.production.yaml \
        exec -u rabbitmq queue sh -c 'rabbitmqctl -q list_queues name | grep "^worker\." | grep -v "\.dead$" | while read q; do rabbitmqctl -q purge_queue "$q" < /dev/null; done'
    docker compose --env-file "clients/$COMPOSE_PROJECT_NAME/.env" -f compose.yaml -f compose.production.yaml \
        exec -u rabbitmq queue sh -c 'rabbitmqctl -q list_queues name | grep -E "^worker\.email\..*\.dead$" | while read q; do rabbitmqctl -q purge_queue "$q" < /dev/null; done'
    ```

    - The first line empties every work queue and its `.retry` queue. The second empties the mail
      `.dead` queues: they hold full mail bodies, address included, for 7 days. The other `.dead` queues
      carry ids only and stay, for inspection.
    - **Never move `.dead` messages back after a restore.** They refer to the world before the restore,
      and they expire in 7 days.
    - `-u rabbitmq`: `rabbitmqctl` run as root breaks the broker ([why](../understand/rabbitmq.md#run-broker-tools-as-rabbitmq-never-root)).
      `^worker\.`: a broker shared with the twin keeps the twin's queues.
    - A broker with its own vhost: add `-p <vhost>` to `list_queues` and `purge_queue`. An external broker has no
      `queue` service: purge the same queues through its management API (`DELETE /api/queues/<vhost>/<name>/contents`).

    **4c · Log everyone out.** The restored `sessions` table holds sessions that were revoked after the
    snapshot (a logout, a password change, a stolen device) and brings them back to life. Delete every session and
    every one-time token except the two kinds a person needs after a restore (the link that cancels a deletion, and
    the link that undoes an email change):

    ```sh
    docker compose --env-file "clients/$COMPOSE_PROJECT_NAME/.env" -f compose.yaml -f compose.production.yaml \
        exec database mongosh --tls --tlsCAFile /keyfile-dir/mongo-ca.crt \
        -u "$MONGO_ROOT_USER" -p --authenticationDatabase admin "<MONGO_DB>" --eval '
          db.sessions.deleteMany({});
          db.verificationtokens.deleteMany({ type: { $nin: ["account-restore", "email-change-undo"] } });
        '
    ```

    Everyone signs in again. In `jwt` mode an access token already issued still works until it expires (10
    minutes). Then give staff the **post-snapshot security list**: what the restore undid that no script can redo.
    Read it from `auditlogs` (`timestamp` after the snapshot) or, if the database is gone, from Loki
    (`{service="api"} |= "<action>"`):

    | Look for                                                                                                             | What staff do                                                                                    |
    | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
    | `admin.api_key.revoked`, `system.api_keys.revoked_on_compromise`                                                     | Revoke those API keys again (`DELETE /api-keys/{id}`): the restore made them valid               |
    | `admin.webhook_subscription.secret_removed`, `admin.webhook_subscription.secret_rotated`                             | Remove or rotate the signing secret again: a dropped secret came back                            |
    | `auth.password.changed`, `auth.password_reset.completed`, `auth.two_factor.*`, `auth.oauth.*`, `auth.email_change.*` | Tell those users (the audit rows name the account) to redo the change. Nothing is reset for them |

    With no surviving source, write it in the incident log, as for the erasures below. If a secret may have
    leaked, also rotate it: [Key and credential rotation](../operate/key-rotation.md).

    **4d · Clear the response cache.** The restored database moved under Redis, which keeps answering with what it
    cached. Same `--env-file` and `APP_IMAGE` as step 4; `limits` (the rate-limit Redis) is left alone:

    ```sh
    docker compose --env-file "clients/$COMPOSE_PROJECT_NAME/.env" -f compose.yaml -f compose.production.yaml \
        run --rm --no-deps cron node --import tsx scripts/db/cache-clear.ts
    ```

5. **Start the stack** and look: log in, open an order, fetch an image. Mail, stock alerts, the purge job
   and webhooks only ever see the already-erased state.
6. **Reconcile with the payment provider.** The restored database forgets every payment and refund
   made after the snapshot, while the provider still holds them. The sweep and the refund sync only
   reach payments the restored database still has, so compare by hand: open the provider dashboard's
   payments and disputes since the snapshot and check each against the app. Each one the app lacks is
   a buyer charged with no order: refund it at the provider, or re-create the order by hand. The
   payment sweep (`sweep:payment-effects`) runs by itself every 5 minutes once step 5 starts cron.
   Run `POST /payments/{id}/refunds/sync` on each payment refunded at the provider since the
   snapshot. The shop assumes it owns its provider account: money
   moved there by anything else is not reconciled.

#### Erasures after a restore

A backup kept for six months holds accounts erased since. GDPR's accepted standard (the ICO's guidance) lets a
backup keep them until it ages out, **if** they stay "beyond use". The duty to **re-apply every erasure after a
restore, before use** is the EDPB's: its 2025 coordinated enforcement report (p. 20) asks controllers to keep track
of erasure requests and comply with them on restored systems. SDM Baustein 60 (M60.S10) says the same. This repo's
promise is exactly that: [Data retention](../understand/data-retention.md#backups-and-erasure).

```mermaid
flowchart TD
    Silence["0. silence ApiDown, WorkerDown"] --> Stop["1. stop app, worker, worker-heavy, cron, backup"]
    Stop --> Restore["2. restore database and files"]
    Restore --> Ledger["3. put the newest ledger back<br/><i>live DB, or newest snapshot</i>"]
    Ledger --> Reapply["4. ops:reapply-erasures --since<br/><i>accounts, then their held jobs</i>"]
    Reapply -->|failed greater than 0| Reapply
    Reapply --> Queues["4b. empty worker.* queues<br/><i>and the mail .dead queues</i>"]
    Queues --> Logout["4c. delete sessions and tokens,<br/>staff re-revoke from the list"]
    Logout --> Cache["4d. clear the response cache"]
    Cache --> Start["5. start the stack"]
```

The list is the **erasure ledger** (`erasureledgers`): `{ userId, at, kind }`, written inside the erasure's own
transaction (an owner's schedule and cancel too; a staff cancel reaches it a moment later, through the outbox), kept `NODE_ERASURE_LEDGER_RETENTION_DAYS` (220 by default, above the oldest backup with the default
keep knobs; raise it with them). Raise `BACKUP_KEEP_MONTHLY` and the ledger must outlive it, or a restore of the
oldest snapshot brings back an account the ledger has forgotten.

**Deletion locks follow the ledger too.** Besides `erased`, the ledger records `scheduled` (with the
`purgeAt` the owner was promised, stored and never recomputed) and `canceled`. For each account the command
applies the latest event since `--since`: `erased` always wins; otherwise a later `scheduled` locks the account
at the stored date (and ends its sessions), a later `canceled` clears the lock even if `purgeAt` has passed,
and cancel-then-ask-again stays scheduled. The log prints the counts and then the ids of every account in each outcome (`erased`, `alreadyGone`, `rescheduled`, `unscheduled`, `unchanged`, `failed`): the restored audit log lost the rows written after the snapshot, so these ids are the record.
No manual check is needed before starting the stack.

**Only if the ledger is lost** (the host, and the newest snapshot's copy): fall back to the audit events, which
are shorter-lived (`auditlogs` keeps 180 days, `NODE_AUDIT_RETENTION_DAYS`; Loki 7 by default).

- **The database still answers:**

    ```js
    db.auditlogs.find(
        {
            action: {
                $in: ['admin.user.erased', 'system.user.erased', 'auth.account_delete.completed']
            },
            outcome: 'success',
            timestamp: { $gt: ISODate('<the snapshot time>') }
        },
        { action: 1, targetId: 1, actorUserId: 1, timestamp: 1 }
    );
    ```

    The erased user is `targetId` for the admin and system events, `actorUserId` for a self-deletion.

- **The database is gone:** the same events were logged as Winston lines in Loki
  (`{service="api"} |= "user.erased"`), if the logs survived off the host.

Then erase each listed user again (admin `DELETE /users/{id}?hardDelete=true`) **before step 5**. If no source
survives, write it in the incident log, as the
[Art. 33 runbook](../understand/data-protection.md#breach-runbook-art-33-—-72-hours) already asks: the erasures that
could not be re-applied, and why.

### 2 · Uploaded images and the mail spool {#uploaded-images-and-the-mail-spool}

The dump covers the database only. Two named volumes hold durable state of their own: `uploads`
(uploaded images) and the `mail-spool/` directory of `storage` (queued outbound mail a restart must
not lose). A restore that skips them brings back rows pointing at files that no longer exist, so the
backup container mounts both read-only and backs them up as plain files.

**`storage/documents/` is deliberately left out.** It holds rendered invoice and credit-note PDFs, a
regenerable copy of the frozen rows: losing it costs a re-render, never data.

**Moving to a new host:** restore the files snapshot onto the new host's volumes before the new
stack's first boot (`restic restore latest --tag files --target <dir>`, then copy into the volumes).
Skipping this looks fine until a customer clicks a broken image or the reaper finds no mail queued
that a customer swears was sent.

## Read next

- [Backups](./backups.md)
