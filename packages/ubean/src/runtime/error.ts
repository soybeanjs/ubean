export class UbeanError extends Error {
  statusCode: number;
  statusMessage: string;
  data?: unknown;

  constructor(statusCode: number, statusMessage?: string, data?: unknown) {
    super(statusMessage);
    this.name = 'UbeanError';
    this.statusCode = statusCode;
    this.statusMessage = statusMessage || statusCodeToMessage(statusCode);
    this.data = data;
  }
}

export function createError(options: {
  statusCode: number;
  statusMessage?: string;
  data?: unknown;
  message?: string;
}): UbeanError {
  return new UbeanError(options.statusCode, options.statusMessage || options.message, options.data);
}

function statusCodeToMessage(code: number): string {
  const messages: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    408: 'Request Timeout',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    501: 'Not Implemented',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
  };
  return messages[code] || 'Error';
}

export function isUbeanError(err: unknown): err is UbeanError {
  return err instanceof UbeanError || (err instanceof Error && err.name === 'UbeanError' && typeof (err as any).statusCode === 'number');
}

export function errorToResponse(c: unknown, err?: unknown): Response {
  const error = err ?? c;
  if (isUbeanError(error)) {
    return new Response(
      JSON.stringify({
        error: error.statusMessage,
        statusCode: error.statusCode,
        data: error.data
      }),
      {
        status: error.statusCode,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  const message = error instanceof Error ? error.message : String(error);
  return new Response(JSON.stringify({ error: 'Internal Server Error', message }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' }
  });
}
