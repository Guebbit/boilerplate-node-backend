/**
 * Everything a module page states about its module, gathered from the running code.
 *
 * Nothing here is transcribed by hand: the manifest, the express router, the Mongoose schema and
 * the contract fragment already hold these facts, and a second copy in prose is a copy that goes
 * quietly wrong. `docs/reference/src-modules.md` used to carry one and said so in its own text.
 *
 * See: docs/theory/modules.md#the-manifest
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { Router } from 'express';
import type { Probe } from '@guebbit/openapi-runnable-collections';
import type { AppModule, ContextEdge } from '@kernel/registry';
import { shapeOf } from './shapes';

/** Absolute path of `src/modules`. */
export const MODULES_DIR = path.resolve(__dirname, '../../src/modules');

/**
 * One mongoose schema path, in the fields a page reports.
 *
 * A structural description rather than mongoose's own `SchemaType`: what this file needs is the
 * subset a table cell can hold, and naming that subset is what keeps the reader honest about how
 * much of the ORM this generator actually depends on.
 */
interface SchemaPath {
    instance?: string;
    options?: {
        required?: unknown;
        unique?: unknown;
        index?: unknown;
        default?: unknown;
        ref?: string;
        enum?: unknown;
    };
    caster?: { instance?: string; options?: { ref?: string } };
    /** Present when the path is an array of a nested schema. */
    schema?: SchemaHost;
}

/** Anything that can walk its own paths and list its declared indexes. */
interface SchemaHost {
    eachPath(iterator: (fieldPath: string, schemaPath: SchemaPath) => void): void;
    indexes?(): [Record<string, unknown>, Record<string, unknown> | undefined][];
}

/** A compiled mongoose model, in the fields a page reports. */
interface CompiledModel {
    modelName: string;
    collection: { name: string };
    schema: SchemaHost;
}

/** True for an export that is a compiled model rather than a schema, a type or a transform. */
const isCompiledModel = (value: unknown): value is CompiledModel =>
    typeof value === 'function' &&
    'modelName' in value &&
    'collection' in value &&
    'schema' in value;

/** A prom-client collector, in the fields a page reports. */
interface Collector {
    name: string;
    help?: string;
    labelNames?: readonly string[];
}

/** True for an export that is a registered collector rather than a helper. */
const isCollector = (value: unknown): value is Collector =>
    typeof value === 'object' && value !== null && 'name' in value && 'help' in value;

/**
 * The layers of an express router's stack.
 *
 * Express types `stack` as `any[]`, so intersecting the router with a better shape widens straight
 * back to `any`. Narrowing from `unknown` in one place instead keeps every read below it typed, and
 * an express release that renames the property degrades to an empty table rather than a crash.
 */
const stackOf = (router: Router): readonly RouteLayer[] => {
    const candidate = router as { stack?: unknown };
    return Array.isArray(candidate.stack) ? (candidate.stack as RouteLayer[]) : [];
};

/** One layer of an express router's stack. Express publishes no type for it. */
interface RouteLayer {
    name?: string;
    handle?: { name?: string };
    route?: {
        path: string;
        methods: Record<string, boolean | undefined>;
        stack?: { name?: string; handle?: { name?: string } }[];
    };
}

/** One route, as express mounted it and as the contract fragment describes it. */
export interface EndpointFact {
    method: string;
    /** Mounted path, `{param}` style, e.g. `/cart/{productId}`. */
    path: string;
    /** Handlers in front of the controller, router-level middleware first. */
    middlewares: string[];
    /** The last handler on the route — the controller by convention. */
    controller: string;
    /** `summary` from the module's own `openapi.yaml`, when the fragment describes this operation. */
    summary?: string;
    /** Security schemes the fragment declares for this operation. */
    security: string[];
}

/** One field of the module's collection. */
export interface FieldFact {
    path: string;
    type: string;
    required: boolean;
    unique: boolean;
    indexed: boolean;
    default?: string;
    ref?: string;
    enum?: string[];
    /** Sub-document fields, for an array of a nested schema. */
    children?: FieldFact[];
}

