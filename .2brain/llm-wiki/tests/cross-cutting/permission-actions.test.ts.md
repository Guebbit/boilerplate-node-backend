---
source: tests/cross-cutting/permission-actions.test.ts
sha256: 0cf53fb67197e45da706d8d933e667bad297df536f98dd21e4d088a572cf3fe0
generated_at: 2026-10-15T12:39:30.511279+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/permission-actions.test.ts

## Purpose

Guard-test for the permission-action vocabulary chain. The single source of truth is `shared/authorization-keys.yaml`; `api/permission-actions.ts` is generated from it; `kernel/permissions.ts` consumes the generated export. This test pins both ends of that chain together so the list is never re-typed a second time.

## Key elements

- **`yamlActions`** – Reads and parses `shared/authorization-keys.yaml` at test time, extracting the `actions: string[]` field. Used as the ground truth in every assertion.
- **`REPO_ROOT`** – Resolves the repository root relative to this test file (`../../`), enabling the yaml and kernel source to be read from disk regardless of cwd.
- **`describe('permission actions', …)`** – Three tests:
  - *Exactly what the yaml declares* – `PERMISSION_ACTIONS` (from `@api/permission-actions`) must equal `yamlActions` element-for-element.
  - *Cover every declared key's action* – Each entry in `PERMISSION_KEYS` (from `@kernel/permissions`) must have its `.action` present in `yamlActions`.
  - *Not typed a second time in the kernel* – Asserts the raw source of `kernel/permissions.ts` contains neither a `PERMISSION_ACTIONS =` assignment nor any hardcoded action string (beyond the four CRUD verbs `read`, `create`, `update`, `delete`, which are exempted).

## Relationships

- **`src/kernel/permissions.ts`** – The test imports `PERMISSION_KEYS` from it at runtime *and* reads its source file as a string to assert the kernel does not re-declare or hardcode the action vocabulary. This is the "second end" of the chain the file's header comment describes.

## Notes

- The third test is a **source-level** assertion (regex / `toContain` on the file's text), not a runtime behavior check. It will pass as long as the kernel file's textual content satisfies the patterns; it does not exercise any kernel code path.
- The CRUD verbs (`read`, `create`, `update`, `delete`) are excluded from the "no hardcoded string" check, implying the kernel is allowed to reference those four names directly (e.g., in Zod schema definitions) without it being considered a re-typing of the full list.
- The test reads files at execution time, so a missing yaml or kernel file will fail with a filesystem error rather than a clear assertion message.
