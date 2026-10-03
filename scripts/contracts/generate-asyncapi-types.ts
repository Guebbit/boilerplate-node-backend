#!/usr/bin/env tsx
/*
 * Generates the TypeScript realtime contract types from `asyncapi.yaml`.
 *
 * SHARED SCRIPT — started byte-identical in both repos of the pair, and both write
 * `src/types/asyncapi.generated.ts`. NOT byte-identical any more: the frontend's copy also emits an
 * inlined-JSON-Schema map for its own runtime SSE-frame validation, which this backend copy has no
 * use for and emits queue-payload Zod validators instead. What both copies still share is the input
 * format and the channel/message-naming machinery — keep a fix to either half in step across both
 * copies by hand until this generator gets its own shared package.
 * What differs at the INPUT is unchanged: the backend generates from the whole contract, the
 * frontend from the public subset, so only the backend's output carries the queue payloads.
 *
 * From whichever document it is given it emits the payload interfaces, the message aliases, the
 * per-namespace channel constants and unions, and the SSE event name/payload maps. An export a
 * repo happens not to use is harmless — tree-shaken there, type-only here.
 *
 * `--check` writes nothing and exits 1 on a mismatch: the gate that stops a repo shipping types
 * for a contract it no longer has.
 *
 * Usage: tsx scripts/contracts/generate-asyncapi-types.ts --out <path> [--check]
 *
 * See: docs/api/asyncapi-workflow.md#generated-typescript-types
 */
import { TypeScriptGenerator, typeScriptDefaultModelNameConstraints } from '@asyncapi/modelina';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

interface AsyncApiChannel {
    /** 3.0: a channel declares its message(s) once, direction lives on the operations that bind to it. */
    messages?: Record<string, { $ref?: string }>;
    /** Which of `document.servers` this channel is reachable on — how a transport is told apart from a name. */
    servers?: { $ref?: string }[];
    /**
     * Vendor extension: `sse` for a channel pushed over the observability dashboard's EventSource
     * connection, rather than read off which SERVER it binds to. AsyncAPI 3.0 channels omitting
     * `servers` bind to every server the document declares, so `sseLocal` alone cannot tell an SSE
     * channel apart from one meant for every transport — this says so directly instead.
     */
    'x-transport'?: string;
}

interface AsyncApiMessage {
    payload?: JsonSchema;
}

/** One of `document.servers` — only the field this generator reads off it. */
interface AsyncApiServer {
    protocol?: string;
}

interface JsonSchema {
    $ref?: string;
    type?: string;
    enum?: unknown[];
    oneOf?: JsonSchema[];
    anyOf?: JsonSchema[];
    allOf?: JsonSchema[];
    required?: string[];
    properties?: Record<string, JsonSchema>;
    items?: JsonSchema;
    additionalProperties?: boolean | JsonSchema;
}

interface AsyncApiDocument {
    channels?: Record<string, AsyncApiChannel>;
    servers?: Record<string, AsyncApiServer>;
    components?: {
        messages?: Record<string, AsyncApiMessage>;
        /** Read for the Zod emitter — Modelina builds the TS interfaces from the spec text itself. */
        schemas?: Record<string, JsonSchema>;
    };
}

/** The repo root. `import.meta.url` rather than `__dirname`: this script runs as ESM. */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The bundled root contract this generator reads — never a module fragment. */
const INPUT = path.resolve(ROOT, 'asyncapi.yaml');

/*
 * Reads the required `--out` argument.
 *
 * @returns Absolute path of the file to generate.
 */
const resolveOutputPath = (): string => {
    const flagIndex = process.argv.indexOf('--out');
    const value = flagIndex === -1 ? undefined : process.argv[flagIndex + 1];
    if (!value) {
        console.error('Missing required argument: --out <path>');
        process.exit(1);
    }
    return path.resolve(ROOT, value);
};

const OUTPUT = resolveOutputPath();

/** `--check` compares and reports; without it the file is written. */
const checkOnly = process.argv.includes('--check');

/*
 * Converts source names into `PascalCase`.
 *
 * @param value Source name from the AsyncAPI contract.
 * @returns Sanitized `PascalCase` identifier.
 */
