# Image pipeline: quarantined upload → digest → promote

Plan for turning every uploaded image into a **digested original** (metadata stripped, dimensions
capped, recompressed) plus a **thumbnail** the frontend can render in lists, without ever serving a
byte that has not been through both.

Status: **implemented on the backend** (steps 1–6 below). The frontend follow-up section at the
bottom is still outstanding — deliberately: it is gated on `sync:frontend`, which has not run yet.
Also outstanding: `npm run test:mutation:baseline` (the mutation score baseline will have shifted)
and a decision on whether the upload endpoints need a tighter rate limit than they have today (see
"Things that will bite").

---

## The problem

Today an upload is public the moment the request returns:

```
multer → staging (tmp)
  → validateUploadedImages    magic-byte check, PNG/JPEG/WebP only
  → storeUploadedImages       imageStore.put() moves it to public/images/<32hex>.<ext>
  → request.storedImageUrls   → controllers merge into `imageUrl`
```

Three things are wrong with that, and they are the reason this plan exists:

1. **Metadata is served.** A phone photo carries GPS coordinates, camera serial and capture
   timestamp. `express.static` hands all of it to anyone with the URL.
2. **The byte check is shallow.** `validateUploadedImages` reads 3–8 leading bytes. A file that is
   a valid PNG header plus an arbitrary payload in an ancillary chunk passes it. A full decode and
   re-encode is what actually throws that away.
3. **There is no thumbnail.** Every list view downloads full-size originals.

### The constraint that shapes everything

`src/app/static-assets.ts` serves `public/` with:

```ts
maxAge: '1y',
immutable: true,
```

`immutable` tells browsers and CDNs _the bytes at this URL will never change, do not even
revalidate_. There is no cache-bust available, because the URL **is** the persisted `imageUrl`.

That gives one rule the whole design follows:

> **Anything that mutates the original must happen before publication.
> Only work that produces a _new_ URL may happen after.**

An asynchronous digest that rewrites bytes in place violates it — anyone who fetched during the
window, starting with the person who just uploaded and whose own UI rendered the image immediately,
is pinned to the undigested version for a year.

---

## The chosen shape: quarantine

Nothing reaches `public/` until it has been digested **and** thumbnailed. Until then the record
holds a placeholder.

### Separate directory, not a temporary name

A temporary _name_ inside `public/images/` is still served — `express.static` does not know the name
is provisional, so safety would rest on nobody guessing a random filename. That is obscurity, not a
boundary.

A directory outside `NODE_PUBLIC_PATH` is enforced by the filesystem. It also makes the reaper safe
to write: _"everything here older than N days is garbage"_ can never hit a live file. This is what
upload-scanning pipelines do, and it is the standard worth copying.

### Not reusing the multer staging directory

`uploadStagingPath()` defaults to `os.tmpdir()`, documented as possibly a tmpfs and cleared by a
reboot. Staging lives _during_ a request; quarantine lives _between_ the request and the job and
must survive a restart, or a pending job wakes to a vanished file and the record is broken forever.

Three directories, three lifetimes:

| Path                       | Lifetime                | Durability                     | Served           |
| -------------------------- | ----------------------- | ------------------------------ | ---------------- |
| `NODE_UPLOAD_STAGING_PATH` | during the request      | ephemeral, tmp is fine         | no               |
| `NODE_QUARANTINE_PATH`     | until the job completes | **durable, outside `public/`** | no               |
| `NODE_PUBLIC_PATH`         | forever                 | durable                        | yes, `immutable` |

---

## The pipeline

```
POST /products  (multipart)
├─ multer                     → staging
├─ validateUploadedImages     → magic bytes                       (unchanged)
├─ quarantineUploadedImages   → imageStore.quarantine(staged) → key    [NOT public]
└─ controller
      imageUrl        = /images/system/pending.png
      thumbnailUrl    = /images/system/pending-thumb.webp
      pendingImageKey = key
      enqueue { collection, documentId, key }      ← or run inline when no broker
      201

worker.image.digest
├─ imageStore.readQuarantined(key)
├─ sharp: strip all metadata, cap dimensions, re-encode SAME format   → digested
├─ sharp: resize → WebP                                               → thumb
├─ imageStore.promote(key, digested)          → /images/<key>
├─ imageStore.putDerivative(key, thumb)       → /images/thumbs/v1/<stem>.webp
├─ conditional writeback: updateOne({ _id, pendingImageKey: key })
│     matched   → $set imageUrl + thumbnailUrl, $unset pendingImageKey
│     unmatched → stale job or deleted document → unlink both promoted files
└─ unlink the quarantine file, ack
```

