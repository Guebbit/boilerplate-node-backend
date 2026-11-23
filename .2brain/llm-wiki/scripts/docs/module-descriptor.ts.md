---
source: scripts/docs/module-descriptor.ts
generated_at: 2026-11-22T02:04:53.919271+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/docs/module-descriptor.ts

## Purpose
Provides one typed reader for a module's `module.yaml`. It is shared by the docs generator that colours the module graph and by the cross-cutting test that checks every descriptor is well-formed. Keeping a single parse and schema stops two hand-rolled readers from drifting apart when a field is added.

## Key elements
- `moduleDescriptorSchema`: a strict zod object, so unknown keys are rejected. Fields:
  - `summary`: non-empty string, a one-sentence description for the docs index and sidebar.
  - `subdomain`: one of `core`, `supporting`, `generic`.
  - `group`: one of `foundation`, `shop`, `example`. The `foundation-cannot-reach-shop` and `nothing-reaches-example` rules in `.dependency-cruiser.cjs` read this field.
  - `dependsOn`: array of strings.
  - `rateLimits`: optional, validated by `rateLimitsBlockSchema`.
  - `jobs`: optional, validated by `jobsBlockSchema`.
- `ModuleDescriptor`: the type inferred from the schema.
- `readModuleDescriptor(descriptorPath)`: reads the file synchronously, parses the YAML and validates it against the schema. Throws if validation fails.
- `readAllModuleDescriptors(modulesRoot)`: returns a `Record<string, ModuleDescriptor>` keyed by folder name. It covers every folder under `modulesRoot` that has a `module.yaml`, in alphabetical order.

## Relationships
- `scripts/modules-on-disk.ts`: `readAllModuleDescriptors` uses its `modulesWith(modulesRoot, 'module.yaml')` to find the module folders.
- `src/infrastructure/config/shared-rules/jobs.ts` and `rate-limits.ts`: supply `jobsBlockSchema` and `rateLimitsBlockSchema`, which this file embeds. Those blocks are defined in the shared rules, not here.
- `scripts/docs/generate-module-graph.ts` and `scripts/docs/module-catalog.ts`: the docs-side consumers of the descriptors.
- `tests/cross-cutting/module-descriptors.test.ts` and `tests/unit/scripts/docs/module-descriptor.test.ts`: tests that exercise the schema and readers.
- `scripts/scaffold/options.ts`, `scripts/testing/demo-module-names.ts`, `tests/unit/scripts/modules/new-module-needs-nothing.test.ts` and `tests/unit/scripts/scaffold/plan.test.ts`: related through the dependency graph. The file itself does not show how they use it.

## Notes
- The schema is `.strict()` by design: an extra key is treated as a typo or a misunderstanding of what `module.yaml` is for.
- `modulesRoot` can be the real `src/modules` directory or a scratch copy, which is useful for tests.
- Per the comments, `npm run regenerate` generates `<module>/rate-limits.generated.ts` and `<module>/jobs.generated.ts` from the `rateLimits` and `jobs` blocks. That generation happens elsewhere, not in this file.
- The stated goal is that adding a module edits only its own folder and `src/modules.ts`, since the hand-kept tables read from these descriptors.
