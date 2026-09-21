#!/usr/bin/env tsx
/**
 * Downloads `mongodb-memory-server`'s own mongod binary once, so every shard job in
 * `.github/workflows/mutation.yml` can restore it from cache instead of downloading it itself —
 * see that workflow's own comment for why concurrent downloads were silently stalling CI.
 *
 * A real script rather than an inline `node -e` one-liner in the workflow YAML: the one-liner's
 * failure mode (2026-09-21) was exactly the kind a real script surfaces and a silent inline
 * command does not — it "succeeded" in under a second, produced no output at all, and left
 * `~/.cache/mongodb-binaries` empty. Every stage below logs, and a failure exits non-zero loudly
 * instead of leaving the workflow to discover it only when a shard job downloads all over again.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';

const main = async (): Promise<void> => {
    console.log('[warm-mongo-cache] requesting a MongoMemoryServer instance...');
    const server = await MongoMemoryServer.create();
    console.log(`[warm-mongo-cache] ready at ${server.getUri()}`);

    await server.stop();
    console.log(
        '[warm-mongo-cache] stopped — binary is now cached under ~/.cache/mongodb-binaries'
    );
};

main().catch((error: unknown) => {
    console.error('[warm-mongo-cache] failed:', error);
    process.exitCode = 1;
});