### Failure modes map onto the existing consumer contract

`consumeFromQueue` already defines the policy; the worker just has to speak it.

| Situation                         | Return    | Effect                                                                  |
| --------------------------------- | --------- | ----------------------------------------------------------------------- |
| Payload names no key or no target | `false`   | dead-lettered to `worker.image.digest.dead`                             |
| Bytes will never decode           | `false`   | dead-lettered, quarantine file deleted, record stays on the placeholder |
| Disk full, Mongo down, transient  | **throw** | requeued                                                                |

---

## Design notes

### The digest re-encodes to the same format

`resolveUploadFilename` already picked the extension from the declared MIME type, and
`express.static` derives `Content-Type` from the extension. Converting a JPEG to WebP would serve
WebP bytes as `image/jpeg` — the exact class of mismatch the upload gates exist to remove.

The **thumbnail** lands at a new key, so it is free to be WebP.

### `thumbs/v1/`

Thumbnails inherit the `immutable, 1y` header. Changing quality settings later therefore needs a new
key segment, not a rewrite of existing files. Cheap insurance, added on day one.

### `pendingImageKey` earns its place twice

It is not bookkeeping.

1. **Concurrency.** Two uploads to the same document race. AMQP guarantees no ordering across
   redeliveries, so without a guard the older job can land last and the record keeps the wrong image
   permanently. A writeback conditional on the key means a stale job matches zero documents, cleans
   up after itself and acks.
2. **Observability.** _"Which records are stuck on the placeholder?"_ becomes a plain query. No
   separate status enum is needed, and the dead-letter queue says why.

It also covers document deletion mid-flight: the conditional update matches nothing, the promoted
files are unlinked, the job acks.

### Placeholders

`public/images/system/pending.png` and `public/images/system/pending-thumb.webp` — blank, committed,
overridable via `NODE_PENDING_IMAGE_URL` / `NODE_PENDING_THUMBNAIL_URL`.

The `system/` subdirectory gets deletion protection **for free**: `imageStore.remove()` already
refuses anything in a subdirectory of `images/`, the same guard that protects the committed
`images/seed/` fixtures.

Keep these distinct from `NODE_DEFAULT_IMAGE_PRODUCT` / `NODE_DEFAULT_IMAGE_USER` — _"processing"_
and _"never had an image"_ are different states and you will want to tell them apart.

### No-broker fallback

When `isQueueEnabled()` is false: digest synchronously in the request, promote, write the real URLs,
never touch the placeholder. Same shape as `enqueueEmail`, which sends inline when the broker is
absent.

Non-negotiable — this boilerplate must work with RabbitMQ off, and the contract will promise a
`thumbnailUrl`.

### The writeback problem

`infrastructure/adapters/image.worker.ts` may not import `src/modules/*`.

**Chosen:** extend `kernel/registry.ts`, whose docblock already states that a module declares
_"everything it needs the application to do for it in one object"_. Modules register an
`imageTargets` entry; the worker resolves by key. Typed, and a throw propagates so the job requeues.

Rejected:

- **The domain event bus** (`kernel/events.ts`) swallows handler throws by design, so a failed write
  would silently ack the job and lose the update.
- **A generic whitelisted `collection(name).updateOne`** in infrastructure works and is about fifteen
  lines, but hardcodes module collection names into infrastructure — adding a module would mean
  editing the layer that is supposed to know nothing about them.

### The job payload carries the store's key, never a filesystem path

`pdf.worker.ts` takes an `outputPath`. Do **not** copy that here. It would put a second url→path
translator outside `image-store.ts` and break the moment the store becomes S3. The payload carries
the opaque quarantine key and the worker calls back into the store.

---

## Library: sharp

Registry data, pulled 2026-08-30:

