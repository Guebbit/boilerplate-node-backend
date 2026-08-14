/* eslint-disable @typescript-eslint/naming-convention */
/*
 * GENERATED — do not edit manually.
 * Source: asyncapi.yaml  |  Regenerate: npm run gen:asyncapi
 */

export interface ObservabilityMetricsPayload {
  'timestamp': string;
  'uptimeSeconds': number;
  'memory': AnonymousSchema3;
  'http': AnonymousSchema8;
  'realtime': AnonymousSchema11;
}
export interface AnonymousSchema3 {
  'rss': number;
  'heapUsed': number;
  'heapTotal': number;
  'external': number;
}
export interface AnonymousSchema8 {
  'totalRequests': number;
  'totalErrors': number;
}
export interface AnonymousSchema11 {
  'sseClients': number;
}
export interface EmailJobPayload {
  'request': AnonymousSchema13;
  'from'?: string;
  'templateName': string;
  'data': Record<string, unknown>;
}
export interface AnonymousSchema13 {
  'to': string;
  'subject'?: string;
  'text'?: string;
  'html'?: string;
}
export interface PdfJobPayload {
  'templatePath': string;
  'templateData': Record<string, unknown>;
  'outputPath': string;
}

export type MetricsSnapshotEvent = ObservabilityMetricsPayload;
export type MetricsUpdatedEvent = ObservabilityMetricsPayload;
export type HeartbeatEvent = ObservabilityMetricsPayload;
export type EmailJobMessage = EmailJobPayload;
export type PdfJobMessage = PdfJobPayload;
export type EmailJobConsumeMessage = EmailJobPayload;
export type PdfJobConsumeMessage = PdfJobPayload;

/* Channel name constants (canonical identifiers from asyncapi.yaml) */

/* Channel names in the "observability." namespace */
export const OBSERVABILITY_CHANNELS = {
    METRICS_SNAPSHOT: 'observability.metrics.snapshot',
    METRICS_UPDATED: 'observability.metrics.updated',
    HEARTBEAT: 'observability.heartbeat',
} as const;

/* Union of every "observability." channel name */
export type ObservabilityChannel = (typeof OBSERVABILITY_CHANNELS)[keyof typeof OBSERVABILITY_CHANNELS];

/* Channel names in the "worker." namespace */
export const WORKER_CHANNELS = {
    EMAIL_SEND: 'worker.email.send',
    PDF_GENERATE: 'worker.pdf.generate',
} as const;

/* Union of every "worker." channel name */
export type WorkerChannel = (typeof WORKER_CHANNELS)[keyof typeof WORKER_CHANNELS];

export const REALTIME_SSE_EVENT_NAMES = [
    "observability.heartbeat",
    "observability.metrics.snapshot",
    "observability.metrics.updated",
] as const;
export type SseEventName = (typeof REALTIME_SSE_EVENT_NAMES)[number];
export interface SseEventPayloadMap {
    "observability.heartbeat": HeartbeatEvent;
    "observability.metrics.snapshot": MetricsSnapshotEvent;
    "observability.metrics.updated": MetricsUpdatedEvent;
}
export type SseEventPayload<TEventName extends SseEventName> = SseEventPayloadMap[TEventName];
