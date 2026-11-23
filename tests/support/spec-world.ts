/**
 * The rows a spec-driven request can name, and the URL that names them.
 *
 * Shared by the fuzz suite and the write-operation contract walk: both take a templated path from
 * `openapi.yaml` and need `{id}` to mean something that exists, so a handler runs past its 404.
 *
 * Module-agnostic: nothing here names a module. Each module that owns a row a path can name ships
 * `src/modules/<name>/tests/spec-world.ts` (a {@link SpecWorldContribution}), found from disk, so
 * a module removed with `demo:remove` takes its seeder along and the sweeps keep running on what
 * is left.
 *
 * @see docs/build/module-removal.md#what-demo-remove-does-about-the-residue
 */
import { randomUUID } from 'node:crypto';
import type { UserDocument } from '@modules/users';
import { modulesWith } from '../../scripts/modules-on-disk';
import { MODULES_ROOT } from './paths';
import type { Operation } from './spec-walk';

/** A syntactically valid ObjectId nothing holds — for a path whose resource kind is not seeded. */
export const OBJECT_ID = '65dc8a99604c307b702b5ccc';

/**
 * The rows a fuzzed path can name, created fresh for each operation: each contribution's `key`
 * (`productId`, `orderId`, `userId`, ...) mapped to the id of the row it seeded. Only the keys of
 * the modules this checkout still has are present.
 */
export type World = Record<string, string>;

/**
 * What one module adds to the world: the row it owns, how to seed it, and which path parameters
 * and URL prefixes name it.
 */
export interface SpecWorldContribution {
    /** The {@link World} key the seeded row's id is stored under (`productId`). */
    key: string;
    /** Keys that must be seeded first; their ids are in `world` when {@link seed} runs. */
    needs?: string[];
    /**
     * Create one row and return its id. Per operation, because every test starts on an empty database.
     *
     * @param owner - the account the first pass runs as, for a row that belongs to someone
     * @param world - the rows seeded so far, the ones {@link needs} names among them
     */
    seed: (owner: UserDocument, world: World) => Promise<string>;
    /** Path-parameter names that always mean this row, wherever they appear. */
    parameters?: string[];
    /** Templated-path prefixes whose parameters (`{id}` included) mean this row. */
    pathPrefixes?: RegExp[];
    /** Fixed values for path parameters that name this module's vocabulary, not a row. */
    literals?: Record<string, string>;
}

/**
 * Every module's contribution, discovered from the `spec-world.ts` each one ships in its `tests/` folder.
 * Loaded once: the files do not change within a run.
 */
let contributions: Promise<SpecWorldContribution[]> | undefined;

/**
 * The contributions a world was seeded from, so {@link buildUrl} can ask them which row a path
 * parameter means without the world itself carrying anything but ids (the sweeps pass its values
 * on as fuzz seeds).
 */
const seededFrom = new WeakMap<World, SpecWorldContribution[]>();

/**
 * Whether a loaded file exports a usable {@link SpecWorldContribution} as `specWorld`.
 * @param loaded - the module namespace `import()` returned
 */
const hasContribution = (loaded: unknown): loaded is { specWorld: SpecWorldContribution } =>
    typeof loaded === 'object' &&
    loaded !== null &&
    'specWorld' in loaded &&
    typeof loaded.specWorld === 'object' &&
    loaded.specWorld !== null &&
    'seed' in loaded.specWorld &&
    typeof loaded.specWorld.seed === 'function';

/**
 * Load every module's contribution. A file that does not export one is a mistake worth failing on:
 * the module said it contributes and does not.
 *
 * @throws {Error} naming the module whose `spec-world.ts` has no `specWorld` export
 */
const loadContributions = (): Promise<SpecWorldContribution[]> => {
    contributions ??= Promise.all(
        modulesWith(MODULES_ROOT, 'tests/spec-world.ts').map((name) =>
            // `import()` with a computed specifier: jest's CJS runtime resolves it through `moduleNameMapper`.
            import(`@modules/${name}/tests/spec-world`).then((loaded: unknown) => {
                if (!hasContribution(loaded))
                    throw new Error(`${name}/tests/spec-world.ts exports no \`specWorld\``);
                return loaded.specWorld;
            })
        )
    );
    return contributions;
};

/**
 * Seed every module's row, each after the rows it `needs`, and return the ids.
 *
 * @param owner - who the rows belong to (the admin the first pass runs as)
 * @throws {Error} when a contribution needs a key no module seeds
 */
export const seedWorld = async (owner: UserDocument): Promise<World> => {
    const world: World = {};
    let pending = await loadContributions();
    seededFrom.set(world, pending);
    while (pending.length > 0) {
        const ready = pending.filter((entry) => (entry.needs ?? []).every((key) => key in world));
        if (ready.length === 0)
            throw new Error(
                `spec-world: ${pending.map((entry) => entry.key).join(', ')} need rows no module seeds`
            );
        // In order: a later row reads the ids of the earlier ones.
        for (const entry of ready) world[entry.key] = await entry.seed(owner, world);
        pending = pending.filter((entry) => !ready.includes(entry));
    }
    return world;
};

/** Fixed values for the path parameters that are not ids and belong to no module's rows. */
const LITERAL_PARAMETERS: Record<string, string> = {
    locale: 'en',
    method: 'totp',
    provider: 'fake',
    // An app this deployment serves — an unknown one is refused before the body is read.
    app: 'demo-be'
};

/**
 * The value for one path parameter: a literal where the spec's vocabulary is fixed, the seeded row
 * whose kind the path names, and a well-formed id nothing holds otherwise — a 404 is a fine
 * outcome, a 500 is not.
 *
 * @param path - the templated path, which says what kind of row `{id}` is
 * @param world - the rows seeded for this operation
 */
const parameterValue = (path: string, name: string, world: World): string => {
    if (name in LITERAL_PARAMETERS) return LITERAL_PARAMETERS[name];
    if (name.toLowerCase().includes('token')) return 'tok';
    const owners = seededFrom.get(world) ?? [];
    const literal = owners.find((entry) => entry.literals && name in entry.literals);
    if (literal?.literals) return literal.literals[name];
    const owner = owners.find(
        (entry) =>
            (entry.parameters ?? []).includes(name) ||
            (entry.pathPrefixes ?? []).some((prefix) => prefix.test(path))
    );
    return owner ? world[owner.key] : OBJECT_ID;
};

/**
 * A legal value for every header the operation requires. A fresh value each call: the only
 * required header today is `Idempotency-Key`, and a reused one replays or mismatches.
 */
export const requiredHeadersOf = (operation: Operation): Record<string, string> =>
    Object.fromEntries(operation.requiredHeaders.map((name) => [name, randomUUID()]));

/**
 * Fill every path parameter from {@link parameterValue}.
 * @param world - a world {@link seedWorld} returned: a hand-built one names no module's rows
 */
export const buildUrl = (operation: Operation, world: World): string => {
    let url = operation.path;
    for (const name of operation.pathParameters)
        url = url.replace(`{${name}}`, () => parameterValue(operation.path, name, world));
    return url;
};
