/**
 * Unit tests for Phase 3 tracing utilities
 *
 * Tests cover:
 *  - getTracer: returns a working tracer
 *  - withSpan: success path ends the span with OK status
 *  - withSpan: error path records the exception and re-throws
 *  - getActiveSpanContext: returns IDs when a span is active
 *  - getActiveSpanContext: returns undefined when no span is active
 *  - setActiveSpanAttributes: sets attributes on the active span
 *  - recordErrorOnActiveSpan: marks the span as error and records exception
 */

import { trace, context, ROOT_CONTEXT } from '@opentelemetry/api';
import {
    InMemorySpanExporter,
    SimpleSpanProcessor,
    NodeTracerProvider
} from '@opentelemetry/sdk-trace-node';
import {
    getTracer,
    withSpan,
    getActiveSpanContext,
    setActiveSpanAttributes,
    recordErrorOnActiveSpan
} from '@utils/tracer';

// ---------------------------------------------------------------------------
// Test tracer provider + in-memory exporter (no full SDK needed in tests)
// ---------------------------------------------------------------------------

// Each describe block sets up and tears down its own provider to stay isolated.
const setupTestProvider = () => {
    const exporter = new InMemorySpanExporter();
    const provider = new NodeTracerProvider({
        spanProcessors: [new SimpleSpanProcessor(exporter)]
    });
    provider.register(); // registers as the global tracer provider
    return { exporter, provider };
};

const teardownTestProvider = async (provider: NodeTracerProvider) => {
    await provider.shutdown();
    trace.disable();
};

// ---------------------------------------------------------------------------
// getTracer
// ---------------------------------------------------------------------------

describe('getTracer', () => {
    it('returns a tracer without throwing', () => {
        expect(() => getTracer()).not.toThrow();
    });

    it('returned tracer can start a span', async () => {
        const { provider } = setupTestProvider();
        const span = getTracer().startSpan('test-span');
        expect(span).toBeDefined();
        span.end();
        await teardownTestProvider(provider);
    });
});

// ---------------------------------------------------------------------------
// withSpan — success path
// ---------------------------------------------------------------------------

describe('withSpan — success', () => {
    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;

    beforeEach(() => {
        ({ exporter, provider } = setupTestProvider());
    });

    afterEach(async () => {
        await teardownTestProvider(provider);
    });

    it('resolves with the callback return value', async () => {
        const result = await withSpan('my-span', async () => 42);
        expect(result).toBe(42);
    });

    it('exports a finished span with the given name', async () => {
        await withSpan('export-test', async () => 'done');
        const spans = exporter.getFinishedSpans();
        expect(spans.some((s) => s.name === 'export-test')).toBe(true);
    });

    it('sets attributes passed as third argument', async () => {
        await withSpan('attr-test', async () => {}, { testKey: 'testValue' });
        const spans = exporter.getFinishedSpans();
        const span = spans.find((s) => s.name === 'attr-test');
        expect(span?.attributes['testKey']).toBe('testValue');
    });
});

// ---------------------------------------------------------------------------
// withSpan — error path
// ---------------------------------------------------------------------------

describe('withSpan — error', () => {
    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;

    beforeEach(() => {
        ({ exporter, provider } = setupTestProvider());
    });

    afterEach(async () => {
        await teardownTestProvider(provider);
    });

    it('re-throws the error', async () => {
        await expect(
            withSpan('failing-span', async () => {
                throw new Error('oops');
            })
        ).rejects.toThrow('oops');
    });

    it('still ends the span even when the callback throws', async () => {
        await withSpan('failing-span-2', async () => {
            throw new Error('boom');
        }).catch(() => {});
        const spans = exporter.getFinishedSpans();
        expect(spans.some((s) => s.name === 'failing-span-2')).toBe(true);
    });

    it('records an exception event on the span', async () => {
        await withSpan('exc-span', async () => {
            throw new Error('exception message');
        }).catch(() => {});
        const spans = exporter.getFinishedSpans();
        const span = spans.find((s) => s.name === 'exc-span');
        const exceptionEvent = span?.events.find((e) => e.name === 'exception');
        expect(exceptionEvent).toBeDefined();
        expect(exceptionEvent?.attributes?.['exception.message']).toBe('exception message');
    });
});

// ---------------------------------------------------------------------------
// getActiveSpanContext
// ---------------------------------------------------------------------------

