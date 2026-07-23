import { createRequest } from '@soybeanjs/fetch';
import { createTypedClient } from '@soybeanjs/fetch/openapi';
import { createInternalAdapter } from 'ubean';
import type { paths } from '../../.ubean/openapi';

export function createServerApi(context: Parameters<typeof createInternalAdapter>[0]) {
  const adapter = createInternalAdapter(context);

  const request = createRequest({
    adapter
  });

  return createTypedClient<paths, '/api'>(request, '/api');
}
