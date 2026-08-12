# Seed fixture images

The demo images `db/seeds/index.ts` points its products and users at. They are **repository
content**, not runtime data: they are committed, and the seeder's `imageUrl`s reference them by
name.

Everything else under `public/images/` is a runtime upload written by
`resolveUploadDestination` (`src/infrastructure/adapters/storage.ts`), and `.gitignore` drops it. That is
the only reason this subdirectory exists — one rule can then ignore uploads without needing to
enumerate which files are fixtures, and adding a fixture does not mean editing `.gitignore`.

Referenced as `/images/seed/<name>.jpg`, served by the `express.static` mount in `src/app.ts`.
