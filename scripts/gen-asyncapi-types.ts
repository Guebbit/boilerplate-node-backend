#!/usr/bin/env tsx
/**
 * Generates src/types/asyncapi.ts from asyncapi.yaml.
 *
 * Reads component schemas and channel definitions from the AsyncAPI spec and
 * emits a single, clean TypeScript file with interfaces and channel-name
 * constants.  No class boilerplate — plain interfaces and `as const` objects.
 *
 * Usage: npm run gen:asyncapi-types
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const INPUT = resolve(ROOT, 'asyncapi.yaml');
const OUTPUT = resolve(ROOT, 'src/types/asyncapi.ts');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface JsonSchema {
    type?: string;
    enum?: unknown[];
    format?: string;
    properties?: Record<string, JsonSchema>;
    required?: string[];
    items?: JsonSchema;
    $ref?: string;
    minimum?: number;
    minLength?: number;
    maxLength?: number;
    additionalProperties?: boolean;
    description?: string;
}

/**
 * Converts a JSON Schema node to a TypeScript type string.
 * Nested objects are inlined (indented) rather than split into separate types.
 */
const schemaToTs = (
    schema: JsonSchema,
    componentSchemas: Record<string, JsonSchema>,
    depth = 0
): string => {
    // Follow $ref to a named component schema
    if (schema.$ref) {
        const refName = schema.$ref.replace('#/components/schemas/', '');
        return `I${refName}`;
    }

    // Enum → union of literal types
    if (schema.enum) {
        return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
    }

    // Object → inline interface block
    if (schema.type === 'object' && schema.properties) {
        const pad = '    '.repeat(depth);
        const innerPad = '    '.repeat(depth + 1);
        const required = schema.required ?? [];
        const fields = Object.entries(schema.properties).map(([key, prop]) => {
            const opt = required.includes(key) ? '' : '?';
            const tsType = schemaToTs(prop, componentSchemas, depth + 1);
            return `${innerPad}${key}${opt}: ${tsType};`;
        });
        return `{\n${fields.join('\n')}\n${pad}}`;
    }

    // Array → T[]
    if (schema.type === 'array' && schema.items) {
        const itemType = schemaToTs(schema.items, componentSchemas, depth);
        return `${itemType}[]`;
    }

    // Scalar types
    const typeMap: Record<string, string> = {
        string: 'string',
        integer: 'number',
        number: 'number',
        boolean: 'boolean'
    };
    return typeMap[schema.type ?? ''] ?? 'unknown';
};

/**
 * Renders a named top-level interface for a component schema.
 * Adds an optional doc-comment for the description field.
 */
const renderInterface = (
    name: string,
    schema: JsonSchema,
    componentSchemas: Record<string, JsonSchema>
): string => {
    const lines: string[] = [];
    if (schema.description) lines.push(`/** ${schema.description} */`);
    lines.push(`export interface I${name} ${schemaToTs(schema, componentSchemas, 0)}`);
    return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface AsyncApiDoc {
    channels: Record<string, unknown>;
    components: {
        schemas: Record<string, JsonSchema>;
        messages: Record<string, { payload?: JsonSchema }>;
    };
}

const doc = yaml.load(readFileSync(INPUT, 'utf8')) as AsyncApiDoc;
const { schemas, messages } = doc.components;
const channelKeys = Object.keys(doc.channels);

// ---------------------------------------------------------------------------
// Build channel-name constant groups
// ---------------------------------------------------------------------------

const chatChannels = channelKeys.filter((k) => k.startsWith('realtime.chat.'));
const observabilityChannels = channelKeys.filter((k) => k.startsWith('observability.'));
const ecommerceChannels = channelKeys.filter((k) => k.startsWith('ecommerce.'));

/** 'realtime.chat.event.user.joined' → 'EVENT_USER_JOINED' */
const toConstKey = (channelName: string, prefix: string): string =>
    channelName.replace(prefix, '').replace(/[._]/g, '_').replace(/^_/, '').toUpperCase();

const renderConstGroup = (
    exportName: string,
    channels: string[],
    prefix: string,
    doc: string
): string => {
    const entries = channels.map((ch) => `    ${toConstKey(ch, prefix)}: '${ch}',`).join('\n');
    return `/** ${doc} */\nexport const ${exportName} = {\n${entries}\n} as const;\n`;
};

// ---------------------------------------------------------------------------
// Assemble output
// ---------------------------------------------------------------------------

const parts: string[] = [
    '// GENERATED — do not edit manually.',
    '// Source: asyncapi.yaml  |  Regenerate: npm run gen:asyncapi-types',
    '',
    '// ---------------------------------------------------------------------------',
    '// Channel name constants (canonical event identifiers from asyncapi.yaml)',
    '// ---------------------------------------------------------------------------',
    '',
    renderConstGroup(
        'CHAT_CHANNELS',
        chatChannels,
        'realtime.chat.',
        'WebSocket chat channel names'
    ),
    renderConstGroup(
        'OBSERVABILITY_CHANNELS',
        observabilityChannels,
        'observability.',
        'SSE observability channel names'
    ),
    renderConstGroup(
        'ECOMMERCE_CHANNELS',
        ecommerceChannels,
        'ecommerce.',
        'Ecommerce domain event channel names'
    ),
    '/** Union of all SSE observability channel names. */',
    'export type TObservabilityChannel =',
    '    (typeof OBSERVABILITY_CHANNELS)[keyof typeof OBSERVABILITY_CHANNELS];',
    '',
    '/** Union of all ecommerce channel names. */',
    'export type TEcommerceChannel =',
    '    (typeof ECOMMERCE_CHANNELS)[keyof typeof ECOMMERCE_CHANNELS];',
    '',
    '// ---------------------------------------------------------------------------',
    '// Component schemas',
    '// ---------------------------------------------------------------------------',
    '',
    ...Object.entries(schemas).map(([name, schema]) => renderInterface(name, schema, schemas)),
    '',
    '// ---------------------------------------------------------------------------',
    '// Inline message schemas (not in components.schemas but used in channels)',
    '// ---------------------------------------------------------------------------',
    ''
];

// Render each message payload that is an inline object (no $ref at top level)
for (const [msgName, msg] of Object.entries(messages)) {
    const payload = msg.payload;
    if (!payload || payload.$ref) continue; // skip ref-only payloads (already in schemas)
    parts.push(renderInterface(msgName, payload, schemas));
    parts.push('');
}

// ---------------------------------------------------------------------------
// Chat-specific union types and helpers (hand-authored additions)
// These supplement the raw schemas with TypeScript union types and constants
// that make the generated output directly usable in the application.
// ---------------------------------------------------------------------------

parts.push(
    '// ---------------------------------------------------------------------------',
    '// Application-level union types (built from generated interfaces above)',
    '// ---------------------------------------------------------------------------',
    '',
    '/** Default chat room name — mirrors the enum constraint in asyncapi.yaml. */',
    "export const DEFAULT_CHAT_ROOM = 'general' as const;",
    'export type TChatRoom = typeof DEFAULT_CHAT_ROOM;',
    '',
    '/** All event types a chat client can send to the server. */',
    'export type TChatClientEvent = IChatJoinCommand | IChatMessageSendCommand;',
    '',
    '/** All event types the server can push to a chat client. */',
    'export type TChatServerEvent =',
    '    | IChatSystemPayload',
    '    | IChatMessagePayload',
    '    | IChatPresencePayload',
    '    | IChatJoinedEvent',
    '    | IChatErrorEvent;',
    ''
);

const output = parts.join('\n');
writeFileSync(OUTPUT, output, 'utf8');
console.log(`✓ Generated ${OUTPUT}`);
