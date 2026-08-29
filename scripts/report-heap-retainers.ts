#!/usr/bin/env tsx
/**
 * Answers "who is holding these?" for one kind of heap object — the question `report-heap-summary.ts`
 * cannot, because it aggregates nodes and never reads the edges between them.
 *
 * A snapshot is a graph: `edges` records are handed out to nodes in order, so walking forwards
 * gives "what does X point at". This builds the REVERSE index to give "what points at X".
 *
 * Separate from `report-heap-summary.ts` because the memory profiles are opposite: retainers need the whole
 * graph resident. Expect to pass `NODE_OPTIONS=--max-old-space-size=10240` for a large snapshot.
 * Run `report-heap-summary.ts` first to find the dominant kind, then this to find its owner.
 *
 * ONE LIMIT: it picks *a* retainer at each step, not the *dominating* one. Past three or four
 * levels the chains wander into V8's own optimisation metadata, so read a deep run as a hint and a
 * shallow one as evidence.
 *
 * Usage: tsx scripts/report-heap-retainers.ts <file.heapsnapshot> [kind] [depth]
 *
 * See: docs/tools/mutation-testing.md#finding-the-culprit
 */
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';

const file = process.argv[2];
const wantedKind = process.argv[3] ?? 'JSArrayBufferData';
const depth = Number(process.argv[4] ?? 3);
if (!file) {
    console.error('usage: tsx scripts/report-heap-retainers.ts <file.heapsnapshot> [kind] [depth]');
    process.exit(2);
}

const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

const readHeader = async () => {
    const handle = await open(file, 'r');
    const { buffer } = await handle.read(Buffer.alloc(131_072), 0, 131_072, 0);
    await handle.close();
    const head = buffer.toString('utf8');
    const nodeFields = JSON.parse(/"node_fields":(\[[^\]]*])/.exec(head)![1]) as string[];
    const nodeTypes = JSON.parse(/"node_types":\[(\[[^\]]*])/.exec(head)![1]) as string[];
    const edgeFields = JSON.parse(/"edge_fields":(\[[^\]]*])/.exec(head)![1]) as string[];
    const edgeTypes = JSON.parse(/"edge_types":\[(\[[^\]]*])/.exec(head)![1]) as string[];
    const nodeCount = Number(/"node_count":(\d+)/.exec(head)![1]);
    const edgeCount = Number(/"edge_count":(\d+)/.exec(head)![1]);
    return { nodeFields, nodeTypes, edgeFields, edgeTypes, nodeCount, edgeCount };
};

/** Streams one bracketed top-level array, yielding raw text chunks. */
const streamArray = (key: string, onChunk: (text: string) => void): Promise<void> =>
    new Promise((resolve, reject) => {
        const opener = `"${key}":[`;
        let pending = '';
        let started = false;
        let depthCount = 0;
        let inString = false;
        let escaped = false;
        const stream = createReadStream(file, { encoding: 'utf8', highWaterMark: 1 << 22 });

        stream.on('data', (piece: string | Buffer) => {
            let text = pending + String(piece);
            pending = '';
            if (!started) {
                const at = text.indexOf(opener);
                if (at === -1) {
                    pending = text.slice(-opener.length);
                    return;
                }
                started = true;
                depthCount = 1;
                text = text.slice(at + opener.length);
            }
            let cut = text.length;
            // UTF-16 offsets on purpose: `cut` feeds `text.slice()`, which counts the same units.
            for (let index = 0; index < text.length; index++) {
                const character = text.charAt(index);
                if (escaped) {
                    escaped = false;
                    continue;
                }
                if (character === '\\' && inString) {
                    escaped = true;
                    continue;
                }
                if (character === '"') {
                    inString = !inString;
                    continue;
                }
                if (inString) continue;
                if (character === '[') depthCount += 1;
                else if (character === ']') {
                    depthCount -= 1;
                    if (depthCount === 0) {
                        cut = index;
                        break;
                    }
                }
            }
            onChunk(text.slice(0, cut));
            if (depthCount === 0) {
                stream.destroy();
                resolve();
            }
        });
        stream.on('error', reject);
        stream.on('close', () => resolve());
    });

/** Reads a flat integer array into a preallocated typed array. */
const readInts = async (key: string, out: Int32Array) => {
    let index = 0;
    let carry = '';
    await streamArray(key, (text) => {
        const values = (carry + text).split(',');
        carry = values.pop() ?? '';
        for (const raw of values) out[index++] = Number(raw);
    });
    if (carry.trim()) out[index++] = Number(carry);
    return index;
};

