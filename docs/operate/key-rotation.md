---
type: task
audience: [operator]
---

# Rotate keys and credentials

The steps to replace a signing key, an encryption key or a database password. None of them is automated: each is a `mongosh` command or an env-var edit plus a deploy.
How the rings work: [Security: key and credential rotation](../understand/security-rotation.md).

## Signing keys

1. Prepend the new secret to `NODE_TOKEN_ACCESS` and `NODE_TOKEN_REFRESH` (`new-secret,old-secret`), then deploy.
2. Wait out the longest refresh window in play (`NODE_SESSION_TIME_LONG`, 30 days by default), or force
   `logout-all` for every account instead of waiting.
3. Drop the old secret and deploy again. Skipping the wait logs out every session still signed with the entry you remove.

## Database and backup credentials

Three separate secrets, three procedures.

**`mongo_app_password` / `mongo_root_password`** (files under `clients/<name>/secrets/`).
`docker/mongo-init.js` only runs against an empty data directory, so editing the file alone does
nothing to an existing volume.

1. Change the password inside Mongo:

    ```bash
    docker compose --env-file "clients/<name>/.env" -f compose.yaml -f compose.production.yaml \
      exec database mongosh -u "$MONGO_ROOT_USER" -p --authenticationDatabase admin --eval '
        db.getSiblingDB("<MONGO_DB>").updateUser("<MONGO_APP_USER>", { pwd: "<new password>" })
      '
    ```

2. Write the new value into the secret file.
3. Recreate the services that mount it: the running `app`/`worker`/`cron` containers keep the old
   password in memory until they restart.

`mongo_root_password` is the same against the `admin` database:
`db.getSiblingDB("admin").updateUser("<MONGO_ROOT_USER>", ...)`.

**`mongo_backup_password`** (the `backup` role's login, used only by the `backup` container):

1. `db.getSiblingDB("admin").updateUser("backup", { pwd: "<new password>" })`.
2. Rewrite the file.
3. Recreate `backup`.

**`restic_password`** encrypts every existing snapshot, so changing the file alone locks the repository:

1. `restic key add` the new key.
2. Switch the file.
3. `restic key remove` the old one ([Backups](./backups.md)).

## Encryption keys

Each of the three keys rotates the same way (`NODE_TOTP_ENCRYPTION_KEY` shown). How the ring works: [Encryption-key rings](../understand/security-rotation.md#encryption-key-rings).

1. Prepend the new secret, keep the old one: `NODE_TOTP_ENCRYPTION_KEY=v2:<new>,v1:<old>`. Deploy —
   every new TOTP enrollment and every delivered-code HMAC now uses `v2`; every row still stamped
   `v1` keeps decrypting against the entry that wrote it.
2. Re-encrypt existing rows onto the new key: `npm run reencrypt`. In a deployed container, which
   has no npm, run it from `/app` as `node --import tsx scripts/ops/reencrypt.ts` (same flags). Nothing re-encrypts a row lazily:
   only a fresh write of that same field or this script moves it, so skipping it leaves `v1` rows
   that the next step would strand. `npm run reencrypt -- --dry-run` writes nothing and prints, per
   field, how many values sit on each key version. Batched, and safe to repeat: a value already on
   `v2` is not touched, so a second run writes nothing. Each owning module declares its own walk
   on its manifest (`reencrypt` in `module.ts`: address books, user phones, order and invoice
   addresses and notes, order staff notes, TOTP secrets, webhook secrets); `scripts/ops/reencrypt.ts` runs every
   enabled module's, so it names none. Not scheduled: a rotation is an event, not a cadence.
   Until it finishes, both entries must stay in the ring.
3. Once `npm run reencrypt -- --dry-run` reports nothing on `v1`, drop it from the ring and deploy
   again. A row still stamped with a dropped version fails loudly (`Unknown TOTP key version: v1`)
   rather than reading as garbage.

## Read next

- [Security: key and credential rotation](../understand/security-rotation.md): how the rings work.
- [Backups](./backups.md): `restic_password`, and what a key change does to the snapshots.
