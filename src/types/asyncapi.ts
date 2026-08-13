/* eslint-disable @typescript-eslint/naming-convention */
/*
 * GENERATED — do not edit manually.
 * Source: asyncapi.yaml  |  Regenerate: npm run gen:asyncapi
 */

export interface IObservabilityMetricsPayload {
  'timestamp': string;
  'uptimeSeconds': number;
  'memory': IAnonymousSchema3;
  'http': IAnonymousSchema8;
  'realtime': IAnonymousSchema11;
}
export interface IAnonymousSchema3 {
  'rss': number;
  'heapUsed': number;
  'heapTotal': number;
  'external': number;
}
export interface IAnonymousSchema8 {
  'totalRequests': number;
  'totalErrors': number;
}
export interface IAnonymousSchema11 {
  'sseClients': number;
}
export interface IEmailJobPayload {
  'request': IAnonymousSchema13;
  'from'?: string;
  'templateName': string;
  'data': Record<string, unknown>;
}
export interface IAnonymousSchema13 {
  'to': string;
  'subject'?: string;
  'text'?: string;
  'html'?: string;
}
export interface IPdfJobPayload {
  'templatePath': string;
  'templateData': Record<string, unknown>;
  'outputPath': string;
}

export type IMetricsSnapshotEvent = IObservabilityMetricsPayload;
export type IMetricsUpdatedEvent = IObservabilityMetricsPayload;
export type IHeartbeatEvent = IObservabilityMetricsPayload;
export type IEmailJobMessage = IEmailJobPayload;
export type IPdfJobMessage = IPdfJobPayload;
export type IEmailJobConsumeMessage = IEmailJobPayload;
export type IPdfJobConsumeMessage = IPdfJobPayload;

/* Channel name constants (canonical identifiers from asyncapi.yaml) */

/* Channel names in the "observability." namespace */
export const OBSERVABILITY_CHANNELS = {
    METRICS_SNAPSHOT: 'observability.metrics.snapshot',
    METRICS_UPDATED: 'observability.metrics.updated',
    HEARTBEAT: 'observability.heartbeat',
} as const;

/* Union of every "observability." channel name */
export type TObservabilityChannel = (typeof OBSERVABILITY_CHANNELS)[keyof typeof OBSERVABILITY_CHANNELS];

/* Channel names in the "worker." namespace */
export const WORKER_CHANNELS = {
    EMAIL_SEND: 'worker.email.send',
    PDF_GENERATE: 'worker.pdf.generate',
} as const;

/* Union of every "worker." channel name */
export type TWorkerChannel = (typeof WORKER_CHANNELS)[keyof typeof WORKER_CHANNELS];

export const REALTIME_SSE_EVENT_NAMES = [
    "observability.heartbeat",
    "observability.metrics.snapshot",
    "observability.metrics.updated",
] as const;
export type ISseEventName = (typeof REALTIME_SSE_EVENT_NAMES)[number];
export interface ISseEventPayloadMap {
    "observability.heartbeat": IHeartbeatEvent;
    "observability.metrics.snapshot": IMetricsSnapshotEvent;
    "observability.metrics.updated": IMetricsUpdatedEvent;
}
export type ISseEventPayload<TEventName extends ISseEventName> = ISseEventPayloadMap[TEventName];