const main = async () => {
    const meta = await readHeader();
    const nodeStride = meta.nodeFields.length;
    const edgeStride = meta.edgeFields.length;
    const nTypeAt = meta.nodeFields.indexOf('type');
    const nNameAt = meta.nodeFields.indexOf('name');
    const nSizeAt = meta.nodeFields.indexOf('self_size');
    const nEdgeCountAt = meta.nodeFields.indexOf('edge_count');
    const eTypeAt = meta.edgeFields.indexOf('type');
    const eNameAt = meta.edgeFields.indexOf('name_or_index');
    const eToAt = meta.edgeFields.indexOf('to_node');

    console.error(
        `reading ${meta.nodeCount.toLocaleString()} nodes / ${meta.edgeCount.toLocaleString()} edges...`
    );

    const nodes = new Int32Array(meta.nodeCount * nodeStride);
    await readInts('nodes', nodes);
    const edges = new Int32Array(meta.edgeCount * edgeStride);
    await readInts('edges', edges);

    // Where each node's outgoing edges begin (edges are handed out in node order).
    const edgeStart = new Int32Array(meta.nodeCount + 1);
    let running = 0;
    for (let i = 0; i < meta.nodeCount; i += 1) {
        edgeStart[i] = running;
        running += nodes[i * nodeStride + nEdgeCountAt];
    }
    edgeStart[meta.nodeCount] = running;

    // Reverse index: for each node, which nodes point at it. Built as CSR to stay compact.
    const inDegree = new Int32Array(meta.nodeCount + 1);
    for (let e = 0; e < meta.edgeCount; e += 1) {
        const to = edges[e * edgeStride + eToAt] / nodeStride;
        inDegree[to] = (inDegree[to] ?? 0) + 1;
    }
    const returnValueStart = new Int32Array(meta.nodeCount + 1);
    running = 0;
    for (let i = 0; i < meta.nodeCount; i += 1) {
        returnValueStart[i] = running;
        running += inDegree[i];
    }
    returnValueStart[meta.nodeCount] = running;
    const cursor = Int32Array.from(returnValueStart);
    const retainer = new Int32Array(running);
    const retainerEdge = new Int32Array(running);
    for (let node = 0; node < meta.nodeCount; node += 1) {
        for (let e = edgeStart[node]; e < edgeStart[node + 1]; e += 1) {
            const to = edges[e * edgeStride + eToAt] / nodeStride;
            const slot = cursor[to];
            retainer[slot] = node;
            retainerEdge[slot] = e;
            cursor[to] = slot + 1;
        }
    }

    const nodeLabel = (node: number) => {
        const type = meta.nodeTypes[nodes[node * nodeStride + nTypeAt]] ?? '?';
        const nameIndex = nodes[node * nodeStride + nNameAt];
        return { type, nameIndex };
    };

    // Targets: nodes whose name matches the requested kind.
    const targets: number[] = [];
    const nameIndexCache = new Map<number, boolean>();
    // Resolve names first (need to know which name index equals wantedKind).
    const nameOf = new Map<number, string>();
    let stringIndex = 0;
    let stringCarry = '';
    await streamArray('strings', (text) => {
        const parts = (stringCarry + text).split('","');
        stringCarry = parts.pop() ?? '';
        for (const part of parts) {
            const clean = part.replaceAll(/^"|"$/g, '');
            if (clean.includes(wantedKind) || clean.length < 90) nameOf.set(stringIndex, clean);
            stringIndex += 1;
        }
    });

    for (let node = 0; node < meta.nodeCount; node += 1) {
        const nameIndex = nodes[node * nodeStride + nNameAt];
        let match = nameIndexCache.get(nameIndex);
        if (match === undefined) {
            match = (nameOf.get(nameIndex) ?? '').includes(wantedKind);
            nameIndexCache.set(nameIndex, match);
        }
        if (match) targets.push(node);
    }

    const totalBytes = targets.reduce((sum, n) => sum + nodes[n * nodeStride + nSizeAt], 0);
    console.log(
        `\n${targets.length.toLocaleString()} nodes matching "${wantedKind}", ${mb(totalBytes)} MB total\n`
    );

    // Aggregate retainer chains up to `depth` levels above the target.
    const chains = new Map<string, { count: number; bytes: number }>();
    for (const target of targets) {
        const parts: string[] = [];
        let current = target;
        const seen = new Set<number>([current]);
        for (let level = 0; level < depth; level += 1) {
            const from = returnValueStart[current];
            const to = returnValueStart[current + 1];
            if (from === to) {
                parts.push('<root>');
                break;
            }
            // Prefer a retainer that is not itself the same kind, to escape buffer->buffer chains.
            let chosen = retainer[from];
            let chosenEdge = retainerEdge[from];
            for (let r = from; r < to; r += 1) {
                if (!seen.has(retainer[r])) {
                    chosen = retainer[r]!;
                    chosenEdge = retainerEdge[r]!;
                    break;
                }
            }
            const { type, nameIndex } = nodeLabel(chosen);
            const edgeType = meta.edgeTypes[edges[chosenEdge * edgeStride + eTypeAt]] ?? '?';
            const edgeNameIndex = edges[chosenEdge * edgeStride + eNameAt];
            const edgeName =
                edgeType === 'element' || edgeType === 'hidden'
                    ? `[${edgeNameIndex}]`
                    : (nameOf.get(edgeNameIndex) ?? `#${edgeNameIndex}`);
            parts.push(`${type} ${nameOf.get(nameIndex) ?? `#${nameIndex}`} .${edgeName}`);
            if (seen.has(chosen)) break;
            seen.add(chosen);
            current = chosen;
        }
        const key = parts.join('  <-  ');
        const entry = chains.get(key) ?? { count: 0, bytes: 0 };
        entry.count += 1;
        entry.bytes += nodes[target * nodeStride + nSizeAt];
        chains.set(key, entry);
    }

    const ranked = [...chains.entries()].toSorted((a, b) => b[1].bytes - a[1].bytes).slice(0, 20);
    console.log(`${'bytes'.padStart(10)}  ${'count'.padStart(8)}  retainer chain (nearest first)`);
    console.log('-'.repeat(100));
    for (const [chain, { count, bytes }] of ranked) {
        console.log(
            `${`${mb(bytes)} MB`.padStart(10)}  ${count.toLocaleString().padStart(8)}  ${chain}`
        );
    }
};

void main();
