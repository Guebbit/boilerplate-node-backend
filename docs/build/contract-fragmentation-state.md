---
type: concept
audience: [developer]
---

# Contract fragmentation: the products example and current state

Part of [Contract Ownership & Fragmentation](./contract-fragmentation.md): a worked example (`products`) and where each bundle stands today.

## Practical example: the `products` module

`products` owns everything about itself, its slice of the contract included:

```
src/modules/products/
├── module.ts        name, mounts [{ basePath '/products', routes }], locales
├── routes.ts        the express router
├── controllers/     request handling
├── services/        business rules
├── repository.ts    persistence
├── model.ts         the mongoose schema
├── events.ts        what it publishes and subscribes to
├── openapi.yaml     its paths and the schemas only it uses
├── probes.ts        requests the contract cannot describe
├── locales/         its own copy
└── tests/           its own specs

scenarios/products.ts its own seed data — outside src/, see Demo profile
```

Its `openapi.yaml` holds every operation under `/products`:

```
/products                /products/search      /products/facets
/products/{id}           /products/{id}/restore
/products/{id}/hard
```

At which point the goal test the whole module architecture exists to satisfy finally includes the
contract:

> Deleting a domain is `rm -rf` of one folder plus removing one line from `src/modules.ts`. The
> bundler's input is what is on disk, so it needs no edit.

## Current state

Every operation and every single-domain type lives with the module that owns it.

```
shared/contracts/openapi.root.yaml    preamble · securitySchemes · parameters · responses ·
                                      the shared types · GET / · the per-module path index
                                      (a preference: completed from the fragments, see below)
src/modules/<name>/openapi.yaml       one standalone OpenAPI document per module:
                                      its paths, its tags, and every schema it owns
```

```bash
npm run contracts:bundle              # rebuild every bundle from the fragments
npm run check                         # fail if any bundle on disk is stale
```

**The root's path index is completed, not trusted.** `scripts/contracts/root-assembly.ts` reads
every fragment on disk, drops the root's `$ref` for a path no fragment declares any more, appends
the paths and tags of a fragment the root has not heard of (a tag the fragment declares in its own
`tags:` arrives with that description), and stages the completed tree under `tmp/` for redocly. The root's hand order is kept for what it already lists, so the bundle's
section order does not move; a new module is in the contract from its own `openapi.yaml` alone.

**Two guards close the bundle.** `redocly bundle` runs with
`--component-renaming-conflicts-severity=error`, so two files defining one schema name fail the
build instead of coming out as `Name-2`. And `scripts/contracts/prune-unused.ts` runs last, after
every step that adds references, dropping the components nothing reaches and the tags no operation
uses: a deleted module leaves nothing orphaned behind. A security scheme no operation names goes
with them.

**The data export's schema is assembled the same way.** `AccountExportResponse` lives in
`account/openapi.yaml` as a stub (`exportedAt`, `profile`). Each module that contributes a
section declares it beside its paths:

```yaml
x-personal-data:
    orders: # the property name in the export
        required: false # optional, defaults to true
        schema: { type: array, items: { $ref: '#/components/schemas/Order' } }
```

`scripts/contracts/personal-data-assembly.ts` reads those off disk and adds one property per section
to the staged stub, rewriting each in-file `$ref` to point at the declaring module. A module that is
deleted takes its section with it, so `demo:remove` has no export list to edit.

To rebuild one document while iterating, name it: `npm run contracts:bundle -- openapi`. The
ordering lives inside `scripts/contracts/build-bundles.ts` rather than as an `&&` chain in `package.json`,
which is what makes that flag narrow the run instead of silently doing everything else. See
[Regenerating After a Change](./regenerating.md#regenerate-one-bundle-only).

What the bundle check in `npm run check` catches, and why nothing is diffed in CI: see
[The seven bundles](./contract-fragmentation.md#the-seven-bundles) above.

### Why the REST contract stopped concatenating, and the rest did not

A module's contract is a whole OpenAPI document, not a slice of one. The explanations sit in the
file that is actually read and edited, and the bundle is an artefact nobody opens by hand. So
`redocly bundle` does the job the standard way, resolving `$ref`, and the comments in the sources
are untouched by it. One step runs after it, on the bundled document rather than on a source:
merging `x-app-level-responses` into every operation, since a `$ref` has to be resolved first for an
operation to be reachable exactly once — see `scripts/contracts/openapi-bundle.ts`. A second such
step reads the `x-versioned: [methods]` marker a fragment puts on a path item, and hangs the shared
`If-Match` parameter, the 412 and the `ETag` header on exactly the operations it lists (a listed `post` gets `ETag` and `Content-Location`, no `If-Match`) — see
[Conditional writes](../understand/write-methods.md#conditional-writes-etag-and-if-match).

What this buys:

- **A module contract is a valid document.** `npm run lint:openapi:modules` lints each one on its
  own; you can open one in Swagger Editor.
- **Refs are checkable where they are written.** A module `$ref`s the root across a file boundary
  instead of assuming a neighbour's text will be concatenated above it.
- **The layout is one every tool already understands** — no section-order file, no indentation
  contract between files.

**No YAML anchors.** An anchor cannot cross a file, so a shape two fragments share is a named schema
a `$ref` can reach. A success response references its payload schema directly: there is no wrapper
schema ([Success Responses](../reference/responses.md)).

No bundle is built by concatenating text slices: the REST and AsyncAPI contracts are whole
documents, and the client collections are generated whole.

### Which schemas stayed shared, and why

A schema lives with the module that owns the thing it describes, and other modules `$ref` it by
file (`../orders/openapi.yaml#/components/schemas/Order`). Only what has no single owner stays in
`shared/contracts/openapi.root.yaml`:

| Kind                  | Examples                                                           | Why shared                                                                           |
| --------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Scalars               | `Id`, `Email`, `Locale`, `Page`, `PageSize`, `Text`, `ImageUrl`    | referenced everywhere                                                                |
| Response machinery    | `PaginationMeta`, `ErrorItem`, `Problem`, the `NoContent` response | every operation's success and failure shape                                          |
| The user record       | `User`, `UserActions`                                              | `account` authenticates the record `users` administers: the repo's one shared kernel |
| Cross-domain requests | `RequiredIdempotencyKeyHeader`                                     | belongs to a middleware in `infrastructure`                                          |
| The shell's own       | `HealthPing`, the `System` tag                                     | `GET /` belongs to no module, so neither does its answer                             |

The root file is the authority for the exact set. Everything else is owned: `Product` and its tax
fields by `products`, the order schemas by `orders`, `CartItem` by `cart`, the password fields by
`account`, the abilities schemas by `access`.

**A `$ref` between two modules follows `module.yaml` `dependsOn`.** Nothing checks it: deleting
the sibling fails the bundle on a dangling reference, which is how an undeclared one shows.

**Duplicating a schema into two fragments is the failure to watch for** — the bundle would carry
two definitions that drift apart silently, and the conflict flag above refuses the same name twice.

### What the split changed in the bundle

Only key ORDER. Parsed and compared ignoring order, the contract is the same as a single hand-kept
file would be, and orval's generated output does not depend on it.

Each fragment carries its own header, and the substantive comment blocks — the one explaining why
`imageUpload` declares no limits, the one explaining `active` versus `deletedAt` — sit with the
schemas they explain.

What does not change:

- the module registry, the `basePath` per module, and the one-line enable/disable in `src/modules.ts`
- `npm run lint:openapi`, `npm run gen:api`, and the spec-identity check
- the frontend holding a byte-identical copy

## Read next

- [Contract Ownership & Fragmentation](./contract-fragmentation.md)
