# Known gaps

Things that are **deliberately not fixed yet**, each with enough context to act on later without
re-deriving it. Nothing here is a bug in the running application; everything here is a place where
the architecture is less honest than it intends to be.

Recorded 2026-08-11, at the end of the modular-domain migration. If you are reading this much
later, verify before acting — some of these are the kind of thing a later change fixes by accident.

## 1. Barrel exports nobody imports

A module's `index.ts` is a promise to every other module that a shape will not move. Seven exports
currently make that promise to nobody:

| Module       | Export                                                                        | Notes                                          |
| ------------ | ----------------------------------------------------------------------------- | ---------------------------------------------- |
| `products`   | `productModel`                                                                | the model is used only inside the module       |
| `users`      | `applyUserTransform`                                                          | ditto                                          |
| `audit-logs` | `auditLogRepository`, `auditLogModel`                                         | only `auditLogService` is reached from outside |
| `feedback`   | `feedbackRequestService`, `feedbackRequestRepository`, `feedbackRequestModel` | **the entire barrel is unused**                |

`feedback` is the interesting one. By the rule the other modules follow, a module nothing imports
should have **no** `index.ts` at all — which is exactly what `observability` and `locales` do. The
barrel was kept because feedback owns a collection and the first sibling that needs it should find
a surface rather than a reason to reach for an internal. That is a defensible position, but it is
the opposite of the one taken two folders away, and the inconsistency is the thing to resolve.

**When you fix this:** decide the rule first, then apply it to all nine modules at once. Deleting
the four dead exports is five minutes; deciding whether `feedback` keeps a barrel is the actual
decision.

## 2. Stale paths in docblocks

About twenty comments still name files that moved during the migration — `src/services/auth-tokens.ts`,
`src/models/user-validation.ts`, `tests/helpers/…`, `@repositories/*`. They are load-bearing
comments in the right files; only the paths inside them are wrong.

```bash
grep -rn "src/services/\|src/models/\|src/repositories/\|src/controllers/\|tests/helpers/\|@services/\|@models/\|@repositories/\|@controllers/" \
  --include="*.ts" src/ tests/ db/
```

`docs/tools/mutation-testing.md` mirrors the Stryker config and was cleared of stale paths by the
mutation reset (§4).

**Why it is not urgent:** a wrong path in prose misleads a reader; it does not mislead the compiler.
**Why it is not nothing:** these docblocks are the reason this codebase is readable, and a comment
that has been wrong for a while stops being trusted, which costs more than the error itself.

## 3. `subscribe` is a manifest field with one user

`kernel/registry.ts` carries `subscribe?: () => void`, and exactly one module fills it: `cart`,
which listens for `product.deleted` and `user.deleted`.

The plan's own risk table says a field used by one module does not belong in the manifest — that
module should do the thing itself. The counter-argument is that subscription has to happen at a
specific moment (after every module is validated, before the first route exists), and the manifest
is what gives the registry a place to call it.

Both are true. It stayed because every domain has now migrated and nothing else subscribes, which
means the question is finally answerable rather than speculative:

- **Drop the field** — `cart/module.ts` calls `onDomainEvent` at import time. Simpler manifest;
  subscription order becomes import order, which is `src/modules.ts` order, which is alphabetical
  and therefore accidental.
- **Keep the field** — the registry keeps control of when handlers attach. One module fills it
  today; a second domain event makes that two.

## 4. Coverage floors, after the mutation reset

Two files lost their coverage floor in the migration and have not had it restored:

| File                              | Was floored by    | Now       |
| --------------------------------- | ----------------- | --------- |
| `src/modules/account/tokens.ts`   | `src/services/**` | unfloored |
| `src/modules/users/validation.ts` | `src/models/**`   | unfloored |

The module globs in `jest.config.js` cover `model.ts`, `repository.ts` and `service.ts` only. The
newer per-module files — `audit.ts`, `metrics.ts`, `seeds.ts`, `events.ts`, `routes.ts` — have never
had floors and may not need them.

The coverage floors are left alone on purpose: **they are being redone from the ground up** once the
architecture settles, and a floor moved twice is worse than a floor moved once.

Mutation testing has had its reset. `stryker.config.json`'s `mutate` is pointed at the current
module layout, its notes carry only reasoning that still applies, and `docs/tools/mutation-testing.md`
matches. `mutation-baseline.json` is **gone deliberately** — its keys were pre-migration paths, and
the ratchet seeds a fresh one from the first report rather than being edited into shape. So:

- `npm run test:mutation` is the next step, and nothing gates on it — `break` is `null` until a real
  run supplies a number.
- `npm run test:mutation:check` after that run records the first baseline and exits 0. Every run
  after that compares against it.

## 5. `resetDomainEvents` is a test seam exported from production code

`kernel/events.ts` keeps its handler map in a module-level `const`, so a suite that calls
`registerModules()` per case accumulates subscriptions across cases and watches one emit fire N
times. `resetDomainEvents()` exists to clear it, and two specs call it
(`modules/{products,cart}/tests/unit/service.test.ts`).

It is honest about being a seam — the docblock says so — but it is still a function shipped to
production for the benefit of tests, and nothing stops application code from calling it and silently
unsubscribing every module.

The shape that would not need it is a bus **instance** owned by the registry rather than a
module-level map: a fresh registry means a fresh bus, and the reset is the constructor. The cost is
that `onDomainEvent` / `emitDomainEvent` stop being importable functions and have to be reached
through something, which is a larger change than the seam is annoying.

**When you fix this:** do it with §3 — whoever decides where subscription lives is already holding
both halves of this question.

## 6. `emitDomainEvent` swallows handler errors, by design

A failing handler is logged and the emitter proceeds. If cart cleanup throws while a product is
being hard-deleted, the product is still deleted and the orphaned cart lines stay.

This is deliberate and matches the pre-migration behaviour exactly, so it is not a regression: a
listener must not roll back an operation it never authorised, and the emitting module cannot reason
about failure modes of code it has never heard of. It is recorded here because the migration turned
it from an accident of how the call was written into a structural property of the event bus.

**The thing to not do:** if some future flow needs cross-module cleanup to be all-or-nothing, this
is the wrong primitive and must not be bent into one. Awaiting handlers inside the emitter's
transaction makes every subscriber a participant in a transaction it cannot see, which is how the
dependency arrow this bus exists to remove comes back pointing the other way. Either that cleanup
belongs in the owning module, or the two modules were one module.

## 7. What still breaks when domains are deleted

`rm -rf src/modules/{products,cart,orders}` plus the registry lines leaves `src/` and `db/`
compiling — zero files — and breaks **sixteen**, all under `tests/` and `scripts/`. Measured
2026-08-12; the full run, the classification and a ranked fix list are in
`DELETABILITY_TEST.md` (repo root).

Two of the sixteen are correct and must not be "fixed":

- `tests/integration/concurrency/cart-races.test.ts` — asserts a race between cart, orders and
  users. With those modules gone there is no race.
- `tests/unit/scripts/spec-identity.test.ts` — reports the shared bundles as forked against the
  paired frontend. Deleting a domain _is_ a two-repo change, and this is the guard saying so.

The other fourteen are real residue. The largest group is seven sweep canaries that state their
floor as a literal calibrated to the nine-module build (`expect(files.length).toBeGreaterThanOrEqual(6)`
and friends) — each one is a copy of `src/modules.ts` expressed as an integer, inside a file that
mentions no domain and therefore reads as domain-free.

## 8. Uploaded images do not outlive the container

`src/infrastructure/adapters/image-store.ts` writes uploads to the container's own filesystem.
**Rebuild or remove the container and every uploaded image goes with it** — `docker compose down -v`,
a redeploy, a moved host. Only `public/images/seed/` survives, because those are committed. Nothing
else is backed up, and two replicas do not share what they store: an image uploaded to one is a 404
on the other. A bind-mounted volume is the stopgap and works, but pins the deployment to one disk.

The fix is a second object with the two methods of `IImageStore` — any S3-compatible bucket, or a
personal CDN. Nothing is wired to select it yet, on purpose: a switch that selects a backend nobody
has written is how you get a half-migrated deployment.

When writing it:

- **`put(stagedPath)`** uploads under `images/<basename>` with the right `Content-Type` (derive it
  from the extension — `extensionForImage` in `adapters/image-signatures` is that mapping, read
  backwards), deletes the staged file, and returns the object's public url.

    That return value is a **url prefix change**: rows written from then on hold an absolute url while
    every existing row holds `/images/x.png`. Both are legal — `ImageUrl` in `openapi.yaml` is
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