| Package              | Latest        | Published       | Weekly DL | Kind            | Verdict                                                           |
| -------------------- | ------------- | --------------- | --------- | --------------- | ----------------------------------------------------------------- |
| **sharp**            | 0.35.4        | **2026-08-26**  | **93.8M** | native, libvips | **Chosen.** Active RC cycle, releases every few weeks             |
| jimp                 | 1.6.1         | 2026-04-07      | 3.5M      | pure JS         | Maintained, but 1.6.0 → 1.6.1 was a 19-month gap. 27 sub-packages |
| @napi-rs/image       | 1.14.0        | 2026-06-26      | 114k      | native Rust     | Healthy and credible, but small surface and small user base       |
| @napi-rs/canvas      | 1.0.8         | 2026-08-24      | 22M       | native          | Very active, but a Canvas API, not an image pipeline              |
| image-js             | 1.7.0         | 2026-07-08      | 55k       | pure JS         | Scientific imaging focus, 21 runtime dependencies                 |
| canvas (node-canvas) | 3.2.3         | 2026-03-31      | —         | native, Cairo   | Wrong tool, heavier system dependencies than sharp                |
| @squoosh/lib         | 0.5.3         | **2023-01-03**  | —         | wasm            | Dead — archived by Google                                         |
| gm                   | 1.25.1        | 2025-02         | —         | shells out      | **Deprecated on npm**, needs an ImageMagick binary                |
| imagemin             | 9.0.1         | 2025-03         | —         | plugin host     | Build-pipeline tool, not a server-side resizer                    |
| exifr / piexifjs     | 7.1.3 / 1.0.6 | **2021 / 2019** | —         | metadata only   | Stale, and cannot resize anyway                                   |

sharp is the ecosystem default — Next.js image optimisation runs on it. It ships **25 prebuilt
platform packages**, so `npm install` needs no compiler on any realistic target:

```
linux x64/arm/arm64/riscv64/s390x/ppc64 · linuxmusl x64/arm64
darwin x64/arm64 · win32 x64/ia32/arm64 · wasm32 fallbacks
```

### What "native" means, and why it matters here

sharp is not JavaScript. It is a thin JS wrapper around **libvips**, a C image library, loaded into
Node through N-API as a compiled `.node` binary.

1. **One binary per platform.** That is what the `@img/sharp-*` optional dependencies are — npm
   installs only the match. Without one, npm falls back to compiling libvips from source, which
   needs python/make/g++ in the image.
2. **It does not block the event loop.** sharp hands work to libuv's threadpool and releases the V8
   isolate, so Node keeps serving requests while libvips crunches. A pure-JS resize freezes every
   other request for its duration.
3. **Its memory lives outside the V8 heap.** `--max-old-space-size` does not bound it and heap
   snapshots do not show it. This is the root of the Alpine caveat below.
4. **It cannot be bundled or run in edge runtimes.** Irrelevant here — this repo runs `tsx`/node
   directly.

### Bus factor

sharp is essentially one maintainer. That is a real risk, and it is why everything sharp-shaped stays
behind `adapters/image.ts` — swapping to `@napi-rs/image` becomes a one-file change rather than a
refactor.

---

## Files

### New

| File                                          | What                                                                                                               |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `src/infrastructure/adapters/image.ts`        | sharp wrapper — `digest()`, `thumbnail()`. The `pdf.ts` analogue, and the swap point if sharp ever needs replacing |
| `src/infrastructure/adapters/image.worker.ts` | Mirrors `pdf.worker.ts`: `Partial` payload, `false` → dead-letter, throw → requeue                                 |
| `scripts/backfill-image-thumbnails.ts`        | Idempotent; covers the committed `images/seed/` fixtures                                                           |
| `scripts/reap-quarantine.ts`                  | Unlink quarantine files past retention                                                                             |
| `public/images/system/pending.png`            | Blank placeholder, to be replaced                                                                                  |
| `public/images/system/pending-thumb.webp`     | Blank placeholder thumbnail, to be replaced                                                                        |
| `docs/tools/image-processing.md`              |                                                                                                                    |

### Contract

Follow the four-step order in `CLAUDE.md` → _Changing a contract_. Edit the fragments, never the root
bundles.

| File                                     | Change                                                  |
| ---------------------------------------- | ------------------------------------------------------- |
| `shared/contracts/asyncapi.workers.yaml` | `worker.image.digest` channel + `ImageDigestJobPayload` |
| `shared/contracts/openapi.root.yaml`     | `ThumbnailUrl` schema beside `ImageUrl`                 |
| `src/modules/products/openapi.yaml`      | `$ref` `ThumbnailUrl` into the response schemas         |
| `src/modules/users/openapi.yaml`         | idem                                                    |
| `src/modules/account/openapi.yaml`       | idem                                                    |

Then `npm run regenerate` — `contracts:bundle` → `gen:api` → `gen:asyncapi` → `docs:graph` →
`seed:export` → `sync:frontend`. `WORKER_CHANNELS.IMAGE_DIGEST` and the Zod schemas the models import
come out of that run.

### Infrastructure