/** The collection a module owns, if it owns one. */
export interface CollectionFact {
    modelName: string;
    collectionName: string;
    fields: FieldFact[];
    /** Compound and secondary indexes declared with `schema.index(...)`. */
    indexes: { keys: string; options: string }[];
}

/** One file inside the module folder, and what its shape is. */
export interface FileFact {
    /** Module-relative path, e.g. `controllers/get-cart.ts`. */
    path: string;
    what: string;
    reads?: string;
    /** True when no entry in the shape catalogue matched — the file-coverage check fails on these. */
    unknown: boolean;
}

/** One Prometheus collector the module registers. */
export interface MetricFact {
    name: string;
    help: string;
    type: string;
    labels: string[];
}

/** Everything one module page needs. */
export interface ModuleFacts {
    name: string;
    subdomain: string;
    basePath?: string;
    dependsOn: ContextEdge[];
    /** Edges pointing AT this module, derived from every sibling's `dependsOn`. */
    dependents: (ContextEdge & { from: string })[];
    /** Domain events declared in this module's `events.ts`. */
    publishes: string[];
    /** Domain events this module's manifest subscribes to. */
    subscribes: string[];
    auditActions: Record<string, string>;
    analyticsEvents: Record<string, string>;
    metrics: MetricFact[];
    probes: { method: string; path: string; name: string }[];
    collections: CollectionFact[];
    endpoints: EndpointFact[];
    files: FileFact[];
    locales: string[];
    seeds: boolean;
    seedExport: boolean;
    demoShapes?: Record<string, string>;
    unitTests: number;
    contractTests: number;
}

/** Every file under `dir`, as paths relative to it, sorted, skipping snapshots and coverage noise. */
const walk = (directory: string, base = directory): string[] => {
    if (!existsSync(directory)) return [];
    return readdirSync(directory)
        .flatMap((entry) => {
            const full = path.join(directory, entry);
            if (statSync(full).isDirectory()) return walk(full, base);
            return [path.relative(base, full)];
        })
        .toSorted();
};

/** A mongoose path's declared type, flattened to something readable in a table cell. */
const typeName = (schemaPath: SchemaPath): string => {
    if (schemaPath.instance === 'Array') return `${schemaPath.caster?.instance ?? 'Mixed'}[]`;
    return schemaPath.instance ?? 'Mixed';
};

/** One schema path as a documented field, recursing once into a sub-document array. */
const readField = (fieldPath: string, schemaPath: SchemaPath): FieldFact => {
    const options = schemaPath.options ?? {};
    const children: FieldFact[] = [];
    schemaPath.schema?.eachPath((subPath, subType) => {
        if (subPath === '_id') return;
        children.push(readField(subPath, subType));
    });

    return {
        path: fieldPath,
        type: children.length > 0 ? 'Subdocument[]' : typeName(schemaPath),
        required: Boolean(options.required),
        unique: Boolean(options.unique),
        indexed: Boolean(options.index),
        default:
            options.default === undefined
                ? undefined
                : typeof options.default === 'function'
                  ? '(computed)'
                  : JSON.stringify(options.default),
        ref: options.ref ?? schemaPath.caster?.options?.ref,
        enum: Array.isArray(options.enum) ? (options.enum as string[]) : undefined,
        children: children.length > 0 ? children : undefined
    };
};

/**
 * Every collection this module owns, from `model.ts`'s compiled models.
 *
 * A list rather than one, because two modules own two collections each: `inventory` holds both
 * reservations and the stock ledger, `locales` both the language list and its messages. Reporting
 * only the first would silently hide half of each.
 */
const readCollections = async (moduleName: string): Promise<CollectionFact[]> => {
    const modelPath = path.join(MODULES_DIR, moduleName, 'model.ts');
    if (!existsSync(modelPath)) return [];

    const exported = (await import(modelPath)) as Record<string, unknown>;
    const models = Object.values(exported).filter((value) => isCompiledModel(value));

    return models.map((model) => {
        const fields: FieldFact[] = [];
        model.schema.eachPath((fieldPath, schemaPath) => {
            // `_id` and `__v` exist on every document; naming them on every page is noise.
            if (fieldPath === '__v' || fieldPath === '_id') return;
            fields.push(readField(fieldPath, schemaPath));
        });

        /* `schema.indexes()` returns only the ones declared with `schema.index(...)`; the `unique`
         * and `index` field options are already reported on their own rows. */
        const indexes = (model.schema.indexes?.() ?? []).map(([keys, options]) => ({
            keys: Object.entries(keys)
                .map(([key, direction]) => `${key}: ${String(direction)}`)
                .join(', '),
            options:
                Object.entries(options ?? {})
                    .map(([key, value]) => (value === true ? key : `${key}: ${String(value)}`))
                    .join(', ') || '—'
        }));

        return {
            modelName: model.modelName,
            collectionName: model.collection.name,
            fields,
            indexes
        };
    });
};

