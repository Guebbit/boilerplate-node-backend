# Model

Models live in `src/models/` and are the single source of truth for document structure. Each model file contains three things:

## 1. TypeScript interface

Extends Mongoose's `Document` to provide typed access to document fields and instance methods:

```ts
export interface IProductDocument extends Document {
    title: string;
    price: number;
    active: boolean;
    deletedAt?: Date;
}
```

## 2. Mongoose schema

Defines the MongoDB document structure, defaults, and instance methods:

```ts
const productSchema = new Schema<IProductDocument>(
    {
        title: { type: String, required: true },
        price: { type: Number, required: true },
        active: { type: Boolean, default: true },
        deletedAt: { type: Date }
    },
    { timestamps: true }
);
```

## 3. Zod schema (optional)

Some models expose a Zod schema used by the service layer for input validation:

```ts
export const zodProductSchema = z.object({
    title: z.string().min(1),
    price: z.number().positive(),
    active: z.boolean().optional()
});
```

This keeps validation co-located with the data shape rather than scattered across controllers.

## Instance methods

Models with complex behaviour (e.g. `User`) define instance methods on the schema:

```ts
userSchema.methods.tokenAdd = function (token: string, type: ETokenType) { … };
userSchema.methods.tokenRemoveAll = function () { … };
```

These are typed through Mongoose's generic parameters and callable on any retrieved document.
