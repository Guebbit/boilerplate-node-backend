# Error Handling

## ExtendedError

`src/utils/helpers-errors.ts` provides `ExtendedError`, a subclass of `Error` with extra fields:

```ts
class ExtendedError extends Error {
    httpCode: number; // HTTP status to send to the client
    isOperational: boolean; // true = expected error, false = bug
    errors: string[]; // list of user-facing messages
}
```

Throw it anywhere in the service or repository layer:

```ts
throw new ExtendedError('User not found', 404);
throw new ExtendedError('Validation failed', 422, ['email is required']);
```

## Express error handler

The global error handler in `src/app.ts` catches everything — including unhandled promise rejections from async controllers — and calls `rejectResponse()`:

- **Operational errors** (`isOperational: true`): send `httpCode` + `errors` to the client.
- **Non-operational errors** (unexpected bugs): log the stack trace, send a generic 500.

This means controllers and services never need to catch-and-respond manually; they just throw.

## Response envelope

Every response — success or failure — uses the same envelope:

```json
// Success
{ "success": true, "status": 200, "data": { … } }

// Failure
{ "success": false, "status": 404, "message": "User not found", "errors": ["…"] }
```

This makes frontend error handling uniform regardless of the endpoint.

## Logging

Errors are logged with Winston (`src/utils/winston.ts`). Non-operational errors include the full stack trace. Each log line carries the `requestId` so you can correlate errors across distributed logs.

## Async controller wrapper

Express 5 natively propagates promise rejections to the error handler, so no `asyncWrapper` helper is needed. Any `async` controller that throws will be caught automatically.
