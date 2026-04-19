# Controller

Controllers live in `src/controllers/` with one file per HTTP action (e.g. `get-products.ts`, `post-login.ts`). They are the only layer that handles HTTP concepts.

## Responsibilities

- Parse request inputs (`req.query`, `req.body`, `req.params`, `req.file`)
- Call the appropriate service method
- Return a response via `successResponse()` or `rejectResponse()`

## What controllers must NOT do

- Business logic
- Database queries
- Input validation (beyond trivial presence checks)

## Example

```ts
// src/controllers/products/get-products.ts
import { productService } from '@services/products';
import { successResponse } from '@utils/response';

export const getProducts = async (req: Request, res: Response) => {
    const { page, pageSize, text } = req.query;
    const result = await productService.search({ page, pageSize, text }, req.user);
    return successResponse(res, result);
};
```

## Response helpers

`src/utils/response.ts` provides two helpers that enforce the response envelope:

```ts
// 200 OK
successResponse(res, data, 'Optional message');

// 4xx / 5xx
rejectResponse(res, error);
```

Both produce:

```json
{
    "success": true | false,
    "status": 200,
    "message": "...",
    "data": { ... }
}
```

## File uploads

Controllers that accept file uploads receive the file via `req.file` (set by Multer). The `WithFileUpload<T>` utility type extends the request type to include this field:

```ts
export const writeProduct = async (req: Request & WithFileUpload<IProductBody>, res: Response) => {
    const imageUrl = req.file?.path;
    …
};
```
