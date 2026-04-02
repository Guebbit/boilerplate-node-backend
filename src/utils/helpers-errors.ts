import { logger } from './winston';

/**
 * Extension of Error class with some customization
 */
export class ExtendedError extends Error {
    public readonly name: string;
    public readonly httpCode: number;
    public readonly isOperational: boolean;
    public readonly errors: string[];

    constructor(name: string, httpCode: number, isOperational = false, errors: string[] = []) {
        super(name + ': ' + errors.join('. '));
        Object.setPrototypeOf(this, new.target.prototype);
        this.name = name;
        this.httpCode = httpCode;
        this.isOperational = isOperational;
        this.errors = errors;
        if (!isOperational)
            logger.error({
                message: this.message,
                stack: this.stack,
                name: this.name,
                errors: this.errors,
                httpCode: this.httpCode
            });
    }
}

export function databaseErrorInterpreter(error: Error): [number, string] {
    const anyError = error as Error & { httpCode?: number; status?: number };
    const status = anyError.httpCode ?? anyError.status ?? 500;
    return [status, error.message || 'Unknown error'];
}

export function databaseErrorConverter(error: Error) {
    const anyError = error as Error & { httpCode?: number; status?: number };
    const status = anyError.httpCode ?? anyError.status ?? 500;
    return new ExtendedError(error.message, status);
}
