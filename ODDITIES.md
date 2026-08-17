# Oddities

Things in this codebase that are deliberate, defensible, and still surprise a reader. None of them
is a bug. They are written down because each one has already cost somebody a puzzled half-hour, and
because the argument for keeping them is easier to make once than to reconstruct from the code.

Each entry: **what it is**, **why it is that way**, **what it costs**, and — where a decision has
been taken — **the plan**.

> **Entries are removed once resolved rather than kept as tombstones.** The reasoning survives in
> the guard that replaced it, which is the only copy that cannot go stale. Numbering restarts each
> time this file is pruned; do not cite an entry by number across commits.
>
> Resolved 2026-08-16 — `account` exporting two service objects (now `services/index.ts` → one
> `accountService`; see `UPDATE_DOCUMENTATION.md` §E) and two coexisting service export styles (now
> `tests/cross-cutting/service-namespaces.test.ts`).
>
> Resolved 2026-08-17 — three entries, each with the guard that now holds it:
>
> | Was                                      | Landed as                                                               | Guard                                           |
> | ---------------------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------- |
> | process snapshot ×3, in two units        | `infrastructure/observability/process-snapshot.ts`, bytes everywhere    | `tests/cross-cutting/process-snapshot.test.ts`  |
> | four handlers under a verb-less filename | `account/controllers/{get-addresses,write-addresses,delete-address}.ts` | `tests/cross-cutting/controller-naming.test.ts` |
> | products barrel publishing demo data     | `@modules/<name>/seeds`, a second public path                           | `tests/cross-cutting/seeds-boundary.test.ts`    |
>
> The `locales` module's dynamic-dictionary work was moved out of this file entirely and is tracked
> separately — it turned out to be a feature, not a quirk.

---

## 0 · Operating assumption

**There is no backward-compatibility constraint on this repo.** No third party consumes the API,
the published contracts are regenerated from module fragments rather than hand-maintained, and the
one paired consumer is a sibling checkout that syncs with a single command. A contract change is
four commands:

```bash
npm run contracts:bundle     # module fragments → openapi.yaml + asyncapi.yaml
npm run gen:api              # openapi.yaml → api/models/*, api/schemas.zod.ts
npm run gen:asyncapi         # asyncapi.yaml → src/types/asyncapi.generated.ts
npm run sync:frontend        # copy every backend-owned shared file into the paired repo
npm run complete             # the gate: build, lint, spectral, both staleness checks, tests
```

The last two are not optional politeness. `check:spec-identity` runs inside `npm run complete`,
which is the pre-commit hook, so a contract change that has not been synced to the paired checkout
**cannot be committed** — the sync is part of the change, not a follow-up to it.

What is still expensive: **inverting a layer** (`infrastructure` may not import `@modules/*`,
lint-enforced), **punching a hole in the deep-import ban** (it is what makes a barrel mean
anything), **adding a convention with no guard** (folklore a reviewer must remember), and
**hand-maintained restatements of a generated fact** (they fork).

---

## 1 · The demo dataset publishes stored rows, not responses — _parked_

**No action scheduled.** Recorded because it still costs a reader half an hour.

`db/seeds/dataset.json` holds six collections and they are not the same kind of thing:
`products` (5), `users` (2) and `orders` (3) are **responses** — they parse against
`GetProductByIdResponse.data`, `GetUserByIdResponse.data` and `GetOrderByIdResponse.data` as
generated. `addressBooks` (2), `carts` (1) and `wishlists` (2) are **stored rows** — no endpoint
serves a raw book, cart or wishlist, and the frontend's MSW mocks compose the response from them.
Nothing in the artefact says which is which.

The premise is correct and is not up for revision: the export publishes what the database holds
after the real seeders and real serializers ran, because the drift it exists to kill lived in the
hand-written mappers on each side. Publishing composed responses would mean the export had to call
services, and the mapper would be back.

The knowledge does exist — `tests/cross-cutting/seed-conformance.test.ts` encodes it in the shape of
each mask and states outright that _"a book is never served raw"_ — but it lives in a test file, in
one of the two repos, and the person who needs it is writing a mock in the other one.

**If this is ever picked up**, the options are:

|     | Approach                                        | Trade                                                                                                                                                                                                                   |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | A `_meta.shapes` map inside `dataset.json`      | Puts the answer where the question is asked. Propagates with one `sync:frontend` — the file is `owner: 'backend'` in `scripts/specIdentity.ts` — and determinism is free, since the export already sorts every key.     |
| B   | A ten-line `db/seeds/README.md`                 | Cheapest. Does not travel with the artefact, which is the whole complaint.                                                                                                                                              |
| C   | Derive the classification instead of listing it | The interesting version: mark a collection `"response"` only when its rows round-trip through the module's serializer unchanged. Risks resurrecting the mapper, which is the one thing this artefact exists to prevent. |
| D   | Publish both stored rows and composed responses | Doubles the artefact and re-creates the mapper. No.                                                                                                                                                                     |

**What would un-park it:** a seventh collection whose kind is genuinely ambiguous, or a consumer
outside the two paired repos. Either makes the classification part of the artefact's contract rather
than a note about it.
