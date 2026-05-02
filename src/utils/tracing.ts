/**
 * OpenTelemetry SDK initialization — Phase 3
 *
 * Call startTracing() BEFORE any other imports to enable auto-instrumentation.
 * See: docs/guide/opentelemetry-tracing.md
 *
 * Exporters:
 *   - ConsoleSpanExporter  — always active in non-production (human-readable spans to stdout)
 *   - OTLPTraceExporter    — active when OTEL_EXPORTER_OTLP_ENDPOINT is set (Tempo / Jaeger)
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
    ATTR_SERVICE_NAME,
    SEMRESATTRS_SERVICE_VERSION
} from '@opentelemetry/semantic-conventions';
import {
    ConsoleSpanExporter,
    SimpleSpanProcessor,
    BatchSpanProcessor,
    type SpanProcessor
} from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';

// The SDK instance — kept module-local so only start/shutdown are public.
let sdk: NodeSDK | undefined;

// True once startTracing() has been called, prevents double-init.
let started = false;

/**
 * Build the list of span processors from environment configuration.
 * At least one processor is always returned (console in non-production,
 * or a no-op in production without OTLP configured).
 */
const buildProcessors = (): SpanProcessor[] => {
    const processors: SpanProcessor[] = [];

    // Console exporter: only in non-production so spans appear in dev logs.
    if (process.env.NODE_ENV !== 'production') {
        processors.push(new SimpleSpanProcessor(new ConsoleSpanExporter()));
    }

    // OTLP exporter: enabled when an endpoint is configured (e.g. Grafana Tempo).
    const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    if (otlpEndpoint) {
        // BatchSpanProcessor buffers spans and flushes in the background — preferred for prod.
        processors.push(
            new BatchSpanProcessor(
                new OTLPTraceExporter({
                    // The SDK convention is: endpoint = base URL, path appended automatically.
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
        );
    }

    return processors;
};

/**
 * Start the OpenTelemetry SDK.
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export const startTracing = (): void => {
    if (started) return;
    started = true;

    // Service identity resource: visible in every exported span.
    const resource = resourceFromAttributes({
        [ATTR_SERVICE_NAME]: process.env.NODE_SERVICE_NAME ?? 'api',
        [SEMRESATTRS_SERVICE_VERSION]: process.env.npm_package_version ?? '0.0.0'
    });

    const processors = buildProcessors();

    sdk = new NodeSDK({
        resource,
        spanProcessors: processors,
        // Auto-instrument the Node.js HTTP layer and Express router.
        // These must be registered before express/http are first imported
        // (ensured by importing this file before app.ts).
        instrumentations: [new HttpInstrumentation(), new ExpressInstrumentation()]
    });

    sdk.start();
};

/**
 * Flush pending spans and shut down the SDK cleanly.
 * Called during graceful shutdown so no spans are lost.
 */
export const shutdownTracing = (): Promise<void> => {
    if (!sdk) return Promise.resolve();
    return sdk.shutdown();
};
