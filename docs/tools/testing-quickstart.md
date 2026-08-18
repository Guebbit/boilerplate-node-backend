# Testing — Quick Start

Everything you can run, what each answers, and what it costs. Start here; the pages linked from
each row go deeper.

## The 30-second version

```bash
npm run test:module -- src/modules/products   # one module, every layer it owns, seconds
npm run test:unit                             # every unit test
npm run test:report                           # WHERE the time and the failures are, per module
npm run complete                              # the whole gate, exactly as CI runs it (~90s)
```

If you change one module, the first line is the loop you want. If a build went red and you want to
know _which domain_, the third line is the one.

## Every command, and when to reach for it

| Command                                    | Answers                                                           | Time      | Gate?                |
| ------------------------------------------ | ----------------------------------------------------------------- | --------- | -------------------- |
| `test:module -- <path>`                    | Did I break the module I'm editing?                               | seconds   | —                    |
| `test:unit`                                | Did I break a unit anywhere?                                      | ~15s      | ✅                   |
| `test:cross-cutting`                       | Do the architectural rules still hold?                            | ~4s       | ✅                   |
| `test:integration`                         | Does it work against a real (in-memory) Mongo?                    | ~14s      | ✅                   |
| `test:contract`                            | Does the API match `openapi.yaml`, including what it must reject? | ~50s      | ✅                   |
| `test:fuzz`                                | Do the rules hold for inputs nobody thought of?                   | ~32s      | ✅                   |
| `test:unit:report` + `test:report`         | Which module owns the failure, and where did the time go?         | +1s       | ✅ (prints in CI)    |
| `test:prism`                               | Does the spec's own example server answer?                        | ~5s       | ❌ `complete:manual` |
| `test:mutation`                            | Do the tests **notice** when the source is wrong?                 | minutes   | ❌ nightly           |
| `bench`, `bench:orders`, `bench:inventory` | How fast is one endpoint?                                         | 30s each  | ❌ by hand           |
| `bench:k6`, `bench:k6:checkout`            | Does it hold up under ramping load, with a verdict?               | ~70s each | ❌ by hand           |
| `complete`                                 | All of the gate, in CI's order                                    | ~90s      | —                    |

## Running one thing

**One module, every layer it owns** — the path is the filter, and `--runInBand` is why this is a
script rather than something you type: the contract and integration suites share a database and
must not run concurrently.

```bash
npm run test:module -- src/modules/products      # 8 suites, 92 tests
npm run test:module -- src/modules/orders/tests/unit
```

**Watch mode** — jest's own flag, no script needed:

```bash
npx jest --watch src/modules/products
```

**Only what your diff touched** — works, with one caveat worth knowing:

```bash
npx jest --onlyChanged --runInBand
```

Keep `--runInBand`. Without it, `--onlyChanged` will happily pull integration and contract suites
into a parallel run, which every script here deliberately avoids — and the failures that produces
look like real bugs.

## Reading a failure

`npm run test:report` reads the JSON a run wrote and answers the two questions a raw log cannot:

```
[test-report] 1754 tests in 124 suites — 1754 passed, 0 failed (100.1s of suite time)

  module           suites  tests  failed     time
  account              13    147       0    20.9s
  orders               12    121       0    18.3s
  products              7     72       0     2.7s
  (cross-cutting)      20    177       0     4.1s

  slowest suites
     10.4s  src/modules/cart/tests/unit/service.test.ts

  failures
  ✖ [orders] orderService.cancel releases the hold
      src/modules/orders/tests/unit/service-crud.test.ts
      Error: expected 2 to be 3
```

It needs a JSON report to read, which `test:unit:report` produces. Coverage rows appear only when
`coverage/lcov.info` exists — run `test:unit:coverage` first if you want them.

The same script exists in the paired frontend, byte-identical, because Vitest's `json` reporter
emits the shape Jest's `--json` does. `npm run check:spec-identity` keeps the two copies honest.

## The five test layers

Each answers something the others structurally cannot:

| Layer             | Data source                                  | Catches                                                        |
| ----------------- | -------------------------------------------- | -------------------------------------------------------------- |
| **unit**          | `factory.ts`, mocked repositories            | logic errors in one function                                   |
| **cross-cutting** | the module registry itself                   | a module breaking an architectural rule                        |
| **integration**   | real in-memory Mongo via `tests/factory.ts`  | anything the ORM or an index does differently than you assumed |
| **contract**      | a Zod-walked request fuzzer + `jest-openapi` | the API drifting from `openapi.yaml`, in either direction      |
| **fuzz**          | fast-check                                   | a rule that holds for your examples and not in general         |

## Performance

Two tools, deliberately:

```bash
npm run bench            # autocannon: one endpoint, flat load, reports numbers
npm run bench:k6         # k6: ramping load, several endpoints, PASSES OR FAILS
npm run bench:k6:checkout  # the write path — login, cart, checkout under contention
```

`bench` tells you how fast something is. `bench:k6` tells you whether it is fast **enough**,
because it carries thresholds. Neither is in the gate: load results depend on the machine, and a
noisy gate is a disabled gate.

**The thresholds in `k6/*.js` are placeholders.** Seed real ones by measuring first — start the
app, run `npm run bench`, read the p95, and set the threshold to roughly 1.4× it. The job of a
threshold is to catch a regression, not to express an ambition; leave headroom or it fires on an
unlucky afternoon and everyone learns to ignore it.

`bench:k6:checkout` **writes** — it creates orders and moves stock. Point it at a throwaway
database and `npm run db:seed:reset` afterwards.

## Related

- [Testing & Docs](./testing-and-docs.md) — the layers and the data behind them
- [Package Scripts](./package-scripts.md) — every script, annotated
- [Mutation Testing](./mutation-testing.md)
- [MongoDB & Mongoose](./mongodb-mongoose.md) — where the demo data comes from
