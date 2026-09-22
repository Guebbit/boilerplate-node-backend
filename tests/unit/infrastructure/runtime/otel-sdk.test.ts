/**
 * @module
 * `otel-sdk.ts`'s `buildProcessors()` — not the whole SDK bootstrap: `startTracing()`
 * monkey-patches express/mongoose/redis/http globally and is not safe to call inside a Jest
 * worker shared with other test files.
 *
 * `@opentelemetry/sdk-trace`'s `BatchSpanProcessor` takes one options object (`{ exporter, ... }`)
 * — a real, silent-until-flush break from the deprecated `sdk-trace-base` two-argument form
 * `@opentelemetry/sdk-trace-node` re-exported: passing the exporter positionally leaves
 * `options.exporter` `undefined`, so a span queues fine and the failure only surfaces later,
 * inside `_flushAll()`, when it tries `undefined.export(...)`. `ts-check` catches the shape going
 * forward; this pins that a span really does reach a real exporter's `export()` at runtime too.
 */

import { TraceFlags } from '@opentelemetry/api';
import type { ReadableSpan } from '@opentelemetry/sdk-trace';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { asStub } from '@tests/stub';
import { withEnvironment } from '@tests/environment';
import { buildProcessors } from '@infrastructure/runtime/otel-sdk';

/**
 * Enough of a `ReadableSpan` to survive `onEnd`'s sampled check and `_flushOneBatch`'s resource
 * read — nothing else is read before the mocked `export()` swallows it.
 */
const sampledSpanStub = (): ReadableSpan =>
    asStub<ReadableSpan>({
        spanContext: () => ({ traceFlags: TraceFlags.SAMPLED }),
        resource: { asyncAttributesPending: false }
    });

describe('otel-sdk — buildProcessors', () => {
    it('is a no-op without OTEL_EXPORTER_OTLP_ENDPOINT', () => {
        // Never set by any test's own environment — this is the suite's ambient default, not a
        // fixture this case has to arrange.
        expect(process.env.OTEL_EXPORTER_OTLP_ENDPOINT).toBeUndefined();
        expect(buildProcessors()).toEqual([]);
    });

    it('forwards a finished span to a real exporter at flush time', async () => {
        // Spied on the class, not an instance: `buildProcessors()` constructs its own
        // `OTLPTraceExporter` internally, so there is no instance to spy on beforehand.
        const exportSpy = jest
            .spyOn(OTLPTraceExporter.prototype, 'export')
            .mockImplementation((_spans, callback) => callback({ code: 0 }));

        await withEnvironment('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://localhost:4318', async () => {
            const [processor] = buildProcessors();
            processor.onEnd(sampledSpanStub());
            await processor.forceFlush();
        });

        expect(exportSpy).toHaveBeenCalledTimes(1);
        exportSpy.mockRestore();
    });
});
