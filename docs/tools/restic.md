# restic

## What it is

[restic](https://restic.net) is the backup program behind the [`backup` container](./backups.md): one
static binary that writes **encrypted, deduplicated snapshots** to a repository.

| Fact        | Value                                                                                                 |
| ----------- | ----------------------------------------------------------------------------------------------------- |
| Licence     | BSD-2-Clause                                                                                          |
| Pinned      | 0.19.1 (released 2026-07-05), in `docker/Dockerfile.backup`, by SHA-256 per architecture              |
| Maintenance | the largest community of the options, a steady release cadence                                        |
| Reads from  | stdin or files; writes to a local disk, SFTP, S3-compatible storage, B2, Azure, GCS, or a REST server |

## Why it was chosen

- **Encrypted on the client.** The repository holds ciphertext; the storage, and the server in front of
  it, never see plaintext. The password is a compose secret in the backup container only.
- **Deduplicating.** Identical data is stored once, so backing up hourly costs what _changed_. This is
  why the dump is streamed raw and never gzipped first.
- **Provider-neutral.** The same command writes to any backend; where it goes is the operator's choice.
- **Native building blocks.** `--stdin-from-command` (run the dump and refuse the snapshot if it fails),
  `--retry-lock`, `RESTIC_*` variables: enough that the repository's own scripts stay short, which is why
  resticprofile is not used.

## What it does not do

- **No append-only mode of its own.** Tamper resistance comes from the server in front of the
  repository, not from restic: [Backup server](./backup-server.md).
- **No point-in-time recovery.** A snapshot is the state at the end of one dump.
- **No size cap.** The keep knobs bound the number of snapshots; a hard cap is the storage's quota.

## Where it runs

| Where              | Command                                                        |
| ------------------ | -------------------------------------------------------------- |
| `backup` container | `restic backup`, `forget`, `prune`, `check`, `init`            |
| the second machine | `restic forget --prune`, `check`, on the repository's own disk |

## External references

- [restic documentation](https://restic.readthedocs.io/en/stable/)
- [Scripting and exit codes](https://restic.readthedocs.io/en/stable/075_scripting.html)
- [Removing snapshots: forget and prune](https://restic.readthedocs.io/en/stable/060_forget.html)