const toPascalCase = (value: string): string =>
    value
        .replaceAll(/[^A-Za-z0-9]+/gu, ' ')
        .trim()
        .split(/\s+/u)
        .filter(Boolean)
        .map((segment) => `${segment.charAt(0).toUpperCase()}${segment.slice(1)}`)
        .join('');

/*
 * The last path segment of a `$ref` — the raw name, before any casing is applied. Shared by
 * {@link refToTypeName} (which title-cases it for a TS identifier) and the server/message lookups
 * below (which need the exact key `document.servers`/`components.messages` declared it under).
 *
 * @param reference AsyncAPI `$ref` value.
 * @returns The ref's final path segment, unmodified.
 */
const lastRefSegment = (reference: string): string => reference.split('/').pop() ?? '';

/*
 * Resolves `#/components/...` refs to their generated type names.
 *
 * @param reference AsyncAPI `$ref` value.
 * @returns TypeScript type name for the referenced model.
 */
const refToTypeName = (reference: string): string => toPascalCase(lastRefSegment(reference));

/*
 * The real payload type a message carries — never the message's own alias name, which
 * `messageTypeBlocks` may have deduped away. Two things in this file need "what type does this
 * message resolve to" (the SSE payload map below, and the alias declarations themselves), and
 * both go through this so neither can name a type the other dropped.
 *
 * @param messageName Key into `components.messages`.
 * @param messages The document's message definitions.
 * @returns The resolved payload type name, or 'unknown' when the message is not declared.
 */
const resolveMessagePayloadType = (
    messageName: string,
    messages: Record<string, AsyncApiMessage>
): string => {
    /*
     * Asked as "is it declared", not as a nullish check on the value. `Record<string,
     * AsyncApiMessage>` promises a value for every key, so an index access — and any `?.` on what
     * comes back — reads as always-present to TypeScript, and `no-unnecessary-condition` fails the
     * build over the guard. The promise is false here: the caller passes whatever name a channel's
     * `$ref` ended in, and a document is free to leave that undeclared in `components.messages`.
     * This is what keeps the 'unknown' the signature documents from being a TypeError instead.
     */
    if (!Object.hasOwn(messages, messageName)) return 'unknown';
    const { payload } = messages[messageName];
    if (!payload?.$ref) return 'unknown';
    return refToTypeName(payload.$ref);
};

/*
 * Builds channel-to-message-type entries for the channels a predicate selects. Every channel here
 * declares exactly one message — direction (SSE push vs. queue publish/consume) lives on the
 * operations bound to the channel, not on which map this reads.
 *
 * @param channels AsyncAPI channels map.
 * @param messages AsyncAPI message definitions, resolved to their PAYLOAD type — never the
 *   message's own (possibly deduped-away) alias name.
 * @param select Which channels to include — data-driven (a transport, a server binding), never a
 *   name prefix: a channel's own declared TRANSPORT is what tells a caller how to reach it, and a
 *   name is free to change without that meaning anything moved.
 * @returns Ordered entries containing channel names and referenced message type names.
 */
const collectChannelMessageEntries = (
    channels: Record<string, AsyncApiChannel>,
    messages: Record<string, AsyncApiMessage>,
    select: (channelName: string, channel: AsyncApiChannel) => boolean
): { channelName: string; messageType: string }[] =>
    Object.entries(channels)
        .filter(([channelName, channel]) => select(channelName, channel))
        .map(([channelName, channel]) => {
            const ref = Object.values(channel.messages ?? {})[0]?.$ref;
            const messageName = ref ? lastRefSegment(ref) : '';
            return {
                channelName,
                messageType: messageName
                    ? resolveMessagePayloadType(messageName, messages)
                    : 'unknown'
            };
        })
        .toSorted((a, b) => a.channelName.localeCompare(b.channelName));

/*
 * Every protocol a channel is reachable on, read off the servers it explicitly binds to — never
 * off its name. AsyncAPI 3.0: a channel omitting `servers` binds to every server the document
 * declares instead, a case none of this contract's channels rely on, so an empty result here
 * correctly excludes it rather than guessing which server was meant.
 *
 * @param channel The channel to resolve.
 * @param servers The document's own server declarations.
 * @returns The protocol of each server this channel binds to.
 */
