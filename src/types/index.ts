export * from '@api/models';

// Re-export generated AsyncAPI types so consumers use a single import path. The file is named
// after the spec it comes from — `npm run gen:asyncapi` writes it from `asyncapi.yaml` — and the
// paired frontend names its own the same way, from its own copy of the shared half.
export * from './asyncapi.generated';

// Auth context DTO (DIP: transport-safe user representation)
export type { AuthContext, Caller } from './auth-context';
