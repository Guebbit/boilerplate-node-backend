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

### Cycles

`A → B → A` compiles, lints and runs. It fails only in whichever order the module system happens to
initialise it, as an `undefined is not a function` at boot, far from either file. No per-file rule
can see one, because no file in a cycle is doing anything wrong on its own.

## Two settings that decide whether the rules mean anything

Both were wrong in the first working version, and both failed **open** — the run went green while
checking nothing. They are worth knowing before editing the config.

| Setting                                                  | Why it is what it is                                                                                                                                                                                                    |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tsConfig: { fileName: 'tsconfig.json' }`                | The aliases (`@modules`, `@kernel`, `@infrastructure`, `@app`, `@types`) live there. Without it every alias is an unresolvable specifier, the graph is a set of disconnected files, and every rule passes over nothing. |
| `node_modules` is in `doNotFollow`, **not** in `exclude` | `doNotFollow` records the module and does not cruise into it. `exclude` drops it from the graph entirely — and a rule whose `to` names `node_modules/mongoose` then matches nothing and reports success.                |

`tsPreCompilationDeps` is deliberately **off**, so the graph is the one that exists at runtime.
Turned on it also carries `import type` edges, which TypeScript erases: it reported eight "cycles"
across `cache.ts`, `queue.ts`, `dependency-health.ts` and `payments/fake.ts`, every one closed by a
type-only import. None can produce the boot-order failure the rule is for, and none can be fixed
except by deleting a type import that is doing its job. Nothing is lost — a direct
`import mongoose` from the domain layer, type-only or not, is already refused by
`no-restricted-imports`.

## What is deliberately not here

The tier walls, restated. Two tools enforcing one property is one tool too many: they drift, and
the second failure is always the confusing one. Anything expressible as "this file may not import
that file" belongs in `eslint.config.ts`.