const channelProtocols = (
    channel: AsyncApiChannel,
    servers: Record<string, AsyncApiServer>
): string[] =>
    (channel.servers ?? [])
        .map((binding) => {
            if (!binding.$ref) return undefined;
            // Same `Object.hasOwn` guard as `resolveMessagePayloadType` above, for the same
            // reason: `Record<string, AsyncApiServer>` promises a value for every key, so a plain
            // index access reads as always-present to TypeScript even though a document is free to
            // `$ref` a server name it never declared.
            const name = lastRefSegment(binding.$ref);
            return Object.hasOwn(servers, name) ? servers[name].protocol : undefined;
        })
        .filter((protocol): protocol is string => protocol !== undefined);

/*
 * The payload schema name(s) a channel's message(s) resolve to.
 *
 * @param channel The channel to resolve.
 * @param messages AsyncAPI message definitions.
 * @returns Every resolved payload schema name, `'unknown'` entries dropped.
 */
const channelPayloadSchemaNames = (
    channel: AsyncApiChannel,
    messages: Record<string, AsyncApiMessage>
): string[] =>
    Object.values(channel.messages ?? {})
        .map((ref) => (ref.$ref ? lastRefSegment(ref.$ref) : undefined))
        .filter((messageName): messageName is string => messageName !== undefined)
        .map((messageName) => resolveMessagePayloadType(messageName, messages))
        .filter((typeName) => typeName !== 'unknown');

/*
 * Renders a readonly literal string array declaration.
 *
 * @param exportName Exported constant name.
 * @param values Literal string values.
 * @returns TypeScript source for the readonly array export.
 */
const renderLiteralArray = (exportName: string, values: string[]): string => {
    const lines = values.map((value) => `    ${JSON.stringify(value)},`).join('\n');
    return `export const ${exportName} = [\n${lines}\n] as const;`;
};

/*
 * Renders a typed event-name to payload map interface.
 *
 * @param interfaceName Map interface name.
 * @param entries Channel/message entries.
 * @returns TypeScript source for the payload map interface.
 */
const renderPayloadMap = (
    interfaceName: string,
    entries: { channelName: string; messageType: string }[]
): string => {
    const rows = entries
        .map(
            ({ channelName, messageType }) => `    ${JSON.stringify(channelName)}: ${messageType};`
        )
        .join('\n');
    return `export interface ${interfaceName} {\n${rows}\n}`;
};

/*
 * Turns a channel name into the SCREAMING_SNAKE key used inside its namespace constant.
 * `observability.metrics.snapshot` under `observability.` becomes `METRICS_SNAPSHOT`.
 *
 * @param channelName Full channel name.
 * @param prefix Namespace prefix to strip.
 * @returns Constant object key.
 */
const toConstantKey = (channelName: string, prefix: string): string =>
    channelName
        .slice(prefix.length)
        .replaceAll(/[.\-_]+/gu, '_')
        .toUpperCase();

/*
 * Renders one namespace's channel-name constant object plus its union type.
 * Namespaces are discovered from the contract, so a new channel prefix generates its own
 * group with no change to this script.
 *
 * @param namespace First dot-segment of the channel names (e.g. `observability`).
 * @param channelNames Every channel in that namespace.
 * @returns TypeScript source for the constant object and its union type.
 */
const renderChannelNamespace = (namespace: string, channelNames: string[]): string => {
    const prefix = `${namespace}.`;
    const constantName = `${namespace.toUpperCase()}_CHANNELS`;
    const unionName = `${toPascalCase(namespace)}Channel`;
    const entries = channelNames
        .map((channelName) => `    ${toConstantKey(channelName, prefix)}: '${channelName}',`)
        .join('\n');

    return [
        `/* Channel names in the "${prefix}" namespace */`,
        `export const ${constantName} = {`,
        entries,
        '} as const;',
        '',
        `/* Union of every "${prefix}" channel name */`,
        `export type ${unionName} = (typeof ${constantName})[keyof typeof ${constantName}];`,
        ''
    ].join('\n');
};

/*
 * Groups channel names by their first dot-segment, preserving contract order.
 *
 * @param channelNames Every channel name in the contract.
 * @returns Namespace to channel-names map.
 */
