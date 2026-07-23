import { createRequest, createFlatRequest } from '@soybeanjs/fetch';
import { createTypedClient, createFlatTypedClient } from '@soybeanjs/fetch/openapi';
import type { paths } from '../../.ubean/openapi';

const request = createRequest({});

export const api = createTypedClient<paths, '/api'>(request, '/api');

const flatRequest = createFlatRequest({});

export const flatApi = createFlatTypedClient<paths, '/api'>(flatRequest, '/api');
