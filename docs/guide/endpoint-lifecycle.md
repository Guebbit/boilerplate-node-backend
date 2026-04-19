# Endpoint Lifecycle

This page traces the full path of an HTTP request through every layer of the boilerplate.

```
Request
  └─▶ Route (routes/)
        └─▶ Middleware (auth, rate-limit)
              └─▶ Controller (controllers/)
                    └─▶ Service (services/)
                          └─▶ Repository (repositories/)
                                └─▶ Model / MongoDB
```

---

## 1. OpenAPI (contract)

Before writing any code, the endpoint is declared in `openapi.yaml`:

```yaml
/products:
    get:
        summary: List products
        parameters:
            - $ref: '#/components/parameters/PageParam'
        responses:
            '200':
                content:
                    application/json:
                        schema:
                            $ref: '#/components/schemas/ProductListResponse'
```

Running `npm run genapi` generates TypeScript types in `/api/` from this spec.

---

## 2. Route

`src/routes/products.ts` mounts the controller on a path and applies middlewares:

```ts
router.get('/', getAuth, getProducts); // public — auth optional
router.post('/', isAuth, isAdmin, writeProducts); // admin only
```

---

## 3. Middleware

Middlewares run before the controller. The main ones are:

- `getAuth` — populates `req.user` if a valid token is present (non-blocking)
- `isAuth` — blocks with 401 if the request is unauthenticated
- `isAdmin` — blocks with 403 if the user is not an admin

---

## 4. Controller

`src/controllers/products/get-products.ts` is responsible only for HTTP concerns:

```ts
export const getProducts = async (req: Request, res: Response) => {
    const { page, pageSize, text } = req.query;
    const { items, total } = await productService.search({ page, pageSize, text }, req.user);
    return successResponse(res, { items, total });
};
```

It parses inputs, calls the service, and formats the response. No business logic here.

---

## 5. Service

`src/services/products.ts` holds business logic:

- Validates and coerces input with Zod
- Applies permission-based filters (hide soft-deleted items from non-admins)
- Orchestrates one or more repository calls
- Returns plain data (no HTTP concepts)

---

## 6. Repository

`src/repositories/products.ts` is the only layer that talks to MongoDB:

```ts
findAll({ filters, page, pageSize }) {
    return productModel.find(filters).skip(offset).limit(pageSize).lean();
}
```

No business logic — just query construction and execution.

---

## 7. Model

`src/models/products.ts` defines the Mongoose schema and TypeScript interface:

```ts
const productSchema = new Schema<IProductDocument>({
    title: { type: String, required: true },
    price: { type: Number, required: true },
    active: { type: Boolean, default: true },
    deletedAt: { type: Date } // soft delete
});
```

---

## 8. Response

The controller calls `successResponse()` or `rejectResponse()` which wrap the data in a consistent envelope:

```json
{
    "success": true,
    "status": 200,
    "data": { "items": [...], "total": 42 }
}
```

Errors follow the same shape with `"success": false` and an `"errors"` array.