const groupChannelsByNamespace = (channelNames: string[]): Map<string, string[]> => {
    const groups = new Map<string, string[]>();
    for (const channelName of channelNames) {
        const namespace = channelName.split('.', 1)[0];
        if (!namespace) continue;
        groups.set(namespace, [...(groups.get(namespace) ?? []), channelName]);
    }
    return groups;
};

const modelNameConstraints = typeScriptDefaultModelNameConstraints({
    NAMING_FORMATTER: (value: string) => toPascalCase(value)
});

const generator = new TypeScriptGenerator({
    modelType: 'interface',
    enumType: 'union',
    rawPropertyNames: true,
    constraints: {
        modelName: modelNameConstraints
    }
});

const specText = readFileSync(INPUT, 'utf8');
const document = parse(specText) as AsyncApiDocument;

const channels = document.channels ?? {};
const messages = document.components?.messages ?? {};
const servers = document.servers ?? {};

const sseEntries = collectChannelMessageEntries(
    channels,
    messages,
    (_name, channel) => channel['x-transport'] === 'sse'
);

/**
 * Payload schemas that back a QUEUE message — any channel bound to an AMQP server. These get a
 * TOLERANT Zod reader (unknown fields dropped, never rejected) instead of `.strict()`: a producer
 * adding a field during a rolling deploy is a normal, non-breaking change, and a `.strict()`
 * schema would make every consumer reject the message outright the moment one ships it.
 */
const queuePayloadSchemaNames = new Set(
    Object.values(channels)
        .filter((channel) => channelProtocols(channel, servers).includes('amqp'))
        .flatMap((channel) => channelPayloadSchemaNames(channel, messages))
);

const channelNamespaceBlocks = [...groupChannelsByNamespace(Object.keys(channels))].map(
    ([namespace, channelNames]) => renderChannelNamespace(namespace, channelNames)
);

const messageTypeBlocks = Object.keys(messages)
    .map((messageName) => {
        const aliasName = toPascalCase(messageName);
        const targetName = resolveMessagePayloadType(messageName, messages);
        // Skip self-referential aliases (message name resolves to same type as schema)
        if (aliasName === targetName) return '';
        return `export type ${aliasName} = ${targetName};`;
    })
    .filter(Boolean);

/**
 * One JSON-Schema node as a Zod expression.
 *
 * Deliberately narrow: it covers what the worker payload schemas actually use, and throws on
 * anything else rather than emitting a permissive `z.unknown()` that would silently stop
 * validating the day a contract grows a construct this does not handle.
 *
 * @param schema - the node to render
 * @param depth - nesting level, for indentation
 * @param tolerant - true once we're inside a QUEUE payload's schema tree — see
 *   {@link queuePayloadSchemaNames}. Threaded down through every recursive call so a nested
 *   object gets the same treatment as the payload it belongs to.
 * @returns the Zod expression as source text
 * @throws When the node uses a construct this emitter does not cover.
 */
const zodExpression = (schema: JsonSchema, depth = 0, tolerant = false): string => {
    if (schema.$ref) return `${refToTypeName(schema.$ref)}Schema`;

    if (schema.enum)
        return `z.enum([${schema.enum.map((value) => JSON.stringify(value)).join(', ')}])`;

    switch (schema.type) {
        case 'string': {
            return 'z.string()';
        }
        case 'number': {
            return 'z.number()';
        }
        case 'integer': {
            return 'z.number().int()';
        }
        case 'boolean': {
            return 'z.boolean()';
        }
        case 'array': {
            return `z.array(${schema.items ? zodExpression(schema.items, depth, tolerant) : 'z.unknown()'})`;
        }
        case 'object': {
            // No declared properties means "any object" — `data`/`templateData`, whose whole point
            // is that the producer decides what the template prints.
            if (!schema.properties) return 'z.record(z.string(), z.unknown())';

            // Indented by hand: this file is in `.prettierignore`, because the freshness check
            // compares the generator's bytes to the committed ones and a second formatter would
            // make that check fail on a file nobody edited.
            const pad = '    '.repeat(depth + 1);
            const required = new Set(schema.required);
            const fields = Object.entries(schema.properties)
                .map(
                    ([name, property]) =>
                        `${pad}    ${JSON.stringify(name)}: ${zodExpression(property, depth + 1, tolerant)}${
                            required.has(name) ? '' : '.optional()'
                        }`
                )
                .join(',\n');
            /*
             * `additionalProperties: false` becomes `.strict()` EXCEPT inside a queue payload
             * (`tolerant`), where it is left off instead — Zod's default already drops a key the
             * schema doesn't know rather than keeping it, which is the tolerant-reader behaviour
             * (Postel's law): a producer adding a field is not a reason to reject the whole message.
             * Everywhere else `.strict()` still stands, so the runtime refuses what the contract
             * forbids instead of quietly dropping it.
             */
            const strict =
                !tolerant && schema.additionalProperties === false ? `\n${pad}.strict()` : '';
            return `z\n${pad}.object({\n${fields}\n${pad}})${strict}`;
        }
        default: {
            throw new Error(
                `asyncapi Zod emitter: unsupported schema node ${JSON.stringify(schema)}`
            );
        }
    }
};

