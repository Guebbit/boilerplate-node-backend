# Routes & Middlewares

## Routes

Route files in `src/routes/` mount controllers on HTTP verbs and paths, and apply the right middleware stack for each endpoint.

```ts
// src/routes/products.ts
import { getAuth, isAuth, isAdmin } from '@middlewares/authorizations';
import { getProducts } from '@controllers/products/get-products';
import { writeProducts } from '@controllers/products/write-products';

router.get('/', getAuth, getProducts); // public — auth optional
router.post('/', isAuth, isAdmin, writeProducts); // requires admin
router.put('/:id', isAuth, isAdmin, writeProducts);
router.delete('/:id', isAuth, isAdmin, deleteProducts);
```

All routers are mounted in `src/routes/index.ts` under their respective path prefixes.

## Auth middlewares

Defined in `src/middlewares/authorizations.ts`:

| Middleware | Behaviour                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------ |
| `getAuth`  | Tries to decode the JWT; populates `req.user` if valid. Non-blocking — continues even without a token. |
| `isAuth`   | Requires a valid token. Returns **401** if missing or invalid.                                         |
| `isAdmin`  | Requires `req.user.admin === true`. Returns **403** otherwise. Must be used after `isAuth`.            |

## JWT middleware

`src/middlewares/auth-jwt.ts` handles token creation and validation:

- **Access token** — short-lived JWT sent in the `Authorization: Bearer` header.
- **Refresh token** — long-lived JWT sent as a `HttpOnly` cookie. Used to obtain new access tokens without re-login.
- On every authenticated request the middleware verifies the access token; if expired it automatically attempts a refresh using the cookie.

## Security middleware

`src/middlewares/security.ts` applies:

- **Helmet** — sets secure HTTP headers.
- **express-rate-limit** — 100 requests per 15 minutes per IP by default.
- **CSRF sync** — CSRF token validation for non-GET requests (when using session-based flows).

## File uploads

Routes that accept files use Multer:

```ts
import { upload } from '@utils/multer';

router.post('/', isAuth, isAdmin, upload.single('image'), writeProducts);
```
