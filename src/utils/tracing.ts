import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor, type SpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { RedisInstrumentation } from '@opentelemetry/instrumentation-redis';

let sdk: NodeSDK | undefined;
let started = false;

/** Build the OTLP processor when an endpoint is configured. */
const buildProcessors = (): SpanProcessor[] => {
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (!otlpEndpoint) return [];

    return [
        new BatchSpanProcessor(
            new OTLPTraceExporter({
                url: `${otlpEndpoint}/v1/traces`,
                headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
                    ? Object.fromEntries(
                          process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',').map((h) =>
                              h.split('=').map((p) => p.trim())
                          )
                      )
                    : {}
            })
        )
    ];
};

/** Start the OpenTelemetry SDK. Safe to call multiple times. */
export const startTracing = (): void => {
    if (started) return;
    started = true;

    const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: process.env.NODE_SERVICE_NAME ?? 'api',
        [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0'
    });

    sdk = new NodeSDK({
        resource,
        spanProcessors: buildProcessors(),
        instrumentations: [
            new HttpInstrumentation(),
            new ExpressInstrumentation(),
            new MongooseInstrumentation(),
            new RedisInstrumentation()
        ]
    });

    sdk.start();
};

/** Flush pending spans and shut down the SDK cleanly. */
export const shutdownTracing = (): Promise<void> => {
    if (!sdk) return Promise.resolve();
    return sdk.shutdown();
};