/**
 * Every `components.schemas` entry as a runtime validator.
 *
 * The TypeScript interfaces above are a claim about the wire; these are the check. A queue payload
 * crosses a process boundary, where a type stops being a fact — see `consumeFromQueue`.
 *
 * @param schemas - the document's `components.schemas`
 * @param tolerant - payload schema names that should read tolerantly — see
 *   {@link queuePayloadSchemaNames}
 */
const renderZodSchemas = (
    schemas: Record<string, JsonSchema>,
    tolerant: ReadonlySet<string>
): string[] =>
    Object.entries(schemas).map(
        ([name, schema]) =>
            `export const ${toPascalCase(name)}Schema = ${zodExpression(schema, 0, tolerant.has(name))};`
    );

/*
 * Builds the full generated file output content.
 *
 * @param modelBlocks Modelina-generated schema blocks.
 * @returns Complete TypeScript source for the generated types file.
 */
const zodSchemaBlocks = renderZodSchemas(
    document.components?.schemas ?? {},
    queuePayloadSchemaNames
);

const buildOutput = (modelBlocks: string[]): string => {
    const sections = [
        '// Code generated by `npm run gen:asyncapi`. DO NOT EDIT.',
        '/* eslint-disable @typescript-eslint/naming-convention */',
        '/*',
        ' * GENERATED — do not edit manually.',
        ' * Source: asyncapi.yaml  |  Regenerate: npm run gen:asyncapi',
        ' */',
        '',
        "import { z } from 'zod';",
        '',
        ...modelBlocks,
        '',
        ...messageTypeBlocks,
        '',
        '/* Runtime validators for the same payloads — see renderZodSchemas in the generator. */',
        '',
        ...zodSchemaBlocks,
        '',
        '/* Channel name constants (canonical identifiers from asyncapi.yaml) */',
        '',
        ...channelNamespaceBlocks,
        renderLiteralArray(
            'REALTIME_SSE_EVENT_NAMES',
            sseEntries.map(({ channelName }) => channelName)
        ),
        'export type SseEventName = (typeof REALTIME_SSE_EVENT_NAMES)[number];',
        renderPayloadMap('SseEventPayloadMap', sseEntries),
        'export type SseEventPayload<TEventName extends SseEventName> = SseEventPayloadMap[TEventName];',
        ''
    ];

    return sections.join('\n');
};

/*
 * Generates contract models, then writes the realtime types file or asserts it is already current.
 */
generator
    .generate(specText)
    .then((models) => {
        const modelBlocks = models.map(
            (model) =>
                `export ${model.result.replaceAll('Map<string, any>', 'Record<string, unknown>')}`
        );
        const output = buildOutput(modelBlocks);

        if (!checkOnly) {
            writeFileSync(OUTPUT, output, 'utf8');
            console.log(`✓ Generated ${OUTPUT}`);
            return;
        }

        if (existsSync(OUTPUT) && readFileSync(OUTPUT, 'utf8') === output) {
            console.log(`✓ ${OUTPUT} is current with asyncapi.yaml`);
            return;
        }

        // Names the one command that fixes it: the file is an output, so there is nothing to decide.
        console.error(
            `${OUTPUT} is not what asyncapi.yaml generates.\n` +
                `  Run: npm run gen:asyncapi\n` +
                `  Then commit the result.`
        );
        process.exit(1);
    })
    .catch((error: unknown) => {
        console.error(error);
        process.exit(1);
    });