describe('getActiveSpanContext', () => {
    let provider: NodeTracerProvider;

    beforeEach(() => {
        ({ provider } = setupTestProvider());
    });

    afterEach(async () => {
        await teardownTestProvider(provider);
    });

    it('returns undefined IDs when no span is active', () => {
        const result = getActiveSpanContext();
        expect(result.traceId).toBeUndefined();
        expect(result.spanId).toBeUndefined();
    });

    it('returns valid IDs within an active span', async () => {
        await getTracer().startActiveSpan('ctx-test', async (span) => {
            const result = getActiveSpanContext();
            expect(result.traceId).toMatch(/^[\da-f]{32}$/);
            expect(result.spanId).toMatch(/^[\da-f]{16}$/);
            span.end();
        });
    });
});

// ---------------------------------------------------------------------------
// setActiveSpanAttributes
// ---------------------------------------------------------------------------

describe('setActiveSpanAttributes', () => {
    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;

    beforeEach(() => {
        ({ exporter, provider } = setupTestProvider());
    });

    afterEach(async () => {
        await teardownTestProvider(provider);
    });

    it('does not throw when no span is active', () => {
        expect(() => setActiveSpanAttributes({ key: 'value' })).not.toThrow();
    });

    it('sets attributes on the active span', async () => {
        await getTracer().startActiveSpan('attr-span', async (span) => {
            setActiveSpanAttributes({ dynamicAttr: 'hello' });
            span.end();
        });
        const spans = exporter.getFinishedSpans();
        const span = spans.find((s) => s.name === 'attr-span');
        expect(span?.attributes['dynamicAttr']).toBe('hello');
    });
});

// ---------------------------------------------------------------------------
// recordErrorOnActiveSpan
// ---------------------------------------------------------------------------

