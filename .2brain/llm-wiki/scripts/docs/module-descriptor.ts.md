---
source: scripts/docs/module-descriptor.ts
sha256: 6c10d9ec8817ebc678fd59b6120fa49b1bf2c78b4d2027c8db23b40967b65597
generated_at: 2026-09-23T17:26:08.142431+00:00
model: ollama:qwen3.8:27b
---

# scripts/docs/module-descriptor.ts

## Purpose

Provides a single, shared typed reader for a module's `module.yaml` file. It exists so that the docs generator (which colours the module graph) and the cross-cutting validation test both go through one parse-and-validate path, preventing drift that would occur if each maintained its own hand-rolled parsing.

## Key elements

- **`moduleDescriptorSchema`** — A Zod `.strict()` object schema accepting exactly two keys: `subdomain` (enum: `"core" | "supporting" | "generic"`) and `dependsOn` (array of strings). Any additional key causes validation to fail.
- **`ModuleDescriptor`** — The TypeScript type inferred from the schema (`z.infer`); represents a validated descriptor.
- **`readModuleDescriptor(descriptorPath: string)`** — Reads the file at `descriptorPath` with `readFileSync`, parses it as YAML (via the `yaml` package), and validates against `moduleDescriptorSchema`. Throws a Zod error if the content doesn't conform.

## Relationships

- **`scripts/docs/generate-module-graph.ts`** — Consumes `readModuleDescriptor` / `ModuleDescriptor` to obtain each module's `subdomain` and `dependsOn` for colouring and edge-building in the module graph.
- **`tests/cross-cutting/module-descriptors.test.ts`** — Calls `readModuleDescriptor` across all modules to assert every `module.yaml` is well-formed, using the same schema as the docs pipeline.

## Notes

- The schema is **strict**: adding any new key to a `module.yaml` will throw at read time. If you need a new field, update `moduleDescriptorSchema` here first — it is the single source of truth for the shape.
- `readModuleDescriptor` is synchronous (`readFileSync`); call sites should account for that when choosing where to invoke it.
