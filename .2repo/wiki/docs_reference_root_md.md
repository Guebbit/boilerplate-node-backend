# docs/reference/root.md

## Purpose

A reference catalogue of every file that lives directly in the repository root. It exists to answer "why is this file here and what does it do?" in one glance, with a pointer to deeper documentation for each entry. It groups root files by concern (entry points, package/TS, lint, test runners, codegen, Git) so a reader does not have to open `package.json`, `eslint.config.ts`, or `migrate-mongo-config.js` individually to understand their roles.

## Key elements

- **The way in** — `README.md`, `.env-example`, `LICENSE`: the human entry points to the repo.
- **Package and TypeScript** — `package.json`, `package-lock.json`, `tsconfig.json`, `tsconfig.jest.json`: dependency surface and compiler/alias configuration.
- **Lint and format** — `eslint.config.ts`, `.prettierrc`, `.prettierignore`, `commitlint.config.cjs`: formatting and commit-message rules.
- **Test runners** — `jest.config.js`, `jest.config.mutation.js`, `stryker.config.json`: unit and mutation test configuration.
- **Code generation and data** — `orval.config.ts`, `migrate-mongo-config.js`: OpenAPI-to-TypeScript codegen and Mongo migration settings.
- **Git** — `.gitignore`: what is excluded from version control (content truncated in source).

## Relationships

- **`docs/reference/index.md`** — Sibling page in the same reference section; `root.md` is one of the pages linked from that index.
- **`package.json`** — Documented here as the single source of all `npm run` scripts; the "Read next" column points to `../tools/package-dependencies.md` and `../tools/package-scripts.md` for details.
- **`orval.config.ts`** — Documented here as the Orval codegen entry point; its output paths (`api/models/`, `api/schemas.zod.ts`) are the contract between the OpenAPI spec and the application code.
- **`migrate-mongo-config.js`** — Documented here as the `migrate-mongo` CLI's named config; explicitly noted as CommonJS because the tool loads it without a TypeScript chain, forcing it to re-implement URI resolution rather than import the app's.

## Notes

- This is a **documentation page**, not executable code. It contains no functions, exports, or imports of its own.
- The `eslint.config.ts` entry emphasises that four-tier import boundaries are *enforced by tooling*, not by convention — a relevant detail for AI assistants deciding whether to add cross-tier imports.
- `tsconfig.jest.json` extends `tsconfig.json`; a path-alias change in the parent silently affects the test run.
- The `.prettierignore` entry warns that reformatting generated files (e.g. `openapi.yaml`) will fail checks on files nobody edited.
