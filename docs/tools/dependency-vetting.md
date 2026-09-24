# Dependency Vetting

Rules for what earns a place in `package.json`, written down after `@asyncapi/cli` broke all of
them at once: ~446 MB transitive across this repo and the paired frontend, a bundled `npm`, and
opt-out telemetry that fired inside the pre-commit gate on every developer machine. See
[Package Dependencies](./package-dependencies.md) for what actually replaced it.

`CLAUDE.md`'s "Dependencies — look before you build" covers maintenance, licence and "a dependency
tree that isn't a liability". It says nothing about how to MEASURE that tree, telemetry, or
configurability — this page fills that gap.

## The rules

Before any new tool enters this repo, before an upgrade, and again after:

1. **Measure the transitive weight, not the package.** `du -sh node_modules/<scope>` after
   installing. A 2 MB package that pulls 490 MB is a 490 MB package — and if the paired repo
   installs it too, it is a 970 MB package.
2. **Prefer the library to the CLI.** A library you import has a bounded surface. A CLI drags its
   own server, UI, updater and telemetry. `@asyncapi/parser` is fine; `@asyncapi/cli` was a bundle
   of everything the org has ever shipped. When a CLI does something useful, check whether that
   thing is published on its own first — `convert`, `diff` and `optimize` all were.
3. **Grep for telemetry before adding it, and again after upgrading.** `analytics`, `telemetry`,
   `metrics`, `posthog`, `segment`, `newrelic`. **Opt-out telemetry inside a commit gate is
   disqualifying.**
    - Read the condition, not just the call. `@asyncapi/cli` skipped sending when `CI=true` — so
      it never showed up in CI, and fired on every developer machine instead.
4. **Check maintenance on the right channel.** Org health is not package health, and the `latest`
   tag is not project health either: `@asyncapi/modelina` looked abandoned on stable while
   shipping prereleases monthly. Read the release list, not the badge.
5. **Require configurability.** A linter that takes no custom ruleset becomes a linter we route
   around — which means two linters, forever. Already learned once and written down in
   `shared/contracts/spectral.asyncapi.modules.yaml`.
6. **Keep the generated artefact and its `--check` gate in code we own.** Then swapping the
   generator is a script change, not a redesign. This is the property that made the `@asyncapi/cli`
   removal a two-day fix instead of a rewrite, and it should be non-negotiable for any future
   codegen.
7. **Check what lands in `overrides`.** A transitive advisory pin is a signal about the tree above
   it, not just a version fix.
8. **Price a spec-version choice by what it makes us work around.** AsyncAPI 2.x's
   duplicate-message pattern cost this repo a dedupe set in owned code — twice, once per repo — and
   a doc section explaining it. That is the real currency, not the version number.

## Which ones actually mattered here

| Rule                              | Effect                                                                        |
| --------------------------------- | ----------------------------------------------------------------------------- |
| 1 — measure transitive weight     | Would have caught `@asyncapi/cli` at install time                             |
| 3 — grep for telemetry            | Would have caught it at install time                                          |
| 6 — own the artefact and its gate | Is why the removal was fixable at all                                         |
| 4 — check the right channel       | Would have stopped an early draft **over-reacting** once the size was noticed |

Rule 4 is the one worth remembering for its own sake: an early pass at this investigation called
`@asyncapi/modelina` abandoned and recommended ripping it out. It was shipping prereleases monthly.
**Getting the diagnosis right included correcting the alarm, not just raising one.**

## What is in `overrides`, and why

Rule 7's worked example. Every entry pins a **transitive** package — a direct dependency gets its
own range bumped instead, so nothing in `dependencies` or `devDependencies` appears here.

| Override                                 | Pins      | Closes                                                                                                                                                           |
| ---------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ip-address`                             | `^10.5.0` | SSRF/trust-boundary advisories under `express-rate-limit`                                                                                                        |
| `jsonpath-plus`                          | `^10.4.0` | two CVSS 9.8 RCEs, reaching us through `@asyncapi/modelina` → `@asyncapi/multi-parser`, which aliases two old `@asyncapi/parser` builds that still ask for `7.x` |
| `axios`                                  | `^1.20.0` | 23 advisories under `jest-openapi` → `openapi-validator`, pinned at `0.21.4`                                                                                     |
| `lodash`                                 | `^4.18.1` | prototype pollution and `_.template` code injection, via `postman-collection`'s hard pin at `4.17.21`                                                            |
| `@faker-js/faker`                        | `^10.6.0` | `helpers.fake` arbitrary code execution, for `@stoplight/prism-http`, which asks for `^10.4.0` anyway                                                            |
| `postman-collection` → `@faker-js/faker` | `5.5.3`   | nothing — it **re-opens** the advisory above, deliberately. See below                                                                                            |

### The one exception that stays open

`postman-collection` hard-pins `@faker-js/faker` at exactly `5.5.3` and calls the pre-v8
`faker.address.*` API. Forcing it to `10.x` does not degrade — it crashes on import:

```
TypeError: Cannot read properties of undefined (reading 'city')
    at postman-collection/lib/superstring/dynamic-variables.js:171
```

Every published version of `postman-collection`, the latest included, carries that same pin. There
is no upstream fix to wait for, so the scoped override is permanent rather than a placeholder.

What it costs: six `high` advisories that a bare `npm audit` reports and nobody can close, along
the chain `@stoplight/prism-cli` → `prism-http` → `@stoplight/http-spec` → `postman-collection`.

Why that is acceptable here, and the two conditions that would change it:

- **It is not in any gate.** The `audit` job runs `npm audit --omit=dev --audit-level=moderate` —
  production dependencies only — and every package in that chain is a devDependency. See the
  job's own comment in `.github/workflows/ci.yml` for why it is an alert rather than a gate.
- **The advisory is not reachable.** `helpers.fake` executes attacker-controlled template strings.
  Prism renders examples out of our own `openapi.yaml`; `npm run test:prism` boots it, asks for
  one route and stops.
- **It would change** if `prism` moved into the production image, or if the chain ever ran against
  a spec this repo does not author.

The alternative — dropping `@stoplight/prism-cli` — closes all six at the cost of `test:prism` and
the `schemathesis.yml` workflow that mocks against it. Weighed and declined: the smoke test catches
a spec whose examples do not satisfy its own schema, which no other check here does.

## If a rule keeps getting skipped

Optional, and only worth it once the rules above have actually been ignored more than once:

- A `check:dependency-weight` script asserting no scope in `node_modules` exceeds a stated budget,
  with an allowlist carrying a reason per entry — the `FRONTEND_PAIRING` idiom.
- A `check:no-telemetry` grep over `node_modules` for the strings in rule 3.

Write the page first and see whether it holds. A gate over `node_modules` is noisy, and as of this
page's writing, this is the first time in the repo's life the rules here were broken.

## Related pages

- [Package Dependencies](./package-dependencies.md)
- [AsyncAPI Workflow](../api/asyncapi-workflow.md)
