# Dependency graph

`npm run check:dependencies` — [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
over `src/`, configured in `.dependency-cruiser.cjs`. Runs in `complete` and as its own CI job.
About 1.5 seconds.

## Why a second tool

The tier walls themselves are enforced by
[`eslint-plugin-boundaries`](../theory/layers.md) in `eslint.config.ts`, and that is where a wall
belongs — it reports in the editor, at the offending import, while the code is being written.

This one exists for the two questions a linter structurally cannot answer, because ESLint sees one
file's own imports and nothing further.

### Reachability

> The domain layer may not **import** mongoose

is a lint rule.

> The domain layer may not **reach** mongoose

is a question about the whole graph, and it is the one that survives a refactor. Nobody adds
`import mongoose` to a domain file — they add a helper that already had it, and the direct rule
stays green while the tier stops being pure. `reachable: true` asks for the path rather than the
edge:

```js
{
    name: 'domain-cannot-reach-persistence',
    from: { path: '^src/modules/[^/]+/domain/' },
    to: { path: 'node_modules/(mongoose|mongodb)', reachable: true }
}
```

Three rules use it: the domain layer against persistence and against HTTP, and `infrastructure`
against the domains above it.

### Module coupling

Every module folder carries its own `module.yaml`, an allow-list of the siblings it may reach:

```yaml
# src/modules/cart/module.yaml
subdomain: core
dependsOn:
    - account # the checkout's delivery address
    - orders # the order a checkout creates
```

`.dependency-cruiser.cjs` reads every `module.yaml` off disk and generates one `module-coupling-<name>`
rule per module from it — a module reaching a sibling its own file does not list fails
`check:dependencies`, reported at the offending import. There is no second copy of the map to drift:
the file a module's own docblock and `dependsOn` field describe **is** the rule the graph enforces.

Fails closed both ways: a module folder with no `module.yaml` may reach no sibling at all, rather
than being silently exempt from the rule; a `dependsOn` that is not an array of strings throws,
naming the offending file, instead of matching nothing. `tests/cross-cutting/module-descriptors.test.ts`
is the separate hygiene check — every file exists, parses against a strict schema, and names only
real, non-duplicate, alphabetically-ordered siblings — kept apart from this enforcement on purpose,
so the enforcement config's own logic stays as small as the fail-closed guarantee requires.

`scripts/docs/generate-module-graph.ts` reads the same files for each module's `subdomain` colour in
the generated map at [Modules](../modules/index.md) — see
[Strategic DDD](../theory/strategic-ddd.md#_2-context-map-—-how-a-module-reaches-its-siblings) for why
the relationship _kind_ and _reasoning_ stay in `module.ts`'s docblock instead of here.

### Cycles

`A → B → A` compiles, lints and runs. It fails only in whichever order the module system happens to
initialise it, as an `undefined is not a function` at boot, far from either file. No per-file rule
can see one, because no file in a cycle is doing anything wrong on its own — the failure is a
property of the two modules together, not of either one alone.

`.dependency-cruiser.modules.cjs`, wired into the same `check:dependencies` script, is the rule
that DOES see it: `scope: 'folder'` aggregates every file into its `src/modules/<name>` folder
first, then runs cycle detection over the folders — so two modules that reach each other through
different files, several hops apart, still fail here even though no single file-level rule in
`.dependency-cruiser.cjs` was ever broken. `account ↔ cart` was exactly this shape before the
address book moved into its own module: `cart`'s checkout imported `account` for one function,
`account`'s data export imported `cart` for another, and neither import broke a per-file rule on
its own.

It runs as its own cruise over `src/modules` alone, not folded into the main config's `forbidden`
list, because `scope: 'folder'` rules cannot filter which PATH a cycle runs through — cruising
`src tests` together reports dozens of false cycles purely through test-support code that imports
several modules' `tests/factories.ts` back and forth. `tests/` is excluded from this cruise
entirely rather than filtered after the fact.

The fix for a real cycle is always the same: the sibling that has to reach back moves the read onto
the domain event bus (`kernel/events.ts`) instead — see any module already listening for
`USER_DELETED` for the shape.

## Two settings that decide whether the rules mean anything

Both were wrong in the first working version, and both failed **open** — the run went green while
checking nothing. They are worth knowing before editing the config.

| Setting                                                  | Why it is what it is                                                                                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsConfig: { fileName: 'tsconfig.json' }`                | The aliases (`@modules`, `@kernel`, `@infrastructure`, `@app`, `@types`) live there. Without it every alias is an unresolvable specifier, the graph is a set of disconnected files, and every rule passes over nothing. |
| `node_modules` is in `doNotFollow`, **not** in `exclude` | `doNotFollow` records the module and does not cruise into it. `exclude` drops it from the graph entirely — and a rule whose `to` names `node_modules/mongoose` then matches nothing and reports success.                |

`tsPreCompilationDeps` is deliberately **off**, so the graph is the one that exists at runtime.
Turned on it also carries `import type` edges, which TypeScript erases: it reported eight "cycles"
across `cache.ts`, `queue.ts`, `dependency-health.ts` and `src/modules/payments/providers/fake.ts`, every one closed by a
type-only import. None can produce the boot-order failure the rule is for, and none can be fixed
except by deleting a type import that is doing its job. Nothing is lost — a direct
`import mongoose` from the domain layer, type-only or not, is already refused by
`no-restricted-imports`.

## What is deliberately not here

The tier walls, restated. Two tools enforcing one property is one tool too many: they drift, and
the second failure is always the confusing one. Anything expressible as "this file may not import
that file" belongs in `eslint.config.ts`.