/** Read the default export of an optional module file, or `{}` when the file is absent. */
const readOptional = async (moduleName: string, file: string): Promise<Record<string, unknown>> => {
    const full = path.join(MODULES_DIR, moduleName, file);
    if (!existsSync(full)) return {};
    return (await import(full)) as Record<string, unknown>;
};

/** The flat `NAME: 'value'` record an audit or analytics file exports, whatever it is called. */
const flattenNameMap = (exported: Record<string, unknown>): Record<string, string> => {
    const found: Record<string, string> = {};
    for (const value of Object.values(exported))
        if (value && typeof value === 'object')
            for (const [key, name] of Object.entries(value as Record<string, unknown>))
                if (typeof name === 'string') found[key] = name;
    return found;
};

/**
 * Which domain events the manifest subscribes to.
 *
 * Read from `module.ts`'s source rather than by calling `subscribe()`: the bus keeps its handler
 * map private, and a getter added so the docs could read it would be production surface existing
 * for a generator's benefit. The manifest names the constant and names where it comes from, so the
 * import statement is enough.
 */
const readSubscriptions = async (moduleName: string): Promise<string[]> => {
    const manifestPath = path.join(MODULES_DIR, moduleName, 'module.ts');
    const source = readFileSync(manifestPath, 'utf8');

    // `import { PRODUCT_DELETED, USER_DELETED } from '@modules/products';`
    const importedFrom = new Map<string, string>();
    for (const match of source.matchAll(/import\s*{([^}]+)}\s*from\s*'([^']+)'/g))
        for (const specifier of match[1].split(','))
            importedFrom.set(
                specifier
                    .trim()
                    .split(/\s+as\s+/)
                    .pop()!
                    .trim(),
                match[2]
            );

    const names: string[] = [];
    for (const match of source.matchAll(/onDomainEvent\(\s*([\w$]+)/g)) {
        const identifier = match[1];
        const specifier = importedFrom.get(identifier);
        if (!specifier) continue;
        const resolved = specifier.startsWith('@modules/')
            ? path.join(MODULES_DIR, specifier.slice('@modules/'.length))
            : specifier;
        const exported = (await import(resolved)) as Record<string, unknown>;
        const value = exported[identifier];
        if (typeof value === 'string') names.push(value);
    }
    return [...new Set(names)].toSorted();
};

/** Route paths as the contract writes them: `/cart` + `/:productId` → `/cart/{productId}`. */
const mountedPath = (basePath: string, routePath: string): string => {
    const joined = `${basePath}${routePath === '/' ? '' : routePath}`;
    return joined.replaceAll(/:(\w+)/g, '{$1}') || '/';
};

