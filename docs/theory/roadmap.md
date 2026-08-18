# Roadmap

What is planned but not built — capabilities this boilerplate does not have yet, as opposed to debt
in what it already does.

The paired frontend keeps [its own](https://github.com/Guebbit/boilerplate-vue-frontend) at
`docs/theory/roadmap.md`. The two are separate: a roadmap is a property of a codebase, not of the
pair.

::: tip A roadmap that lists finished work stops being read
Anything here that ships should be **deleted** from this page rather than annotated as done. The
git history is where history lives.
:::

---

## Durable image storage

**Today: uploads do not outlive the container.**

`src/infrastructure/adapters/image-store.ts` writes uploads to the container's own filesystem.
Rebuild or remove the container and every uploaded image goes with it — `docker compose down -v`, a
redeploy, a moved host. Only `public/images/seed/` survives, because those are committed. Nothing
else is backed up, and two replicas do not share what they store: an image uploaded to one is a 404
on the other.

A bind-mounted volume is the stopgap. It works, and it pins the deployment to one disk.

The fix is a second object with the two methods of `ImageStore` — any S3-compatible bucket, or a
personal CDN. Nothing is wired to select one yet, **on purpose**: a switch that selects a backend
nobody has written is how you get a half-migrated deployment.

### When you write it

- **`put(stagedPath)`** uploads under `images/<basename>` with the right `Content-Type` (derive it
  from the extension — `extensionForImage` in `adapters/image-signatures` is that mapping, read
  backwards), deletes the staged file, and returns the object's public url.

    That return value is a **url prefix change**: rows written from then on hold an absolute url
    while every existing row holds `/images/x.png`. Both are legal — `ImageUrl` in `openapi.yaml` is
    `uri-reference` precisely so both validate — and both must keep working, which is why
    `express.static` and the local `remove` stay whatever else changes.

- **`remove(imageUrl)`** deletes the object when the url is one of ours, and hands a server-relative
  url to `filesystemImageStore` instead: those are the legacy rows, and their files are still on
  disk. Anything else — an unrelated absolute url, a default image — stays a no-op.

- **Anything concatenating a base url onto `imageUrl`** (a client renderer, a template, an email)
  has to skip that when the value already carries a scheme, or it produces
  `https://cdn.example.com/https://cdn.example.com/x.png`.

- **Decide up front what cleans up an object whose database write then failed.** Locally the failure
  path deletes it; remotely that same call is a network round trip that can itself fail, so the
  durable answer is a lifecycle rule or a reaper job.

### Why a CDN url may be absolute when the local one deliberately is not

Saving `https://<current-host>/images/x.png` would bake the deployment's own hostname into every
row, so a domain change, a different proxy or a staging copy of the data would strand them all — a
migration to fix something that is not data. A CDN base url is chosen deliberately and does not move
when the API does, which is what makes it safe to persist.

---

## Related pages

- [Architecture](./architecture.md) — the tiers this would slot into
- [Layers](./layers.md) — where an adapter lives and why
- [Mutation testing](../tools/mutation-testing.md) — the measurement backlog, including the one
  open decision about `break`
