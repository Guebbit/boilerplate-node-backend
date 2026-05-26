import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { compile, type JSONSchema } from 'json-schema-to-typescript';
import { parse } from 'yaml';

interface IAsyncApiDocument {
    channels?: Record<string, IAsyncApiChannel>;
    components?: {
        messages?: Record<string, IAsyncApiMessage>;
        schemas?: Record<string, JSONSchema>;
    };
}

interface IAsyncApiChannel {
    publish?: IAsyncApiOperation;
    subscribe?: IAsyncApiOperation;
}

interface IAsyncApiOperation {
    message?: { $ref: string };
}

interface IAsyncApiMessage {
    payload?: JSONSchema | { $ref: string };
}

const INPUT_FILE_PATH = path.resolve('asyncapi.yaml');
const OUTPUT_FILE_PATH = path.resolve('src/utils/realtime-contracts.generated.ts');

/** Map AsyncAPI message names to stable in-app type names used by realtime modules/tests. */
const messageTypeMappings = [
    ['IChatJoinEvent', 'ChatJoinCommand'],
    ['IChatMessageSendEvent', 'ChatMessageSendCommand'],
    ['IChatSystemEvent', 'ChatSystemUserJoinedEvent'],
    ['IChatPresenceEvent', 'ChatPresenceUpdatedEvent'],
    ['IChatMessageEvent', 'ChatMessageNewEvent'],
    ['IChatJoinedEvent', 'ChatJoinedEvent'],
    ['IChatErrorEvent', 'ChatErrorEvent']
] as const;

const getReferencedName = (reference: string): string =>
    reference.replace('#/components/messages/', '').replace('#/components/schemas/', '');

const resolveSchema = (
    document: IAsyncApiDocument,
    schema: JSONSchema | { $ref: string }
): JSONSchema => {
    const reference = (schema as { $ref?: string }).$ref;
    if (typeof reference === 'string') {
        const schemaName = getReferencedName(reference);
        return (document.components?.schemas?.[schemaName] as JSONSchema) ?? {};
    }
    return schema;
};

const resolveMessagePayloadSchema = (
    document: IAsyncApiDocument,
    messageName: string
): JSONSchema => {
    const message = document.components?.messages?.[messageName];
    if (!message?.payload) return {};
    return resolveSchema(document, message.payload);
};

const getDefaultChatRoom = (joinSchema: JSONSchema): string => {
    const roomEnum = (
        joinSchema as {
            properties?: {
                payload?: {
                    properties?: {
                        room?: {
                            enum?: string[];
                        };
                    };
                };
            };
        }
    ).properties?.payload?.properties?.room?.enum;

    return roomEnum?.[0] ?? 'general';
};

const getObservabilityEventName = (
    document: IAsyncApiDocument,
    channel: string,
    fallback: string
): string => {
    if (!document.channels?.[channel]) return fallback;
    return channel.replace('observability.', '');
};

const compileSchema = (schema: JSONSchema, name: string): Promise<string> =>
    compile(schema, name, {
        bannerComment: '',
        style: {
            singleQuote: true
        }
    });

readFile(INPUT_FILE_PATH, 'utf8')
    .then((fileContent) => parse(fileContent) as IAsyncApiDocument)
    .then((document) => {
        /** Constants also come from the contract so runtime event names stay synced. */
        const joinSchema = resolveMessagePayloadSchema(document, 'ChatJoinCommand');
        const defaultChatRoom = getDefaultChatRoom(joinSchema);

        return Promise.all([
            ...messageTypeMappings.map(([typeName, messageName]) =>
                compileSchema(resolveMessagePayloadSchema(document, messageName), typeName)
            ),
            compileSchema(
                (document.components?.schemas?.ObservabilityMetricsPayload as JSONSchema) ?? {},
                'IObservabilityMetricsPayload'
            )
        ]).then((compiledSections) => ({
            compiledSections,
            defaultChatRoom,
            metricsSnapshotEvent: getObservabilityEventName(
                document,
                'observability.metrics.snapshot',
                'metrics.snapshot'
            ),
            metricsUpdatedEvent: getObservabilityEventName(
                document,
                'observability.metrics.updated',
                'metrics.updated'
            ),
            heartbeatEvent: getObservabilityEventName(
                document,
                'observability.heartbeat',
                'heartbeat'
            )
        }));
    })
    .then(
        ({
            compiledSections,
            defaultChatRoom,
            metricsSnapshotEvent,
            metricsUpdatedEvent,
            heartbeatEvent
        }) => {
            const fileContent = `/*\n * AUTO-GENERATED FILE.\n * Source: asyncapi.yaml\n * Command: npm run gen:asyncapi-types\n */\n\n${compiledSections.join('\n\n')}\n\nexport const DEFAULT_CHAT_ROOM = '${defaultChatRoom}';\n\nexport type TChatRoom = typeof DEFAULT_CHAT_ROOM;\n\nexport type TChatClientEvent = IChatJoinEvent | IChatMessageSendEvent;\n\nexport type TChatServerEvent =\n    | IChatSystemEvent\n    | IChatPresenceEvent\n    | IChatMessageEvent\n    | IChatJoinedEvent\n    | IChatErrorEvent;\n\nexport const OBSERVABILITY_SSE_EVENTS = {\n    SNAPSHOT: '${metricsSnapshotEvent}',\n    UPDATE: '${metricsUpdatedEvent}',\n    HEARTBEAT: '${heartbeatEvent}'\n} as const;\n\nexport type TObservabilitySseEventName =\n    (typeof OBSERVABILITY_SSE_EVENTS)[keyof typeof OBSERVABILITY_SSE_EVENTS];\n`;

            return writeFile(OUTPUT_FILE_PATH, fileContent);
        }
    );
