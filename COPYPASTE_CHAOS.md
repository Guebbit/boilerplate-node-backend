# Copy-Paste Chaos

Eight files exist twice — once here, once in `boilerplate-vue-frontend` — and must stay
byte-identical. This page is the whole of it: what they are, why they are not one file, and the one
command that moves them.

> **The short version.** Run `npm run sync:frontend`. It copies the five files this repo owns,
> refuses if any is stale, and tells you what to regenerate on the other side. The other three are
> hand-maintained on both sides and you move those yourself.

---

## Why this exists at all

Two repos build one product. The backend serves the API and the frontend consumes it, and a handful
of documents describe the boundary between them: the REST contract, the realtime contract, the demo
dataset, the analytics event names.

**Every one of them fails silently when it forks.** That is the property that makes them special —
not that they happen to match:

- A forked `openapi.yaml` is still a _valid_ `openapi.yaml`. Both repos lint clean, both suites pass,
  and the mismatch surfaces the first time the real app calls the real API.
- A forked `dataset.json` means the frontend's mocks and the backend's seeds describe different
  users. Both sides stay green, because each is consistent with its own copy.
- A forked analytics name produces two half-events that no dashboard adds up. Nothing errors
  anywhere, ever.

`npm run check:spec-identity` is the detector. It hashes all eight on both sides and fails the build
on the commit that forks one — not on the release that ships the mismatch.

---

## The eight files

### Owned here (5) — the frontend's copy is an output

`npm run sync:frontend` copies these. Never edit the frontend's copy: the next regeneration reverts
it, and the diff looks like the backend broke something.

| Produced here                                          | Lands there as                          | Built by           |
| ------------------------------------------------------ | --------------------------------------- | ------------------ |
| `openapi.yaml`                                         | `openapi.yaml`                          | `contracts:bundle` |
| `asyncapi.yaml`                                        | `asyncapi.yaml`                         | `contracts:bundle` |
| `src/infrastructure/observability/analytics-events.ts` | `src/infrastructure/analyticsEvents.ts` | `contracts:bundle` |
| `db/seeds/dataset.json`                                | `tests/support/mocks/dataset.json`      | `seed:export`      |
| `src/types/asyncapi.generated.ts`                      | `src/types/realtime.generated.ts`       | `gen:asyncapi`     |

Three of the five are named differently on the other side, which is the single biggest reason manual
copying went wrong. The paths are declared once, in `SHARED_FILES`, and `sync:frontend` finds the
sibling checkout beside this one — or wherever `FRONTEND_PATH` in `.env` points.

### Mirrored (3) — both sides maintain them by hand

`sync:frontend` **reports** these and never writes them. A fork here is a question — which copy is
right? — and a script that guesses reverts somebody's work.

| File                                 | Why it is shared                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `spectral.yaml`                      | the ruleset both `lint:openapi` jobs enforce; different rules means one side passes a spec the other rejects |
| `scripts/gen-asyncapi-types.ts`      | both repos generate realtime types with it; a fix in one copy is a CI gate that behaves differently per repo |
| `scripts/check-mutation-baseline.ts` | same reason                                                                                                  |

`spectral.modules.yaml` and `spectral.asyncapi.modules.yaml` are **not** shared. They lint the
per-module documents under `src/modules/*/`, which exist only here.

---

## How the three authored documents are produced

No two of them the same way, which is the thing to know before proposing to unify them:

| Document              | Sources                                                                      | Mechanism                                                                                                                                |
| --------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `openapi.yaml`        | `shared/contracts/openapi.root.yaml` + `src/modules/*/openapi.yaml`          | `redocly bundle` — a real `$ref` resolve; comments live in the module files and are dropped from the bundle                              |
| `asyncapi.yaml`       | `asyncapi.root.yaml`, `asyncapi.workers.yaml`, `src/modules/*/asyncapi.yaml` | a ~30-line merge over the YAML AST (`scripts/contracts/asyncapi.ts`) — `asyncapi bundle` dereferences, which breaks `gen-asyncapi-types` |
| `analytics-events.ts` | `src/modules/*/analytics.ts`                                                 | a verbatim TEXT SLICE of each `as const` body, checked against the module's real exported keys                                           |

The first two are documents parsed as documents. The third is still string surgery — the last of
the old fragment approach — kept because the frontend reads its copy by hand and the per-name
comments are the reason it is readable. `assertSliceMatches` is what keeps that honest: the sliced
names must equal `Object.keys()` of the imported constant, so a reformatted declaration fails the
bundle instead of publishing a short catalogue.

---

## The loop

