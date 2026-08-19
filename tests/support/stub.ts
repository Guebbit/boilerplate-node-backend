/**
 * The one sanctioned cast for hand-built test stubs.
 *
 * A stub can never structurally satisfy the framework type it stands in for — `Request` and
 * `Response` carry hundreds of members, a `CastError` is built by Mongoose itself — so SOME cast
 * is unavoidable. What is avoidable is `as unknown as T` scattered through every suite: a spelling
 * that erases the type system's objection instead of answering it, and gives a reviewer nothing
 * to search for. This helper is that answer, once, behind a name that says what the value is.
 *
 * `no-restricted-syntax` bans the inline double cast everywhere; this file is the only place the
 * conversion happens. If a stub grows enough to be wrong here, it is wrong in one place.
 */
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- the type parameter IS the call site's declaration: asStub<Request>(stub)
export const asStub = <T extends object>(value: unknown): T => value as T;