describe('recordErrorOnActiveSpan', () => {
    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;

    beforeEach(() => {
        ({ exporter, provider } = setupTestProvider());
    });

    afterEach(async () => {
        await teardownTestProvider(provider);
    });

    it('does not throw when no span is active', () => {
        expect(() => recordErrorOnActiveSpan(new Error('no span'))).not.toThrow();
    });

    it('records the exception event on the active span', async () => {
        await getTracer().startActiveSpan('err-span', async (span) => {
            recordErrorOnActiveSpan(new Error('recorded'));
            span.end();
        });
        const spans = exporter.getFinishedSpans();
        const span = spans.find((s) => s.name === 'err-span');
        const exceptionEvent = span?.events.find((e) => e.name === 'exception');
        expect(exceptionEvent).toBeDefined();
        expect(exceptionEvent?.attributes?.['exception.message']).toBe('recorded');
    });

    it('accepts non-Error values', async () => {
        await getTracer().startActiveSpan('str-err-span', async (span) => {
            // Should not throw — string errors are handled gracefully.
            recordErrorOnActiveSpan('string error');
            span.end();
        });
        const spans = exporter.getFinishedSpans();
        expect(spans.some((s) => s.name === 'str-err-span')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Verify ROOT_CONTEXT baseline (sanity check)
// ---------------------------------------------------------------------------

describe('context baseline', () => {
    it('trace.getActiveSpan() returns undefined outside any active span', () => {
        context.with(ROOT_CONTEXT, () => {
            expect(trace.getActiveSpan()).toBeUndefined();
        });
    });
});


// ---------------------------------------------------------------------------
// getTracer
// ---------------------------------------------------------------------------

describe('getTracer', () => {
    it('returns a tracer without throwing', () => {
        expect(() => getTracer()).not.toThrow();
    });

    it('returned tracer can start a span', () => {
        const { provider } = setupTestProvider();
        const span = getTracer().startSpan('test-span');
        expect(span).toBeDefined();
        span.end();
        teardownTestProvider(provider);
    });
});

// ---------------------------------------------------------------------------
// withSpan — success path
// ---------------------------------------------------------------------------

describe('withSpan — success', () => {
    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;

    beforeEach(() => {
        ({ exporter, provider } = setupTestProvider());
    });

    afterEach(() => {
        teardownTestProvider(provider);
    });

    it('resolves with the callback return value', async () => {
        const result = await withSpan('my-span', async () => 42);
        expect(result).toBe(42);
    });

    it('exports a finished span with the given name', async () => {
        await withSpan('export-test', async () => 'done');
        const spans = exporter.getFinishedSpans();
        expect(spans.some((s) => s.name === 'export-test')).toBe(true);
    });

    it('sets attributes passed as third argument', async () => {
        await withSpan('attr-test', async () => {}, { testKey: 'testValue' });
        const spans = exporter.getFinishedSpans();
        const span = spans.find((s) => s.name === 'attr-test');
        expect(span?.attributes['testKey']).toBe('testValue');
    });
});

// ---------------------------------------------------------------------------
// withSpan — error path
// ---------------------------------------------------------------------------

describe('withSpan — error', () => {
    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;

    beforeEach(() => {
        ({ exporter, provider } = setupTestProvider());
    });

    afterEach(() => {
        teardownTestProvider(provider);
    });

    it('re-throws the error', async () => {
        await expect(
            withSpan('failing-span', async () => {
                throw new Error('oops');
            })
        ).rejects.toThrow('oops');
    });

    it('still ends the span even when the callback throws', async () => {
        await withSpan('failing-span-2', async () => {
            throw new Error('boom');
        }).catch(() => {});
        const spans = exporter.getFinishedSpans();
        expect(spans.some((s) => s.name === 'failing-span-2')).toBe(true);
    });

    it('records an exception event on the span', async () => {
        await withSpan('exc-span', async () => {
            throw new Error('exception message');
        }).catch(() => {});
        const spans = exporter.getFinishedSpans();
        const span = spans.find((s) => s.name === 'exc-span');
        const exceptionEvent = span?.events.find((e) => e.name === 'exception');
        expect(exceptionEvent).toBeDefined();
        expect(exceptionEvent?.attributes?.['exception.message']).toBe('exception message');
    });
});

// ---------------------------------------------------------------------------
// getActiveSpanContext
// ---------------------------------------------------------------------------

describe('getActiveSpanContext', () => {
    let provider: NodeTracerProvider;

    beforeEach(() => {
        ({ provider } = setupTestProvider());
    });

    afterEach(() => {
        teardownTestProvider(provider);
    });

    it('returns undefined IDs when no span is active', () => {
        const result = getActiveSpanContext();
        expect(result.traceId).toBeUndefined();
        expect(result.spanId).toBeUndefined();
    });

    it('returns valid IDs within an active span', async () => {
        await getTracer().startActiveSpan('ctx-test', async (span) => {
            const result = getActiveSpanContext();
            expect(result.traceId).toMatch(/^[\da-f]{32}$/);
            expect(result.spanId).toMatch(/^[\da-f]{16}$/);
            span.end();
        });
    });
});

// ---------------------------------------------------------------------------
// setActiveSpanAttributes
// ---------------------------------------------------------------------------

describe('setActiveSpanAttributes', () => {
    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;

    beforeEach(() => {
        ({ exporter, provider } = setupTestProvider());
    });

    afterEach(() => {
        teardownTestProvider(provider);
    });

    it('does not throw when no span is active', () => {
        expect(() => setActiveSpanAttributes({ key: 'value' })).not.toThrow();
    });

    it('sets attributes on the active span', async () => {
        await getTracer().startActiveSpan('attr-span', async (span) => {
            setActiveSpanAttributes({ dynamicAttr: 'hello' });
            span.end();
        });
        const spans = exporter.getFinishedSpans();
        const span = spans.find((s) => s.name === 'attr-span');
        expect(span?.attributes['dynamicAttr']).toBe('hello');
    });
});

// ---------------------------------------------------------------------------
// recordErrorOnActiveSpan
// ---------------------------------------------------------------------------

describe('recordErrorOnActiveSpan', () => {
    let exporter: InMemorySpanExporter;
    let provider: NodeTracerProvider;

    beforeEach(() => {
        ({ exporter, provider } = setupTestProvider());
    });

    afterEach(() => {
        teardownTestProvider(provider);
    });

    it('does not throw when no span is active', () => {
        expect(() => recordErrorOnActiveSpan(new Error('no span'))).not.toThrow();
    });

    it('records the exception event on the active span', async () => {
        await getTracer().startActiveSpan('err-span', async (span) => {
            recordErrorOnActiveSpan(new Error('recorded'));
            span.end();
        });
        const spans = exporter.getFinishedSpans();
        const span = spans.find((s) => s.name === 'err-span');
        const exceptionEvent = span?.events.find((e) => e.name === 'exception');
        expect(exceptionEvent).toBeDefined();
        expect(exceptionEvent?.attributes?.['exception.message']).toBe('recorded');
    });

    it('accepts non-Error values', async () => {
        await getTracer().startActiveSpan('str-err-span', async (span) => {
            // Should not throw — string errors are handled gracefully.
            recordErrorOnActiveSpan('string error');
            span.end();
        });
        const spans = exporter.getFinishedSpans();
        expect(spans.some((s) => s.name === 'str-err-span')).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// Verify ROOT_CONTEXT baseline (sanity check)
// ---------------------------------------------------------------------------

describe('context baseline', () => {
    it('trace.getActiveSpan() returns undefined outside any active span', () => {
        context.with(ROOT_CONTEXT, () => {
            expect(trace.getActiveSpan()).toBeUndefined();
        });
    });
});
