# TODO

Deliberate deferrals. Each entry says what is true today, why it is acceptable for now, and
what would have to change — so picking one up does not start with re-deriving the reasoning.

## Implement the remote image store (personal CDN, or any S3-compatible bucket)

**Today.** Uploads are staged in a private directory (`NODE_UPLOAD_STAGING_PATH`, defaulting under
the system temp directory), checked, and then committed to an image store by
`storeUploadedImages`. The only store that exists writes to `NODE_PUBLIC_PATH/images/` and returns
the server-relative `/images/x.png` that `express.static` serves — which is exactly what this API
has always stored, and stays the default.

**What is already done.** The seam, and everything that had to change around it:

- `@core/adapters/image-store` is the single place that knows where bytes live. Nothing else may
  turn an `imageUrl` into a path (see the header of that file for why that rule is load-bearing).
- `put(stagedPath) → url` and `remove(imageUrl)` are the whole interface. Both are implemented for
  local disk; a second implementation of the same two methods is the remaining work.
- Setting `NODE_IMAGE_STORE_BUCKET` already selects the remote store, and the app refuses to boot
  until one exists (`assertImageStoreReady`, called from `validateRequiredEnvironment`).
- Staging exists precisely so `put` receives a finished file: a bucket cannot be written to as the
  bytes stream in.

**What is left.** `remoteImageStore` in `src/core/adapters/image-store.ts`, where the TODO comment
spells out both methods, the key layout, the content type, and the SDK-versus-hand-signing trade.
Roughly: `put` uploads `images/<basename>` and returns
`${NODE_IMAGE_STORE_PUBLIC_URL}/images/<basename>`; `remove` deletes when the url is one of ours
and delegates to the filesystem store when it is a legacy server-relative one.

**Why it is worth doing.** Local files are lost on a container rebuild unless the directory is a
mounted volume, are not shared between replicas, and are served by the Node process rather than by
something built for static bytes.

**Why stored URLs are relative today.** Saving `https://<current-host>/images/x.png` would bake the
deployment's hostname into every row: a domain change, a move behind a different proxy, or running
the same dataset in staging would leave stale absolute URLs pointing at the wrong server — a data
migration to fix something that is not data. A CDN base URL is different in kind: it is chosen
deliberately and does not change when the API moves, which is why the remote store is allowed to
store an absolute one.

**What must not break.** `imageUrl` becomes absolute for new uploads while existing rows stay
relative, so both forms have to keep working:

- `format: uri-reference` (`components/schemas/ImageUrl` in `openapi.yaml`) already permits both.
  Do NOT tighten it back to `uri` until every legacy row is migrated.
- Anything that concatenates a base URL onto `imageUrl` must skip that when the value already has a
  scheme, or it will produce `https://cdn.example.com/https://cdn.example.com/x.png`.
- `express.static` and the local branch of `imageStore.remove` must stay whatever else changes:
  they are what keeps legacy rows readable and deletable.

**Decide before writing it.** An upload that succeeds and a database write that then fails leaves an
orphaned object. Locally the failure path deletes it; against a bucket that same call is a network
round trip that can itself fail. The durable answer is a lifecycle rule or a reaper job — pick one
deliberately rather than discovering it as a storage bill.
