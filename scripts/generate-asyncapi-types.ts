#!/usr/bin/env tsx
/*
 * Generates the TypeScript realtime contract types from `asyncapi.yaml`.
 *
 * SHARED SCRIPT — byte-identical in both repos of the pair, and both write
 * `src/types/asyncapi.generated.ts`. Change it in one repo and copy it to the other, or the
 * outputs drift. What differs is the INPUT: the backend generates from the whole contract, the
 * frontend from the public subset, so only the backend's output carries the queue payloads.
 *
 * From whichever document it is given it emits the payload interfaces, the message aliases, the
 * per-namespace channel constants and unions, and the SSE event name/payload maps. An export a
 * repo happens not to use is harmless — tree-shaken there, type-only here.
 *
 * `--check` writes nothing and exits 1 on a mismatch: the gate that stops a repo shipping types
 * for a contract it no longer has.
 *
 * Usage: tsx scripts/generate-asyncapi-types.ts --out <path> [--check]
 *
 * See: docs/api/asyncapi-workflow.md#generated-typescript-types
 */
import { TypeScriptGenerator, typeScriptDefaultModelNameConstraints } from '@asyncapi/modelina';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

interface AsyncApiOperation {
    message?: {
        $ref?: string;
    };
}

interface AsyncApiChannel {
    publish?: AsyncApiOperation;
    subscribe?: AsyncApiOperation;
}

interface AsyncApiMessage {
    payload?: JsonSchema;
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
    components?: {
        messages?: Record<string, AsyncApiMessage>;
    };
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
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
 * Formats a model/message identifier as a PascalCase type name.
 *
 * @param value Raw model or message name.
 * @returns PascalCase type name.
 */
const toModelName = (value: string): string => toPascalCase(value);

/*
 * Resolves `#/components/...` refs to their generated type names.
 *
 * @param reference AsyncAPI `$ref` value.
 * @returns TypeScript type name for the referenced model.
 */
const refToTypeName = (reference: string): string => toModelName(reference.split('/').pop() ?? '');

/*
 * Converts an object key into a valid TypeScript property declaration key.
 *
 * @param property Object key from JSON Schema.
 * @returns Plain identifier or quoted literal key.
 */
const formatPropertyKey = (property: string): string =>
    /^[A-Za-z_$][A-Za-z0-9_$]*$/u.test(property) ? property : `'${property}'`;

/*
 * Converts an AsyncAPI payload JSON Schema into a TypeScript type string.
 *
 * @param schema JSON Schema fragment.
 * @param depth Current recursive indentation depth.
 * @returns TypeScript type representation.
 */
const schemaToType = (schema: JsonSchema | undefined, depth = 0): string => {
    const indentation = '    '.repeat(depth);
    const childIndentation = '    '.repeat(depth + 1);

    if (!schema) return 'unknown';
    if (schema.$ref) return refToTypeName(schema.$ref);

    if (Array.isArray(schema.oneOf))
        return schema.oneOf.map((option) => schemaToType(option, depth)).join(' | ');

    if (Array.isArray(schema.anyOf))
        return schema.anyOf.map((option) => schemaToType(option, depth)).join(' | ');

    if (Array.isArray(schema.allOf))
        return schema.allOf.map((option) => schemaToType(option, depth)).join(' & ');

    if (Array.isArray(schema.enum) && schema.enum.length > 0)
        return schema.enum.map((value) => JSON.stringify(value)).join(' | ');

    if (schema.type === 'array') return `(${schemaToType(schema.items, depth)})[]`;

    if (schema.type === 'object' || schema.properties || schema.additionalProperties) {
        const requiredSet = schema.required ? new Set(schema.required) : undefined;
        const properties = Object.entries(schema.properties ?? {}).map(([key, propertySchema]) => {
            const safeKey = formatPropertyKey(key);
            const optional = requiredSet?.has(key) ? '' : '?';
            return `${childIndentation}${safeKey}${optional}: ${schemaToType(propertySchema, depth + 1)};`;
        });

        if (
            typeof schema.additionalProperties === 'object' &&
            !Array.isArray(schema.additionalProperties)
        )
            properties.push(
                `${childIndentation}[key: string]: ${schemaToType(schema.additionalProperties, depth + 1)};`
            );

        if (
            (schema.additionalProperties === true || schema.additionalProperties === undefined) &&
            properties.length === 0
        )
            return 'Record<string, unknown>';

        return `{\n${properties.join('\n')}\n${indentation}}`;
    }

    if (schema.type === 'integer' || schema.type === 'number') return 'number';
    if (schema.type === 'boolean') return 'boolean';
    if (schema.type === 'string') return 'string';

    return 'unknown';
};

/*
 * Builds channel-to-message-type entries from channel prefixes and operation kind.
 *
 * @param channels AsyncAPI channels map.
 * @param prefix Channel prefix selector.
 * @param operation Operation direction (`publish` or `subscribe`).
 * @returns Ordered entries containing channel names and referenced message type names.
 */
const collectChannelMessageEntries = (
    channels: Record<string, AsyncApiChannel>,
    prefix: string,
    operation: 'publish' | 'subscribe'
): { channelName: string; messageType: string }[] =>
    Object.entries(channels)
        .filter(([channelName]) => channelName.startsWith(prefix))
        .map(([channelName, channel]) => ({
            channelName,
            messageType: channel[operation]?.message?.$ref
                ? refToTypeName(channel[operation].message.$ref)
                : 'unknown'
        }))
        .toSorted((a, b) => a.channelName.localeCompare(b.channelName));

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
        const namespace = channelName.split('.')[0];
        if (!namespace) continue;
        groups.set(namespace, [...(groups.get(namespace) ?? []), channelName]);
    }
    return groups;
};

const modelNameConstraints = typeScriptDefaultModelNameConstraints({
    NAMING_FORMATTER: (value: string) => toModelName(value)
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

const sseEntries = collectChannelMessageEntries(channels, 'observability.', 'subscribe');

const channelNamespaceBlocks = [...groupChannelsByNamespace(Object.keys(channels))].map(
    ([namespace, channelNames]) => renderChannelNamespace(namespace, channelNames)
);

const messageTypeBlocks = Object.entries(messages)
    .map(([messageName, message]) => {
        const aliasName = toModelName(messageName);
        if (message.payload?.$ref) {
            const targetName = refToTypeName(message.payload.$ref);
            // Skip self-referential aliases (message name resolves to same type as schema)
            if (aliasName === targetName) return '';
            return `export type ${aliasName} = ${targetName};`;
        }
        return `export type ${aliasName} = ${schemaToType(message.payload)};`;
    })
    .filter(Boolean);

/*
 * Builds the full generated file output content.
 *
 * @param modelBlocks Modelina-generated schema blocks.
 * @returns Complete TypeScript source for the generated types file.
 */
const buildOutput = (modelBlocks: string[]): string => {
    const sections = [
        '// Code generated by `npm run gen:asyncapi`. DO NOT EDIT.',
        '/* eslint-disable @typescript-eslint/naming-convention */',
        '/*',
        ' * GENERATED — do not edit manually.',
        ' * Source: asyncapi.yaml  |  Regenerate: npm run gen:asyncapi',
        ' */',
        '',
        ...modelBlocks,
        '',
        ...messageTypeBlocks,
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
