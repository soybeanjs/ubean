import type { CrudHookType, CrudHookContext, CrudHookHandler } from '../types';
import { createHooks } from 'hookable';

export interface DevToolsHooks {
  beforeCreate: (ctx: CrudHookContext) => void | Promise<void>;
  afterCreate: (ctx: CrudHookContext) => void | Promise<void>;
  beforeUpdate: (ctx: CrudHookContext) => void | Promise<void>;
  afterUpdate: (ctx: CrudHookContext) => void | Promise<void>;
  beforeDelete: (ctx: CrudHookContext) => void | Promise<void>;
  afterDelete: (ctx: CrudHookContext) => void | Promise<void>;
}

export function createDevToolsHooks() {
  const hooks = createHooks<DevToolsHooks>();

  function registerHook(type: CrudHookType, handler: CrudHookHandler) {
    hooks.hook(type, handler);
  }

  async function runHook(type: CrudHookType, ctx: CrudHookContext): Promise<void> {
    await hooks.callHook(type, ctx);
  }

  function removeHook(type: CrudHookType, handler: CrudHookHandler) {
    hooks.removeHook(type, handler);
  }

  function removeAllHooks() {
    hooks.removeAllHooks();
  }

  return {
    registerHook,
    runHook,
    removeHook,
    removeAllHooks,
    hook: hooks.hook,
    callHook: hooks.callHook
  };
}

export type DevToolsHooksInstance = ReturnType<typeof createDevToolsHooks>;