| File                      | Change                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapters/image-store.ts` | `quarantine()`, `readQuarantined()`, `promote()`, `putDerivative()`. **`remove()` must delete the thumbnail too** — its current subdirectory guard silently exempts `thumbs/`, which would leak orphans forever |
| `adapters/storage.ts`     | `quarantineUploadedImages` replaces `storeUploadedImages` in `wrapUpload`                                                                                                                                       |
| `http/uploads.ts`         | `RequestImage` reshapes — `readUploadedImage` now yields a pending key, not a public URL                                                                                                                        |
| `adapters/queue.ts`       | `export const IMAGE_QUEUE = WORKER_CHANNELS.IMAGE_DIGEST`                                                                                                                                                       |
| `app/workers.ts`          | Register the consumer at `prefetch: 1`                                                                                                                                                                          |

### Modules

| File                                       | Change                                    |
| ------------------------------------------ | ----------------------------------------- |
| `kernel/registry.ts`                       | `imageTargets` on the module manifest     |
| `modules/products/model.ts`                | `thumbnailUrl`, `pendingImageKey`         |
| `modules/users/model.ts`                   | idem                                      |
| `modules/*/index.ts`                       | Register the image target in the manifest |
| `modules/users/controllers/write-users.ts` | `readUploadedImage` call site             |
| `modules/products/service.ts`              | idem                                      |
| `modules/account/services/profile.ts`      | idem                                      |

---

## Things that will bite

- **`npm run seed:export` must be re-run.** `thumbnailUrl` changes the exported shape and
  `check:seed-export` is in the `complete` gate. `npm run regenerate` covers it.
- **`sync:frontend`** — the paired frontend needs the new contract before its own `regenerate`.
- **Mutation baseline will shift** — `npm run test:mutation:baseline` afterwards.
- **`sharp` `limitInputPixels`.** A 5 MB PNG decodes to gigabytes. The default is 268 MP; set it
  explicitly (~50 MP) or the digest step _is_ the decompression bomb.
- **`sharp.concurrency(1)` and `sharp.cache(false)`.** `registerWorkers()` runs in every cluster fork
  (`src/app.ts:64`), so it is N forks × threadpools × libvips cache.
- **Alpine / musl memory fragmentation.** The base image is `node:25-alpine`
  (`.docker/Dockerfile:3`), so musl. `@img/sharp-linuxmusl-x64` and `-arm64` both exist, so it
  installs cleanly, but sharp's own documentation flags fragmentation under musl's default allocator
  for long-running processes. Verify under a `k6` run before shipping. The fixes are jemalloc or a
  glibc base for the runtime stage.
- **Remote and default images get no thumbnail.** `readUploadedImage` merges a body-supplied
  `imageUrl` when no file was uploaded; those are somebody else's URLs. `thumbnailUrl` stays absent
  and the frontend falls back to the full image.
- **Upload endpoints should sit under a tighter rate limit** than the general one — image processing
  is CPU-bound and a burst is a cheap way to saturate it. Verify what
  `http/middlewares/rate-limit.ts` currently applies to the upload routes.

---

## Tests

The load-bearing one goes in `tests/integration/upload-security.test.ts`:

> Upload a JPEG carrying GPS EXIF → assert the quarantine path is not fetchable → run the job →
> assert the promoted file has no EXIF.

sharp can _write_ EXIF (`withExif`), so the fixture is built in-test. No binary committed.

| File                                                      | Covers                                                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `tests/unit/infrastructure/adapters/image.test.ts`        | digest strips metadata, caps dimensions, keeps format; thumbnail dimensions/format/size          |
| `tests/unit/infrastructure/adapters/image-store.test.ts`  | quarantine isolation, promote, traversal guards on the thumbs path, `remove` deleting both files |
| `tests/unit/infrastructure/http/uploads.test.ts`          | nothing reaches `public/` before the job runs                                                    |
| `tests/unit/infrastructure/adapters/image.worker.test.ts` | mirrors the pdf worker test: invalid payload → `false`, render failure → throws                  |
| — stale-job case                                          | conditional writeback no-ops, promoted files cleaned up, job acks                                |
| contract tests                                            | the new response field                                                                           |

---

## Sequencing

1. **`image.ts` + sharp**, with tests — provable in isolation, no user-visible change.
2. **`image-store.ts`** quarantine / promote / derivative, plus the `remove()` fix.
3. **Contract + `npm run regenerate`** — unblocks the models and the frontend.
4. **Models, registry, controllers, placeholders.**
5. **Worker + queue + inline fallback.**
6. **Backfill, reaper, docs.**

Steps 1–2 are independently useful and change nothing user-visible, so they are safe to merge alone.

---

## Rejected alternatives

| Approach                                       | Why not                                                                                                                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Digest inline, thumbnail queued**            | Was the first recommendation. Sound, and cheaper to build — but it publishes the digested original immediately, so a broker outage still leaves records with no thumbnail. Quarantine gives one uniform state machine instead of two half-states |
| **Both queued, publishing raw first**          | The EXIF exposure window stays open, and rewriting bytes at an `immutable, 1y` URL pins clients to the undigested version for a year                                                                                                             |
| **Both queued, new key on digest**             | Sidesteps `immutable` cleanly, but the EXIF window stays and the URL changes under any client already holding it                                                                                                                                 |
| **`thumbnailUrl` derived at serialization**    | Zero schema change and retroactive for every existing row, but it 404s until the job finishes and the database would name files that may not exist                                                                                               |
| **Temporary filename inside `public/images/`** | Still served. Security by obscurity for undigested, unvalidated content                                                                                                                                                                          |

---

## Frontend follow-up (boilerplate-vue-frontend)

Deferred until this plan actually ships and `sync:frontend` carries the new `ThumbnailUrl` schema
across — recorded now so it is not rediscovered from scratch. **This is a mismatch, not a
formality**: the frontend's thumbnail code was written against a different shape than the one this
plan produces, and it will not "just work" once the contract syncs.

### What the frontend currently assumes

`src/infrastructure/utils/images.ts` → `thumbnailImageUrl(source, width)` assumes a **query-param
resize of the SAME URL** — `?w=64` appended to `imageUrl`, gated behind `VITE_IMAGE_THUMBNAIL_PARAM`
(unset today, so the function always returns `undefined` and `LazyImage.vue` degrades to a plain
lazy full-size image). That shape matches imgproxy/thumbor/a resize middleware — it does **not**
match this plan, which promotes the thumbnail to its **own key at a distinct path**
(`/images/thumbs/v1/<stem>.webp`, a separate `thumbnailUrl` field entirely). The frontend function's
own docstring already calls this out: _"a backend that instead serves variants at distinct PATHS
would need this function rewritten, and that is the intended place to do it."_ That is this plan.

### What has to change there, once the contract carries `thumbnailUrl`

1. **`thumbnailImageUrl()` gets rewritten** from `(source, width) → query-string URL` to something
   that reads the record's own `thumbnailUrl` field and resolves it — the same
   `resolveImageUrl()` prefixing `imageUrl` already needs, since `/images/thumbs/v1/…` is API-relative
   too. Realistically this collapses into `resolveImageUrl(record.thumbnailUrl)` at each call site
   rather than staying a `images.ts` export in its current shape.
2. **`LazyImage.vue`'s prop surface changes.** It currently derives the thumbnail from `src` + `width`
   internally; it will need a second source prop (e.g. `thumbnailSrc`) passed in by the caller,
   because the two URLs are no longer derivable from one another.
3. **Every call site needs the new field threaded through**, not just `imageUrl`:
   `ProductsList.vue` / `UsersList.vue` (the list columns), `Product.vue` / `User.vue` (via
   `ItemDetailHero`), and the account nav avatar (`SessionViewer` in
   `src/infrastructure/stores/session.ts`, currently `{ id, email, admin, imageUrl }` — would need
   `thumbnailUrl` too if the avatar is meant to load a thumbnail rather than the full image).
4. **`VITE_IMAGE_THUMBNAIL_PARAM` becomes dead** — it is the query-param-resize env switch this
   plan supersedes. Remove it from `.env-example` and `.env` rather than leaving an inert setting
   nobody can turn on.
5. **The pending-image placeholder is separate from the frontend's own "no image" placeholder** and
   needs no frontend change: `imageUrl = /images/system/pending.png` is a real, fetchable URL for
   the duration of the digest job, so `LazyImage` renders it as an ordinary photo, not as its own
   `placeholderImageUrl()` stand-in (`public/images/no-image-placeholder.svg` — bundled locally,
   not a third-party fetch). The two placeholders don't need to agree with each other or be swapped
   in sync; they answer different questions ("processing" vs. "never had an image").

### Sequencing

Do not start the frontend side until this plan's own **Sequencing** section reaches step 3
(contract + `npm run regenerate`) — the frontend has nothing real to build against before then, and
`sync:frontend` is what hands it the new schema. This is intentionally the last cross-repo piece of
the image work, not a parallel track.
