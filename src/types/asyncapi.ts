/* eslint-disable @typescript-eslint/naming-convention */
/*
 * GENERATED — do not edit manually.
 * Source: asyncapi.yaml  |  Regenerate: npm run genasyncapi
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
export interface ICartCheckedOutEvent {
  'eventName': IAnonymousSchema13;
  'eventId': string;
  'occurredAt': string;
  'cartId': string;
  'userId': string;
  'orderId': string;
  'itemCount': number;
}
export type IAnonymousSchema13 = "ecommerce.cart.checked_out";
export interface IEmailJobPayload {
  'request': IAnonymousSchema20;
  'from'?: string;
  'templateName': string;
  'data': Record<string, unknown>;
}
export interface IAnonymousSchema20 {
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
export interface ICacheTagsInvalidatedPayload {
  'tags': string[];
  'origin': string;
  'timestamp': string;
}

export type IMetricsSnapshotEvent = IObservabilityMetricsPayload;
export type IMetricsUpdatedEvent = IObservabilityMetricsPayload;
export type IHeartbeatEvent = IObservabilityMetricsPayload;
export type IEmailJobMessage = IEmailJobPayload;
export type IPdfJobMessage = IPdfJobPayload;
export type ICacheTagsInvalidatedMessage = ICacheTagsInvalidatedPayload;
export type IEmailJobConsumeMessage = IEmailJobPayload;
export type IPdfJobConsumeMessage = IPdfJobPayload;
export type ICacheTagsInvalidatedConsumeMessage = ICacheTagsInvalidatedPayload;

/* Channel name constants (canonical identifiers from asyncapi.yaml) */

/* Channel names in the "observability." namespace */
export const OBSERVABILITY_CHANNELS = {
    METRICS_SNAPSHOT: 'observability.metrics.snapshot',
    METRICS_UPDATED: 'observability.metrics.updated',
    HEARTBEAT: 'observability.heartbeat',
} as const;

/* Union of every "observability." channel name */
export type TObservabilityChannel = (typeof OBSERVABILITY_CHANNELS)[keyof typeof OBSERVABILITY_CHANNELS];

/* Channel names in the "ecommerce." namespace */
export const ECOMMERCE_CHANNELS = {
    CART_CHECKED_OUT: 'ecommerce.cart.checked_out',
} as const;

/* Union of every "ecommerce." channel name */
export type TEcommerceChannel = (typeof ECOMMERCE_CHANNELS)[keyof typeof ECOMMERCE_CHANNELS];

/* Channel names in the "worker." namespace */
export const WORKER_CHANNELS = {
    EMAIL_SEND: 'worker.email.send',
    PDF_GENERATE: 'worker.pdf.generate',
} as const;

/* Union of every "worker." channel name */
export type TWorkerChannel = (typeof WORKER_CHANNELS)[keyof typeof WORKER_CHANNELS];

/* Channel names in the "cache." namespace */
export const CACHE_CHANNELS = {
    TAGS_INVALIDATED: 'cache.tags.invalidated',
} as const;

/* Union of every "cache." channel name */
export type TCacheChannel = (typeof CACHE_CHANNELS)[keyof typeof CACHE_CHANNELS];

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
