import { createRequest } from '@soybeanjs/fetch';
import { createTypedClient, toFlatTypedClient } from '@soybeanjs/fetch/openapi';
import type { paths } from '../../.ubean/openapi';

const request = createRequest({});

export const api = createTypedClient<paths, '/api'>(request, '/api');

export const flatApi = toFlatTypedClient<paths, '/api'>(request, '/api');
