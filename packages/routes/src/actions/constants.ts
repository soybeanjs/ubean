/**
 * Shared constants for Server Actions RPC.
 *
 * Kept in a leaf module so the browser runtime can import them without
 * pulling the Hono middleware barrel.
 */
export const ACTIONS_ENDPOINT = '/__actions';

export const ACTION_RESPONSE_HEADER = 'x-ubean-action';
