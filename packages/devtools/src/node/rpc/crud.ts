import type { DevToolsCrudServer } from '../../server/crud';
import type { CreateCrudParams, ReadCrudParams, UpdateCrudParams, DeleteCrudParams, CrudResult } from '../../types';
/**
 * CRUD RPC functions — `crud-create` / `crud-read` / `crud-update` / `crud-delete` /
 * `crud-restore`（裸名，注册到 `ubean` scope）。
 *
 * 每个都直接委派给 `createCrudServer` —— 它封装了全部文件脚手架、备份与 hook 逻辑，
 * RPC 层只是传输适配。
 */
import { defineUbeanRpc } from './types';

export function createCrudRpcFunctions(crud: DevToolsCrudServer) {
  const crudCreate = defineUbeanRpc({
    name: 'crud-create',
    type: 'action',
    setup: () => ({
      handler: (params: CreateCrudParams) => crud.create(params)
    })
  });

  const crudRead = defineUbeanRpc({
    name: 'crud-read',
    type: 'query',
    setup: () => ({
      handler: (params: ReadCrudParams) => crud.read(params)
    })
  });

  const crudUpdate = defineUbeanRpc({
    name: 'crud-update',
    type: 'action',
    setup: () => ({
      handler: (params: UpdateCrudParams) => crud.update(params)
    })
  });

  const crudDelete = defineUbeanRpc({
    name: 'crud-delete',
    type: 'action',
    setup: () => ({
      handler: (params: DeleteCrudParams) => crud.delete(params)
    })
  });

  const crudRestore = defineUbeanRpc({
    name: 'crud-restore',
    type: 'action',
    setup: () => ({
      handler: (path: string): Promise<CrudResult> => crud.restore(path)
    })
  });

  return [crudCreate, crudRead, crudUpdate, crudDelete, crudRestore] as const;
}
