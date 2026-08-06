# TODO

Deliberate deferrals. Each entry says what is true today, why it is acceptable for now, and
what would have to change — so picking one up does not start with re-deriving the reasoning.

## `npm run test:mutation` leaks ~200 MB of `/tmp` per killed worker

**Today.** Every test file that calls `setupTestDb()` starts a `mongodb-memory-server`, whose
data directory is `os.tmpdir()/mongo-mem-<random>` — about 201 MB each. The server removes it on
a graceful shutdown, and a normal `npm test` therefore leaves nothing behind. Stryker does not
shut its runners down gracefully: it kills a jest worker per timed-out mutant and at the end of
each run, so every kill strands one directory.

**Why it matters.** It is silent until it is not. A mutation run filled a 16 GB `/tmp` tmpfs
here, at which point _everything_ on the machine that writes to `/tmp` starts failing with
ENOSPC — including tools with nothing to do with this project.

**Cleanup, until it is fixed:**

```
pkill -x mongod
find /tmp -maxdepth 1 -name 'mongo-mem-*' -type d -exec rm -rf {} +
```

(Match `mongod` with `pkill -x`, not `pkill -f` — an `-f` pattern also matches the shell running
the command, which then kills itself before reaching the `find`.)

**What to do.** Prune stale directories from a jest `globalSetup`, which runs once per jest
instance rather than once per worker. The catch worth designing around: Stryker runs several
jest instances concurrently, so an unconditional prune can delete a _live_ sibling's data
directory mid-run. Filter by age (`mtime` older than an hour) so only genuinely stranded
directories match. Setting `MONGOMS_DOWNLOAD_DIR` does not help — that is the binary cache, not
the per-instance data directory.

## Move uploaded images to object storage / CDN

**Today.** An uploaded image is written to the local `public/` directory by
`@core/adapters/storage`, and `resolveImageUrl` (`src/core/http/uploads.ts`) strips the public
prefix before persisting: `public/images/x.png` → `/images/x.png`. That server-relative path is
what lands in `imageUrl` on the user and product documents, and what the API returns.

**Why relative and not absolute.** Saving `https://<current-host>/images/x.png` would bake the
deployment's hostname into every row: a domain change, a move behind a different proxy, or
running the same dataset in staging would leave stale absolute URLs pointing at the wrong
server — a data migration to fix something that is not data. The contract says
`format: uri-reference` (`components/schemas/ImageUrl` in `openapi.yaml`) precisely so both an
absolute URL and a server-relative path are legal values, which is what the field actually
holds: uploads produce a path, the schema defaults (`NODE_DEFAULT_IMAGE_USER` /
`NODE_DEFAULT_IMAGE_PRODUCT`) are absolute URLs. Clients prefix the API base URL at render time.

**What is wrong with it.** The files live on the container's filesystem, so they are lost on a
rebuild unless the directory is a mounted volume, they are not shared between replicas, and
they are served by the Node process rather than by something built for static bytes.

**What to do.** Write uploads to object storage (S3-compatible bucket, or a CDN-fronted bucket)
and store the returned URL. `@core/adapters/storage` is the seam — it is the only module that
decides where a file lands, so the write side is one adapter swap.

**What must not break.** `imageUrl` becomes absolute for new uploads while existing rows stay
relative, so both forms have to keep working:

- `format: uri-reference` already permits both. Do NOT tighten it back to `uri` until every
  legacy row is migrated.
- Anything that concatenates a base URL onto `imageUrl` must skip that when the value already
  has a scheme, or it will produce `https://cdn.example.com/https://cdn.example.com/x.png`.
- `productService.remove` (hard delete) and the `deleteUpload` paths in the write controllers
  delete by filesystem path (`NODE_PUBLIC_PATH + imageUrl`). Those become bucket deletes.
