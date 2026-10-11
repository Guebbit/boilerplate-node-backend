# rclone

## What it is

[rclone](https://rclone.org) is a command-line tool for moving files between storage systems. This
repo uses exactly one command: [`rclone serve restic`](https://rclone.org/commands/rclone_serve_restic/),
which speaks restic's REST protocol over a folder on disk. It is the server half of the
[Backup server](./backup-server.md).

| Fact        | Value                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| Licence     | MIT                                                                          |
| Pinned      | 1.75.2 (released 2026-10-09), the `docker.io/rclone/rclone` image, by digest |
| Maintenance | very active: frequent releases, a large contributor base                     |

## Why it was chosen

- **restic's own server is stale.** `rest-server`, restic's reference implementation, was last released
  2025-05, past the 12-month maintenance rule in [Dependency Vetting](./dependency-vetting.md).
  `rclone serve restic` serves the same protocol.
- **Append-only built in.** `--append-only` accepts new files and refuses deletes; `--private-repos`
  confines each user to the folder named like them; `--htpasswd` takes bcrypt; `--cert` and `--key`
  add TLS.
- **No lock-in.** The repository format is restic's, documented, and has an independent compatible
  implementation (rustic). Swapping the server never touches the data.

## What it is used for here, and not

| Used                                                     | Not used                                    |
| -------------------------------------------------------- | ------------------------------------------- |
| `serve restic /data/repos --append-only --private-repos` | rclone's own sync, mount and crypt backends |

## External references

- [rclone serve restic](https://rclone.org/commands/rclone_serve_restic/)
- [restic: REST server protocol](https://restic.readthedocs.io/en/stable/REST_backend.html)
