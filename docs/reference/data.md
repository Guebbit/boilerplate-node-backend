# Data

`db/` holds everything that puts rows in a database, and the split inside it is the point:
**`migrate-mongo` owns schema, `db:seed` owns data.** A migration changes the shape of a
collection; a seed fills one. Neither does the other's job.

Neither half is authored here. A module owns its migrations and its fixtures the same way it owns
its `openapi.yaml` fragment; `db/` is where the assembled result lands.

---

## The two halves

```mermaid
%%{init: {'flowchart': {'nodeSpacing': 40, 'rankSpacing': 45}}}%%
flowchart LR
    Cfg["migrate-mongo-config.js"] --> Mig["db/migrations<br/><i>assembled bundle</i>"]
    Own["per-module migrations<br/><i>schema</i>"] --> Build["gen:migrations"]
    Models["per-module model.ts<br/><i>indexes</i>"] --> Build
    Build --> Mig
    Mig --> Mongo[("MongoDB")]
    Seeds["per-module seeds<br/><i>fixtures</i>"] --> Index["db/demo/index.ts<br/><i>the seeder</i>"]
    Index --> Mongo
    Mongo --> Assemble["db/demo/assemble.ts"]
    Assemble --> Data["db/demo/demo-data.json<br/><i>published dataset</i>"]

    classDef schema fill:#fef3c7,stroke:#d97706,color:#111827;
    classDef data fill:#dbeafe,stroke:#2563eb,color:#111827;
    classDef store fill:#dcfce7,stroke:#16a34a,color:#111827;
    class Cfg,Mig,Own,Models,Build schema;
    class Seeds,Index,Assemble,Data data;
    class Mongo store;
```

## Migrations

| Pattern                           | What it is                                                                                                                                                                                                                                                                                                                                                                                                             | Read next                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `src/modules/<m>/migrations/*.js` | A data migration the module owns, named with a leading timestamp, exporting an `up` and a `down`. Written by hand — a rename or a backfill cannot be derived from a schema. Declared on the module's manifest as `migrations: path.join(__dirname, 'migrations')`, the same shape as `locales`. Plain JavaScript because `migrate-mongo` loads them through its own CommonJS resolver with no TypeScript in the chain. | [Modules](./src-modules.md) · [MongoDB & Mongoose](../tools/mongodb-mongoose.md) |
| `db/migrations/*.js`              | **Generated** by `npm run gen:migrations`, and gitignored. The index baseline plus a copy of every enabled module's migrations, applied in timestamp order and recorded in a changelog collection so each runs exactly once per database. This is the only directory `migrate-mongo` reads — run them with `npm run db:migrate:up`.                                                                                    | [Repository Root](./root.md)                                                     |

Both halves have ONE author. The baseline's indexes come from the schemas that declare them; a data
migration comes from the module whose collection it touches. `gen:migrations` assembles the two into
`db/migrations/`, exactly as `contracts:bundle` assembles `openapi.yaml` from per-module fragments —
and, like `api/`, the result is gitignored because `postinstall` rebuilds it, so there is no
committed copy left to go stale.

Timestamps are what sequence one module's migration against another's, so the assembler refuses a
filename without a 14-digit one, and refuses two modules claiming the same filename — the changelog
records by name, so a collision would mark one module's work as already applied.

**Regenerating only reaches databases that have never run it.** `migrate-mongo` records the
baseline as applied by FILENAME, so rewriting its contents does not make it run again — a database
that already holds the old set never sees the new index. Adding an index to a live deployment is
therefore a new migration file of its own, alongside the regenerated baseline.

```mermaid
flowchart LR
    Schema["a module's model.ts<br/><i>the only author</i>"] --> Gen["gen:migrations"]
    Gen --> Baseline["…-baseline.js"]
    Baseline -->|"never migrated"| Fresh["new database<br/><b>gets every index</b>"]
    Baseline -.->|"already applied"| Live["live database<br/><b>unchanged</b>"]
    Schema --> Extra["a new module migration"]
    Extra --> Live
```

Two tests guard the set: `tests/integration/db/migration-model-indexes.test.ts` runs the migrations
against a real database and checks the indexes that land against the ones the models declare, and
`tests/integration/db/migration-demo-data.test.ts` checks a migration against the dataset it has to
keep loadable.

## The demo dataset

| File                     | What it is                                                                                                                                                                                                                                                                                            | Read next                                                              |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `db/demo/index.ts`       | The seeder that `npm run db:seed` runs. Walks every enabled module's seed file and upserts its fixtures through the shared seeding primitive — so seeding is idempotent, and a module that is disabled seeds nothing. A reset flag empties first.                                                     | [Modules](./src-modules.md) · [Demo profile](../tools/demo-profile.md) |
| `db/demo/assemble.ts`    | Reads the seeded rows back out **through the real serializers** and checks the result is what the API would actually answer. That is what makes the published dataset a record of the API's behaviour rather than of its storage.                                                                     | [Contract Testing (Response)](../tools/contract-testing.md)            |
| `db/demo/demo-data.json` | **Generated** by `npm run seed:export`. The demo dataset exactly as the API serves it, published for the paired frontend to mock against. `npm run check:seed-export` fails when the committed bytes differ from a fresh run, and Prettier is told to leave it alone so the two writers cannot fight. | [Contract Ownership & Fragmentation](../api/contract-fragmentation.md) |

The fixtures themselves are not here — each module owns its own slice, and the two demo accounts
are declared in `src/kernel/seed-accounts.ts`.

## Tools

| File                | What it is                                                                                                                                                                                                                                                                         | Read next                                      |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `db/cache-clear.ts` | Drops every cached response belonging to this app — `npm run db:cache:clear`. The API invalidates its own cache on every write it handles, so this is for the writes it did **not** handle: a migration, a manual edit, a restored dump.                                           | [Redis Cache](../tools/redis-cache.md)         |
| `db/run-script.ts`  | The entry-point wrapper the one-shot scripts in `db/` run through. Gives them the three things a bare promise chain does not: a connection opened and closed around the work, a non-zero exit on failure, and the failure printed rather than swallowed as an unhandled rejection. | [Package Scripts](../tools/package-scripts.md) |
