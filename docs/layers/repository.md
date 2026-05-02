# Repository

Repositories live in `src/repositories/` and are the **only** layer allowed to import Mongoose models and execute queries.

## Responsibilities

- Build and execute Mongoose queries
- Return raw documents (or `.lean()` plain objects)
- Accept pre-validated filter/pagination parameters — no validation here

## Standard methods

Every repository exposes a consistent set of methods:

| Method                                 | Description                               |
| -------------------------------------- | ----------------------------------------- |
| `findById(id)`                         | Fetch one document by `_id`               |
| `findOne(filters)`                     | Fetch the first document matching filters |
| `findAll({ filters, page, pageSize })` | Paginated list                            |
| `count(filters)`                       | Count matching documents                  |
| `create(data)`                         | Insert a new document                     |
| `update(id, data)`                     | Update a document by `_id`                |
| `delete(id)`                           | Remove a document by `_id`                |

## Example

```ts
// src/repositories/products.ts
export const productRepository = {
    findAll({ filters = {}, page = 1, pageSize = 20 }) {
        const offset = (page - 1) * pageSize;
        return productModel.find(filters).skip(offset).limit(pageSize).lean();
    },
    create(data: Partial<IProductDocument>) {
        return productModel.create(data);
    }
};
```

## Why `.lean()`?

`.lean()` tells Mongoose to return plain JavaScript objects instead of full Mongoose document instances. This is significantly faster for read-only data because it skips hydration, getters, and virtuals. Use full documents only when you need to call instance methods (e.g. `user.tokenAdd()`).
