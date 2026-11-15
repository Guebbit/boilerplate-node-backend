# Backup server

The second machine: where every client's [backups](./backups.md) land, and the **only** place old
snapshots are deleted. It ships as `docker-compose.backup-server.yml`, **dormant** until someone
starts it on a machine of their own. Nothing in a client stack points at it until that client sets
`BACKUP_REPOSITORY=rest:https://<host>:8000/<client>/`.

## The threat it answers

| Threat                                                                                                             | What stops it                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| The machine, its disk or its provider dies                                                                         | the copy is on another machine (the "1 off-site" of 3-2-1)                                                         |
| An attacker owns the app server, finds the restic password there, deletes every backup, then encrypts the database | the server is **append-only**: it accepts new backups and refuses deletes. The password alone cannot erase history |

Encryption does not help against the second threat: the attacker has the key. Refusing the delete
is the control. restic has no append-only mode of its own; it is the **server** that says no.

```mermaid
flowchart LR
    App["client stack<br/>backup container"] -->|"HTTPS, one user per client<br/>add only"| Srv["second machine<br/>rclone serve restic --append-only"]
    Srv --> Disk[("/data/repos/&lt;client&gt;<br/>restic repositories")]
    Up["maintenance container<br/>weekly forget --prune + check"] --> Disk
    Up -->|"ping"| G["Gatus"]

    classDef proc fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef store fill:#dcfce7,stroke:#16a34a,color:#111827;
    class App,Srv,Up proc;
    class Disk store;
```

## What is in the kit

| Service       | What                                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `init`        | runs once as root with one capability: creates `/data/repos` and hands it to uid 1000                                                                                  |
| `rest`        | [`rclone serve restic`](./rclone.md) with `--append-only --private-repos`, TLS 1.2+ and an htpasswd file. The only published port (default 8000)                       |
| `maintenance` | the [backup image](./restic.md) in server mode: weekly `restic forget --prune` and `restic check` on every client's repository, on the disk, where deletes are allowed |

`--private-repos` ties each user to the folder of the same name: `acme` reaches `/acme/` and nothing
else. One server holds many clients, each with its own repository path and its own password.

Both long-running services are read-only, drop every capability and run as uid 1000. No Docker socket.

## Set it up

On the second machine, any host that runs Docker or Podman. Provider-neutral: pick the host yourself
([Hosting](./hosting.md)).

```bash
# 1. the repo's two files, and a directory for the kit's secrets (gitignored)
git clone <this repository> backup-kit && cd backup-kit
mkdir -p -m 0700 backup-server/clients/acme

# 2. TLS: any certificate the clients trust (Let's Encrypt works; so does your own CA)
cp /path/to/fullchain.pem backup-server/tls.crt
cp /path/to/privkey.pem   backup-server/tls.key

# 3. one login per client. bcrypt is recommended; this prints the htpasswd line.
docker run --rm httpd:2.4-alpine htpasswd -nbB acme 'A_LONG_RANDOM_PASSWORD' >> backup-server/htpasswd

# 4. the client's restic password, for the weekly prune (the same value as on the client)
cp /path/from/client/restic_password backup-server/clients/acme/password
chmod -R a+rX backup-server

# 5. this stack's own knobs (.env next to the compose file): see .env-example, "backup-server"
docker compose -f docker-compose.backup-server.yml up -d --build
```

Then, on the **client**:

```bash
# clients/acme/.env
BACKUP_REPOSITORY=rest:https://backups.example.com:8000/acme/
BACKUP_PRUNE=false                 # the server refuses deletes; it prunes on its own schedule

# clients/acme/secrets/restic_repository_env  (the login from step 3)
RESTIC_REST_USERNAME=acme
RESTIC_REST_PASSWORD=A_LONG_RANDOM_PASSWORD
```

`BACKUP_PRUNE=false` is the one line that matters. Left `true`, the first run's `forget` is
**refused**, the run goes red and the heartbeat alerts: loud on day one, one line to fix.

### Adding a client

Repeat steps 3 and 4 with the new name, restart `rest` so it re-reads the htpasswd file
(`docker compose -f docker-compose.backup-server.yml restart rest`). The repository itself is created
by the client's first run.

### Certificates

The clients verify the server's certificate with the system CA store. A certificate from your own
CA needs that CA inside the client's backup container (a mounted bundle and `RESTIC_CACERT`, added
in a compose override file). A public CA needs nothing.

## The upkeep

`maintenance` runs on `BACKUP_SERVER_SCHEDULE` (default Sunday 04:00 UTC), for each folder under
`/data/repos` that has a matching `clients/<name>/password`:

1. `restic forget --group-by host,paths --prune` with the `BACKUP_KEEP_*` knobs (24 / 7 / 4 / 6 by default),
2. `restic check --read-data-subset=5%` (`BACKUP_CHECK_SUBSET`).

One failing client never skips the others. With `BACKUP_HEARTBEAT_URL` set (a Gatus external endpoint,
[the same shape as the clients'](./backups.md#the-heartbeat)) the run pings green or red, so a
maintenance that stopped is an alert too.

### What the maintenance password means

`prune` and `check` need the repository password, so **the second machine holds every client's restic
password** for the weekly job. The `rest` service never sees it, and the append-only guarantee holds
against an attacker who owns a client. But anyone who owns the second machine can read the backups.
Treat it as inside the trust boundary: its own host, its own SSH keys, nothing else running on it.

If that is too much, restic repositories take several keys: `restic key add` gives the second machine a
password of its own, which you can revoke without touching the client's.

## Restoring from it

The [restore drill](./backups.md#the-restore-drill) reads any repository, so the second machine is just
a `BACKUP_REPOSITORY`: run the drill with the `rest:` URL to prove the off-site copy restores. By hand,
from any machine with restic and the client's password:

```bash
export RESTIC_REPOSITORY=rest:https://acme:PASSWORD@backups.example.com:8000/acme/
export RESTIC_PASSWORD_FILE=./restic_password
restic snapshots                         # find the snapshot
restic dump <db snapshot> mongodump.archive | mongorestore --archive --oplogReplay ...
```

The runbook, including re-applying erasures, is [Restoring](./backups.md#restoring).

## What it does not cover

- **An attacker who owns the second machine.** They can read the data (see above) and delete the disk.
  A third copy on another provider is the answer to that, and an operator's call.
- **Size.** The server has no quota of its own: size the disk for `BACKUP_KEEP_*` times what changes, and
  alert on it (`node_exporter` on that machine, or your provider's).

## Related pages

- [Backups](./backups.md): the client side, the knobs, the drill
- [rclone](./rclone.md): the server software
- [Gatus](./gatus.md): the off-host heartbeat service
- [Hosting](./hosting.md)