```bash
# 1. change a module's share of a contract — each of these is a whole document, valid on its own
#    src/modules/<name>/openapi.yaml       (+ shared/contracts/openapi.root.yaml)
#    src/modules/<name>/asyncapi.yaml      (+ shared/contracts/asyncapi.{root,workers}.yaml)
#    src/modules/<name>/analytics.ts
#    src/modules/<name>/seeds.ts

npm run contracts:bundle     # rebuild the specs + the analytics names + the 4 client collections
npm run seed:export          # reseed a throwaway db, republish dataset.json   (only if seeds changed)
npm run gen:asyncapi         # realtime types                                  (only if asyncapi changed)
npm run gen:api              # this repo's orval client

npm run sync:frontend        # <- the copy, all five, both names handled

cd ../boilerplate-vue-frontend
npm run gen:api              # their orval client, from the openapi.yaml you just copied
npm run check:spec-identity  # proves it
```

`sync:frontend` prints those last steps back at you, so you do not have to hold them.

---

## The scripts, and what each one is actually for

| Command                  | What it does                                                                                                             | When it fails                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `contracts:bundle`       | Two phases: 3 authored documents from per-module sources, then the 4 client collections from `openapi.yaml`              | a module source is malformed — a `$ref` no file answers, two sections claiming one channel, an analytics slice that lost an entry |
| `check:contracts-bundle` | Asserts every committed bundle equals a fresh build                                                                      | a module source was edited without re-bundling                                                                                    |
| `seed:export`            | Seeds a throwaway mongod with the real seeders, reads every row back through the real serializers, writes `dataset.json` | —                                                                                                                                 |
| `check:seed-export`      | Same, writing nothing                                                                                                    | a `seeds.ts` or a model changed without republishing                                                                              |
| `gen:asyncapi`           | Writes `src/types/asyncapi.generated.ts` from `asyncapi.yaml`                                                            | —                                                                                                                                 |
| `gen:api`                | Orval — writes `api/` from `openapi.yaml`                                                                                | —                                                                                                                                 |
| **`sync:frontend`**      | **Copies the 5 owned files; reports the 3 mirrors**                                                                      | a staleness gate fails, or a declared file is missing                                                                             |
| `check:spec-identity`    | Hashes all 8 on both sides                                                                                               | anything forked                                                                                                                   |

### What `sync:frontend` refuses to do

- **It will not copy stale files.** `check:contracts-bundle` and `check:seed-export` run first. If
  either fails, nothing is written — because copying a stale bundle makes both repos agree on a
  document neither one's sources produce, which is worse than being out of sync.
- **It will not touch a mirrored file.** They are listed as differing, and left alone.
- **It will not regenerate the frontend's client.** It cannot; that runs over there. It prints the
  command.
- `--dry` says what it would do and writes nothing.

---

## The rules, if you remember nothing else

1. **Never edit the frontend's copy of an owned file.** It is an output.
2. **Never hand-edit a generated file on either side.** `.gitattributes` marks every one of them,
   and the ones whose format allows a comment say `Code generated by ... DO NOT EDIT.` on line one.
3. **Bundle once, copy the result.** Do not regenerate on both sides and assume the bytes match —
   `redocly bundle` output depends on the installed CLI version.
4. **A `mirror` file that differs is a decision, not a chore.** Work out which side is right.

---

## Why it is still like this

The honest answer, already written into `scripts/specIdentity.ts`:

> It treats the symptom, and should say so: the cure is one source of truth — a package both repos
> consume, or a third repo — which is a bigger decision than a CI job.

`sync:frontend` narrows the chore from "remember five paths, four of them renamed" to one command,
and `check:spec-identity` still catches you if you skip it. What it does not do is remove the
duplication. Three ways out, in ascending order of commitment:

| Option                                      | What it removes                                             | What it costs                                                          |
| ------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------- |
| **Publish the contracts as an npm package** | all 5 owned files; the frontend gets a versioned dependency | a release step; the frontend pins a version instead of tracking `main` |
| **A third repo for the shared boundary**    | the 5, plus the 3 mirrors                                   | a third checkout everyone must clone and keep current                  |
| **A monorepo**                              | the whole page                                              | the largest change, and the two repos deploy independently today       |

The package route is the realistic one, and this repo already ships
[`@guebbit/openapi-runnable-collections`](https://www.npmjs.com/package/@guebbit/openapi-runnable-collections),
so the pipeline exists. The three mirrored files would stay mirrored either way — a shared package
that both repos' CI scripts depend on is itself a cross-repo dependency, which is the problem rather
than the fix.

Until that call is made, `sync:frontend` is the polish and `check:spec-identity` is the gate.

---

## Related

- [Contract Ownership & Fragmentation](./docs/api/contract-fragmentation.md) — who owns which slice,
  and how the bundles are built
- [Regenerating After a Change](./docs/api/regenerating.md) — which command follows which edit
- `scripts/specIdentity.ts` — the file list, with the reasoning per entry
- `scripts/sync-frontend.ts` — the copier
