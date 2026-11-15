---
type: task
audience: [operator]
---

# The restore drill

Prove a backup restores, on the real deployment, against the real repository.

## Before you start

- A stack that has taken at least one backup ([Backups](./backups.md)).
- The `restore-drill` profile available in `docker-compose.production.yml`.

## Steps

### 1 · The restore drill

One command, on the real deployment, against the real repository:

```bash
docker compose --env-file "clients/$COMPOSE_PROJECT_NAME/.env" -f docker-compose.production.yml \
    --profile restore-drill run --rm restore-drill
```

It starts a **throwaway** Mongo (`restore-drill-db`: a plain instance on a tmpfs, no auth, no published
port, gone afterwards) and never touches the live database. Then, in order:

1. Restores the latest `db` snapshot into it (`mongorestore --oplogReplay`).
2. Counts every collection in the restored copy and compares it with the counts saved at backup time.
   A live dump window moves a count a little (the oplog replay lands later writes), so a collection may
   drift by up to `max(5, 1%)`; a missing or emptied collection always fails.
3. Restores the latest `files` snapshot and verifies every byte (`restic restore --verify`).
4. `restic check --read-data-subset=10%` on the repository.
5. Prints how long it took: **that is how long the shop is down on a bad day**, plus your own reaction time.

```
ok       `api.orders` 4000
ok       `api.products` 4000
ok       `api.users` 4100
5 collections match, 0 do not
... [backup] DRILL PASSED: restore and verification took 6s.
```

Exit code 0 only when every step passed. Knobs: `DRILL_CHECK_SUBSET` (default `10%`) and
`DRILL_RESTORE_FILES` (default `true`; the files land in a 1 GB tmpfs, raise it for large uploads).
Point `BACKUP_REPOSITORY` at the second machine's `rest:` URL to drill the off-site copy.

**Run it quarterly**, and after any change to the backup settings. With more than a handful of clients,
rotate which one gets drilled rather than testing all of them every time.
On the real deployment, the first drill is the production readiness check for backups: this command, once, before launch.

#### CI proves it on every change

The `backup-drill` job (`npm run backup:drill`, which anyone with Docker can run, `docker/backup/drill.sh`)
builds the backup image and then, on one private network with no published port:

| Step                                                               | What it proves                                                                                                         |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| a replica-set Mongo, started as the compose file starts `database` | `docker/mongo-init.js` really creates the `backup` account, and the role can run `mongodump --oplog`                   |
| back up, change 2.5%, back up, back up again                       | the second run after a small change stores a chunk or two; the third, with nothing changed, stores nothing             |
| the restore drill                                                  | dump, counts, files and `restic check` all pass                                                                        |
| a Gatus container as the heartbeat                                 | a good run pings green, a failed run (wrong database user) pings red                                                   |
| an every-minute schedule, and an empty repository                  | the scheduler really runs the job, and a dormant container idles healthy                                               |
| a repository with a data file deleted                              | the drill **fails**: it can say no                                                                                     |
| the second machine's append-only server                            | a backup is accepted, `forget` is **refused** (403), the upkeep prunes on its own disk, and the drill restores from it |

Backup **and** restore are tested end to end, not just the config.

## Read next

- [Backups](./backups.md)
