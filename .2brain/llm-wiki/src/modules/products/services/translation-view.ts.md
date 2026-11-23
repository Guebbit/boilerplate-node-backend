---
source: src/modules/products/services/translation-view.ts
source_sha256: 37da838e5816cfc07333273e7ce75f0666b6b0772314d5ca46354e54721bc896
context_sha256: bbc40100d9610f9414a22c07d0f1e29ce97cf9eeff03383b09500093a42e45f5
generated_at: 2026-11-22T07:14:33.870998+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/services/translation-view.ts

## Purpose
Decides who may see every language of a product. The editor's tabs need each locale's copy, drafts included, which is more than the resolved `title`/`description` a shopper reads. So the full `translations` view is limited to callers holding `read:Translation`.

## Key elements
- `canSeeTranslations(caller?: Caller): boolean`: the only export. It returns a boolean that is positive only when `caller` is defined and `holds(caller, 'read', 'Translation')` passes. An anonymous (`undefined`) caller never passes the check.

## Relationships
- **`@kernel/ability` (`src/kernel/ability.ts`)**: supplies `holds`, which performs the permission check.
- **`@types` (`src/types/index.ts`, `src/types/auth-context.ts`)**: supplies the `Caller` type, imported as a type only. The file does not import `auth-context.ts` directly.
- **`src/modules/products/routes.ts` and `src/modules/products/services/read.ts`**: neighbors in the dependency graph. This file does not import them, and nothing in it shows how they call it.

## Notes
- It checks the read rule `read:Translation` and never a write key such as `update:Product`, because reading and writing are separate grants.
- The check is a pure predicate with no side effects.
- The `@param` doc describes the argument as the request's caller, or `undefined` for an anonymous request.
