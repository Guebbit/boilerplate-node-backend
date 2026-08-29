# src/modules/feedback/module.ts

## Purpose

Declares the feedback module's registration metadata (name, base path, routes, locales) so the kernel can mount a generic contact-and-triage endpoint. It is intentionally a leaf in both dependency directions — it neither reads from nor writes to any other module's data — because the form must remain accessible to unauthenticated visitors and must not couple to the `users` module.

## Key elements

- **default export** — an object satisfying `AppModule` with:
  - `name: 'feedback'` — module identifier.
  - `subdomain: 'generic'` — marks it as a non-domain-specific utility module.
  - `basePath: '/feedback'` — URL prefix under which routes are mounted.
  - `routes` — re-exported from `./routes`; the actual request handlers.
  - `locales` — filesystem path to the module's i18n strings.

## Relationships

- **`src/kernel/registry.ts`** — supplies the `AppModule` type that this file's export must satisfy (type-only import).
- **`src/modules.ts`** — imports this module (among others) to assemble the full module list the kernel boots.
- **`src/modules/feedback/routes.ts`** — the sole runtime dependency; provides the `router` instance embedded in the module definition.

## Notes

- The `satisfies AppModule` keyword is used (not a plain annotation), so the literal shape is preserved for downstream consumers while still enforcing the interface.
- The module deliberately stores a free-form email address rather than a user FK. Deleting a user account therefore has no effect on existing feedback records — there is no foreign-key relationship to `users` to enforce.
- `locales` uses `__dirname` + `path.join`, so it resolves relative to the build output directory at runtime, not the source tree.
