/**
 * CRUD RPC functions — `ubean:crud:create/read/update/delete/restore`.
 *
 * Each function delegates to the existing `createCrudServer` which
 * encapsulates all file-scaffolding, backup, and hook logic. The RPC
 * layer is purely a transport adapter.
 */
import { defineRpcFunction } from '@vitejs/devtools-kit';
import type { DevToolsCrudServer } from '../../server/crud';
import type { CreateCrudParams, ReadCrudParams, UpdateCrudParams, DeleteCrudParams, CrudResult } from '../../types';

export function createCrudRpcFunctions(crud: DevToolsCrudServer) {
  const crudCreate = defineRpcFunction({
    name: 'ubean:crud:create',
    type: 'action',
    setup: () => ({
      handler: (params: CreateCrudParams) => crud.create(params)
    })
  });

  const crudRead = defineRpcFunction({
    name: 'ubean:crud:read',
    type: 'query',
    setup: () => ({
      handler: (params: ReadCrudParams) => crud.read(params)
    })
  });

  const crudUpdate = defineRpcFunction({
    name: 'ubean:crud:update',
    type: 'action',
    setup: () => ({
      handler: (params: UpdateCrudParams) => crud.update(params)
    })
  });

  const crudDelete = defineRpcFunction({
    name: 'ubean:crud:delete',
    type: 'action',
    setup: () => ({
      handler: (params: DeleteCrudParams) => crud.delete(params)
    })
  });

  const crudRestore = defineRpcFunction({
    name: 'ubean:crud:restore',
    type: 'action',
    setup: () => ({
      handler: (path: string): Promise<CrudResult> => crud.restore(path)
    })
  });

  return [crudCreate, crudRead, crudUpdate, crudDelete, crudRestore];
}
