export class ObjectId {
    private readonly value: string;

    constructor(value?: string | number) {
        this.value = String(value ?? Math.floor(Math.random() * 1_000_000_000));
    }

    toString() {
        return this.value;
    }

    equals(other: unknown) {
        return String((other as { toString?: () => string })?.toString?.() ?? other) === this.value;
    }

    static isValid(value: unknown) {
        return value !== undefined && value !== null && String(value).trim() !== '';
    }
}

// eslint-disable-next-line @typescript-eslint/naming-convention
export const Types = { ObjectId };
export type CastError = Error & { kind?: string };
export default { Types };
