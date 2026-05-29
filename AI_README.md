# AI README

Repo = node backend boilerplate.
This repo = `api-mongodb-mongoose` flavor.
Single package. REST API. Express. MongoDB. Mongoose.

## Code brain

- Keep code SOLID.
- Keep code DRY.
- Keep code KISS.
- Future proof beats clever.
- Small layers: route -> middleware -> controller -> service -> repository -> model.
- `openapi.yaml` first. Contract and types start there.
- Prefer promise chaining when readable.
- Avoid `async` / `await` + `try/catch` unless necessary.
- Comments short. ADHD friendly. Explain function/constant/block fast.
- **All functions and important code blocks must have a JSDoc comment** in multi-line `/* \n * ... \n */` block format (not `/** */`). Include `@param` and `@returns` where useful. One line per tag.
- Do not dump long essays in code comments. Put detail in docs.

## Docs brain

- Docs stay short.
- Docs stay visual.
- Use Mermaid when flow/map helps.
- Home page says what is special in this repo.
- Sections stay split: Theory / Tools / API.
- Link pages to each other when named.
- OpenAPI tools live in API docs, not Tools docs.
- No page per tiny request/response shape. Spec already holds that.

## Change brain

- Boilerplate is example, not product lore.
- Change little, but keep flow complete.
- Do not break contract without updating `openapi.yaml` (API the source of truth).
- Keep observability and security wiring intact.
- **Never** create backward-compatibility shims, legacy aliases, or transitional code unless explicitly requested. Fix forward; remove old code immediately.
- If behavior, API, setup, architecture, scripts, workflows, or developer instructions change, update the relevant documentation in the same task.
- Do not finish a task with code and documentation out of sync.
