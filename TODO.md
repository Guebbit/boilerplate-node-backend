# TODO

Deliberate deferrals. Each entry says what is true today, why it is acceptable for now, and
what would have to change — so picking one up does not start with re-deriving the reasoning.

## Store uploaded images outside the container (personal CDN)

**Today.** Uploads are staged in a private directory (`NODE_UPLOAD_STAGING_PATH`, defaulting under
the system temp directory), checked, and then committed to an image store by
`storeUploadedImages`. The only store that exists writes to `NODE_PUBLIC_PATH/images/` and returns
the server-relative `/images/x.png` that `express.static` serves — which is what this API has
always stored.

**Why it matters.** Those files are inside the container. **Rebuild or remove it and every uploaded
image is gone**: `docker compose down -v`, a redeploy, a move to a different host. Only
`public/images/seed/` survives, because those are committed to the repository. Nothing backs the
rest up, and nothing warns you — the database keeps its `imageUrl` rows, so the API goes on
answering with urls that now 404. Two further consequences of the same fact: replicas do not share
uploads (an image posted to one is missing on the other), and the Node process spends its time
serving static bytes.

**Acceptable for now** because a bind-mounted volume keeps them across rebuilds, which is enough
for a single-host deployment. It is not enough for more than one replica, and it still ties the
images to one machine's disk.

**What to do.** Write a second implementation of `IImageStore` (`@core/adapters/image-store`) — a
personal CDN is the plan; any S3-compatible bucket would also do — and select it from configuration.
Nothing is wired for that selection yet, deliberately: a switch that chooses a backend nobody has
written is a way to get a half-migrated deployment.

**What is already in place.** The seam, and everything that had to change around it:

- `@core/adapters/image-store` is the single place that knows where bytes live. Nothing else may
  turn an `imageUrl` into a path (the header of that file explains why that rule is load-bearing).
- `put(stagedPath) → url` and `remove(imageUrl)` are the whole interface, implemented for local
  disk. A second backend is a second object with those two methods.
- Staging exists precisely so `put` receives a finished file: a remote store cannot be written to
  as the bytes stream in.
- The TODO comment above `imageStore` spells out the key layout, the content type, the legacy-row
  delegation and the orphaned-object question.

**What must not break.** `imageUrl` becomes absolute for new uploads while existing rows stay
relative, so both forms have to keep working:

- `format: uri-reference` (`components/schemas/ImageUrl` in `openapi.yaml`) already permits both.
  Do NOT tighten it back to `uri` until every legacy row is migrated.
- Anything that concatenates a base URL onto `imageUrl` must skip that when the value already has a
  scheme, or it will produce `https://cdn.example.com/https://cdn.example.com/x.png`.
- `express.static` and the local branch of `imageStore.remove` must stay whatever else changes:
  they are what keeps legacy rows readable and deletable.

**Why stored URLs are relative today.** Saving `https://<current-host>/images/x.png` would bake the
deployment's hostname into every row: a domain change, a move behind a different proxy, or running
the same dataset in staging would leave stale absolute URLs pointing at the wrong server — a data
migration to fix something that is not data. A CDN base URL is different in kind: it is chosen
deliberately and does not change when the API moves, which is why a remote store is allowed to
store an absolute one.
