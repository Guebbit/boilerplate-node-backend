/**
 * What every file shape inside `src/modules/<name>/` is, in one line each.
 *
 * This is the catalogue the file-coverage check reads: a file matching no pattern here fails
 * `npm run check:module-docs` by name, which is the whole point. A new shape is a deliberate
 * addition to the module vocabulary, so it costs one line here and stops being invisible.
 *
 * See: docs/theory/modules.md#what-a-module-contains
 */

/** One entry: the glob-ish pattern a path inside a module folder matches, and what that file is. */
interface FileShape {
    /** Matched against the module-relative path, e.g. `controllers/get-cart.ts`. */
    match: RegExp;

    /** One line, present tense, describing the file's job. */
    what: string;

    /** Docs page that explains the mechanism this file participates in. */
    reads?: string;
}

/**
 * Ordered most-specific first: the first match wins, so `services/index.ts` is described as a
 * barrel rather than as another service file.
 */
export const FILE_SHAPES: readonly FileShape[] = [
    {
        match: /^module\.ts$/,
        what: 'The manifest — the only file the application loads directly. Declares the name, base path, router, dependency edges, locales, seeds and event subscriptions.',
        reads: '../theory/modules.md'
    },
    {
        match: /^index\.ts$/,
        what: 'The public barrel: the only surface a sibling module may import.',
        reads: '../theory/strategic-ddd.md'
    },
    {
        match: /^routes\.ts$/,
        what: 'The URL surface — one line per endpoint, naming its middlewares, the role it requires and the controller it lands on.',
        reads: '../api/endpoints.md'
    },
    {
        match: /^controllers\/.+\.ts$/,
        what: 'One operation: reads inputs, calls the service, answers through the response envelope, and catches.',
        reads: '../theory/request-flow.md'
    },
    {
        match: /^services\/index\.ts$/,
        what: 'The service barrel, once the tier outgrew a single file.',
        reads: '../theory/layers.md'
    },
    {
        match: /^services\/.+\.ts$/,
        what: 'Domain decisions, split by what the operations do rather than by which route reaches them.',
        reads: '../theory/layers.md'
    },
    {
        match: /^service\.ts$/,
        what: 'The domain decision, and the layer that owns status-code meaning.',
        reads: '../theory/layers.md'
    },
    {
        match: /^repository\.ts$/,
        what: 'Every query this module makes, on the shared base repository. The only tier that talks to Mongoose.',
        reads: '../tools/mongodb-mongoose.md'
    },
    {
        match: /^model\.ts$/,
        what: "The Mongoose schema, its indexes and its serialisation rules — the collection's shape.",
        reads: '../tools/mongodb-mongoose.md'
    },
    {
        match: /^domain\/index\.ts$/,
        what: 'The domain barrel.',
        reads: '../theory/domain-layer.md'
    },
    {
        match: /^domain\/.+\.ts$/,
        what: 'Pure rules over plain data — no Mongoose, no Express, and lint-guaranteed free of both.',
        reads: '../theory/domain-layer.md'
    },
    {
        match: /^openapi\.yaml$/,
        what: "This module's slice of the REST contract. The root `openapi.yaml` is bundled from these.",
        reads: '../api/contract-fragmentation.md'
    },
    {
        match: /^asyncapi\.yaml$/,
        what: "This module's slice of the realtime contract, bundled the same way.",
        reads: '../api/asyncapi-workflow.md'
    },
    {
        match: /^locales\/.+\.json$/,
        what: "This module's user-facing strings, one file per language.",
        reads: '../tools/i18n.md'
    },
    {
        match: /^events\.ts$/,
        what: 'The domain events this module publishes and subscribes to.',
        reads: '../tools/events-and-logging.md'
    },
    {
        match: /^audit\.ts$/,
        what: 'Which of this module’s operations reach the audit trail, and under what action names.',
        reads: '../tools/winston.md'
    },
    {
        match: /^metrics\.ts$/,
        what: 'The domain counters and histograms this module registers with Prometheus.',
        reads: '../tools/prometheus.md'
    },
    {
        match: /^analytics\.ts$/,
        what: 'The product-analytics event names this module emits.',
        reads: '../tools/analytics.md'
    },
    {
        match: /^emails\.ts$/,
        what: 'Which templates this module sends and what they are given.',
        reads: '../tools/email-and-rendering.md'
    },
    {
        match: /^probes\.ts$/,
        what: 'The requests the contract cannot describe — the calls that prove the API refuses things.',
        reads: '../tools/contract-request-data.md'
    },
    {
        match: /^demo\.ts$/,
        what: "This module's seed fixtures, upserted through the shared seeding primitive.",
        reads: '../tools/demo-profile.md'
    },
    {
        match: /^factory\.ts$/,
        what: 'Fixture builders for tests, on top of the shared persistence factory.',
        reads: '../tools/unit-testing.md'
    },
    {
        match: /^config\.ts$/,
        what: 'The settings several of this module’s transitions read, in one place.'
    },
    {
        match: /^session\/.+\.ts$/,
        what: 'Session mechanics kept out of the services: JWT signing and verification, cookie shape and flags, and the lifetimes both read.',
        reads: '../tools/security.md'
    },
    {
        match: /^providers\/.+\.ts$/,
        what: 'The provider port and the implementation behind it, so nothing above the port knows which processor is wired in.',
        reads: '../theory/layers.md'
    },
    {
        match: /^tests\/factory\.ts$/,
        what: 'Fixture builders used only by this module’s own suites.',
        reads: '../tools/unit-testing.md'
    },
    {
        match: /^tests\/unit\/.+\.ts$/,
        what: 'Unit suite — the rules, in isolation.',
        reads: '../tools/unit-testing.md'
    },
    {
        match: /^tests\/contract\/.+\.ts$/,
        what: 'Contract suite — the responses, against the fragment.',
        reads: '../tools/contract-testing.md'
    }
];

/** The shape a module-relative path matches, or `undefined` when nothing in the catalogue does. */
export const shapeOf = (relativePath: string): FileShape | undefined =>
    FILE_SHAPES.find((shape) => shape.match.test(relativePath));
