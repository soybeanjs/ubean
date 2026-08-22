import { listActions } from './registry';

/**
 * Optional OpenAPI fragment for the shared `POST /__actions` RPC.
 *
 * Per-action operations stay on the same endpoint (id in the body) so this
 * does not create a second RPC surface.
 */
export function describeActionsOpenApi(): {
  paths: Record<string, { post: { summary: string; description: string; operationId: string } }>;
} {
  const actions = listActions();
  const names = actions.map(action => `${action.name} (${action.id})`);
  return {
    paths: {
      '/__actions': {
        post: {
          summary: 'Server Actions / server functions RPC',
          operationId: 'ubeanActionsRpc',
          description:
            names.length > 0
              ? `Registered functions: ${names.join(', ')}.`
              : 'No server functions registered yet. Define them with defineAction / defineServerFn.'
        }
      }
    }
  };
}
