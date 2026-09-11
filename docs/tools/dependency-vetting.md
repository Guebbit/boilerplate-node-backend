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