/** Every endpoint the module mounts, enriched with its fragment's summary where one exists. */
const readEndpoints = (appModule: AppModule): EndpointFact[] => {
    if (!appModule.routes || !appModule.basePath) return [];

    const fragmentPath = path.join(MODULES_DIR, appModule.name, 'openapi.yaml');
    const fragment = existsSync(fragmentPath)
        ? (parseYaml(readFileSync(fragmentPath, 'utf8')) as {
              paths?: Record<
                  string,
                  Record<string, { summary?: string; security?: Record<string, unknown>[] }>
              >;
          })
        : {};

    const stack = stackOf(appModule.routes);

    const { basePath } = appModule;

    /* Router-level `use(...)` layers guard the routes registered AFTER them and nothing before, so
     * the chain is accumulated walking the stack in registration order. Applying every layer to
     * every route instead reports a public route mounted above a positional guard as admin-only —
     * which is the reverse of what the server enforces. */
    const routerLevel: string[] = [];

    return stack
        .flatMap((layer) => {
            const { route, handle } = layer;
            if (!route) {
                if (handle?.name) routerLevel.push(handle.name);
                return [];
            }

            const guarding = [...routerLevel];

            const handlers = (route.stack ?? []).map((entry) => {
                const name = entry.name ?? entry.handle?.name ?? '';
                /* A middleware factory returns a closure, so express has no name to report.
                 * `invalidateCache([...])` on the checkout route is the one in the repo today. */
                return !name || name === '<anonymous>' ? '(inline)' : name;
            });
            const fullPath = mountedPath(basePath, route.path);

            return Object.entries(route.methods)
                .filter(([, enabled]) => enabled)
                .map(([method]): EndpointFact => {
                    const operation = fragment.paths?.[fullPath]?.[method];
                    const security = (operation?.security ?? []).flatMap((scheme) =>
                        Object.keys(scheme)
                    );
                    return {
                        method: method.toUpperCase(),
                        path: fullPath,
                        middlewares: [...guarding, ...handlers.slice(0, -1)],
                        controller: handlers.at(-1) ?? '—',
                        summary: operation?.summary,
                        security
                    };
                });
        })
        .toSorted((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
};

/** Gather everything every page needs, for every enabled module. */
export const gatherFacts = async (appModules: AppModule[]): Promise<ModuleFacts[]> => {
    const facts: ModuleFacts[] = [];

    for (const appModule of appModules) {
        const folder = path.join(MODULES_DIR, appModule.name);
        const files = walk(folder)
            .filter((relative) => !relative.includes('__snapshots__'))
            .map((relative): FileFact => {
                const shape = shapeOf(relative);
                return {
                    path: relative,
                    what: shape?.what ?? '**Undocumented shape.**',
                    reads: shape?.reads,
                    unknown: !shape
                };
            });

        const metricsExports = await readOptional(appModule.name, 'metrics.ts');
        const metrics = Object.values(metricsExports)
            .filter((value) => isCollector(value))
            .map(
                (collector): MetricFact => ({
                    name: collector.name,
                    help: collector.help ?? '',
                    type: collector.constructor.name,
                    labels: [...(collector.labelNames ?? [])]
                })
            );

        const eventExports = await readOptional(appModule.name, 'events.ts');
        const probeExports = await readOptional(appModule.name, 'probes.ts');

        facts.push({
            name: appModule.name,
            subdomain: appModule.subdomain,
            basePath: appModule.basePath,
            dependsOn: [...(appModule.dependsOn ?? [])],
            dependents: [],
            publishes: Object.values(eventExports)
                .filter((value): value is string => typeof value === 'string')
                .toSorted(),
            subscribes: await readSubscriptions(appModule.name),
            auditActions: flattenNameMap(await readOptional(appModule.name, 'audit.ts')),
            analyticsEvents: flattenNameMap(await readOptional(appModule.name, 'analytics.ts')),
            metrics,
            probes: ((probeExports.probes as Probe[] | undefined) ?? []).map((probe) => ({
                method: probe.method,
                path: probe.path,
                name: probe.name
            })),
            collections: await readCollections(appModule.name),
            endpoints: readEndpoints(appModule),
            files,
            locales: files
                .filter((file) => file.path.startsWith('locales/'))
                .map((file) => path.basename(file.path, '.json')),
            seeds: Boolean(appModule.seeds),
            seedExport: Boolean(appModule.seedExport),
            demoShapes: appModule.demoShapes as Record<string, string> | undefined,
            unitTests: files.filter((file) => file.path.startsWith('tests/unit/')).length,
            contractTests: files.filter((file) => file.path.startsWith('tests/contract/')).length
        });
    }

    // Second pass: an edge is only visible from its own end, and the interesting half is the other.
    for (const one of facts)
        for (const edge of one.dependsOn) {
            const target = facts.find((other) => other.name === edge.module);
            target?.dependents.push({ ...edge, from: one.name });
        }

    return facts.toSorted((a, b) => a.name.localeCompare(b.name));
};
