export * from '@api/models';

// Re-export generated AsyncAPI types so consumers use a single import path. The `.generated`
// suffix names what the file is — `npm run gen:asyncapi` writes it from `asyncapi.yaml` — and
// matches what the paired frontend already calls its own copy (`realtime.generated.ts`).
export * from './asyncapi.generated';

// Auth context DTO (DIP: transport-safe user representation)
export type { AuthContext } from './auth-context';
