# MongoDB Database Tools

## What it is

The [Database Tools](https://www.mongodb.com/docs/database-tools/) are MongoDB's own command-line
programs. The [`backup` container](./backups.md) uses two: `mongodump` (read the database into a
stream) and `mongorestore` (write a stream back).

| Fact        | Value                                                                                         |
| ----------- | --------------------------------------------------------------------------------------------- |
| Licence     | Apache-2.0                                                                                    |
| Pinned      | 100.19.1, the Ubuntu 24.04 build (amd64 and arm64), in `docker/Dockerfile.backup`, by SHA-256 |
| Maintenance | MongoDB's, released alongside the server; one version line for every supported server         |

## Why it was chosen

- **The official tool.** It speaks the server's protocol, understands replica sets, and is the dump
  format every MongoDB restore guide assumes.
- **`--oplog`.** The only way to a dump consistent across collections while writes continue.
- **Least privilege.** Works with the built-in `backup` role: the container can read what a dump needs
  and can neither write nor delete.

## Things worth knowing

| Detail                                      | Why it matters                                                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The tools spell TLS `--ssl` / `--sslCAFile` | `mongosh` spells it `--tls`; the Database Tools 100.x do not accept that spelling                                              |
| `--oplog` needs a full dump                 | "`--oplog mode only supported on full dumps`": no `--db`. A restore with `--oplogReplay` cannot be combined with `--nsInclude` |
| The log is the count                        | `done dumping api.users (4100 documents)` is how [the backup](./backups.md#one-run) records per-collection counts              |
| Passwords go in a `--config` file           | a flag shows in `ps` and `/proc/*/cmdline`                                                                                     |

## External references

- [mongodump](https://www.mongodb.com/docs/database-tools/mongodump/)
- [mongorestore](https://www.mongodb.com/docs/database-tools/mongorestore/)
- [Built-in roles: backup](https://www.mongodb.com/docs/manual/reference/built-in-roles/#backup)
