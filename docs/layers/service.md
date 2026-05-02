# Service

Services live in `src/services/` and contain all business logic. They sit between the controller (HTTP) and the repository (database), so they know nothing about HTTP and nothing about query syntax.

## Responsibilities

- Validate and coerce input with Zod
- Apply permission-based filters (e.g. hide soft-deleted items from non-admins)
- Orchestrate multiple repository calls when needed
- Throw `ExtendedError` with a meaningful HTTP code on failure

## Example

```ts
// src/services/products.ts
export const productService = {
    async search(params: IProductSearchParams, user?: IUserDocument) {
        const { page, pageSize, text } = zodProductSearchSchema.parse(params);

        const filters: FilterQuery<IProductDocument> = {};

        // Non-admins only see active, non-deleted products
        if (!user?.admin) {
            filters.active = true;
            filters.deletedAt = null;
        }

        if (text) {
            filters.$text = { $search: text };
        }

        const [items, total] = await Promise.all([
            productRepository.findAll({ filters, page, pageSize }),
            productRepository.count(filters)
        ]);

        return { items, total };
    }
};
```

## Validation with Zod

Input is validated at the service boundary, not in the controller. This keeps validation logic reusable and co-located with the business rules that depend on it.

```ts
const zodProductSearchSchema = z.object({
    page: z.coerce.number().int().positive().default(1),
    pageSize: z.coerce.number().int().positive().max(100).default(20),
    text: z.string().optional()
});
```

## Error handling

Services throw `ExtendedError` (from `src/utils/helpers-errors.ts`) with an HTTP code attached. The Express error handler picks this up and sends the appropriate response — the service itself never touches `res`.

```ts
throw new ExtendedError('Product not found', 404);
```
