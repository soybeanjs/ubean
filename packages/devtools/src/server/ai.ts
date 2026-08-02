import type { ModelMessage, ToolSet } from 'ai';
/**
 * AI server for ubean DevTools.
 *
 * Uses the Vercel AI SDK (`ai` package) with `@ai-sdk/openai-compatible`
 * to connect to DeepSeek by default. The provider/model can be overridden
 * via `devtools.ai` config or client-side settings.
 *
 * Features:
 * - Natural language chat with tool calling (create/delete/list resources, etc.)
 * - Streaming via `streamText` + `onStreamChunk` callback (pushed through sharedState)
 * - Command parser fallback when no API key is configured
 * - Dynamic imports for `ai` and `@ai-sdk/openai-compatible` (optional deps)
 */
import type { DevToolsInfo } from '../types';
import type { DevToolsCrudServer } from './crud';

// --- DeepSeek defaults ---

export const DEEPSEEK_API_BASE = 'https://api.deepseek.com/v1';
export const DEEPSEEK_MODEL = 'deepseek-chat';
const DEEPSEEK_PROVIDER_NAME = 'deepseek';

// --- Interfaces (preserved for backward compatibility) ---

export interface AiToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface AiToolResult {
  toolCallId: string;
  result?: unknown;
  error?: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: AiToolCall[];
  toolCallId?: string;
  toolResults?: AiToolResult[];
  timestamp: number;
}

export interface AiToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, AiToolParam>;
    required?: string[];
  };
}

export interface AiToolParam {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  items?: { type: 'string' | 'number' | 'boolean' | 'object' | 'array' };
}

export interface AiChatOptions {
  messages: AiChatMessage[];
  model?: string;
  apiKey?: string;
  apiBase?: string;
  /** When provided, the server streams text deltas via this callback. */
  requestId?: string;
}

export interface AiChatResponse {
  message: AiChatMessage;
  toolResults?: AiToolResult[];
}

/** A chunk pushed to the client during streaming. */
export interface AiStreamChunk {
  requestId: string;
  /** Accumulated text so far (not a delta). */
  text: string;
  done: boolean;
  toolCalls?: AiToolCall[];
  toolResults?: AiToolResult[];
  error?: string;
}

// --- System prompt ---

const SYSTEM_PROMPT = `You are ubean Assistant, an AI developer assistant built into the ubean Vue meta-framework DevTools.
You help developers scaffold pages, APIs, middleware, layouts, cron jobs, plugins, and manage environment variables.
You can also inspect the project structure, list resources, and read configuration.

Available resource types for creation: page, api, layout, middleware, cron, plugin
- page: Vue page component under src/pages/
- api: API route handler under src/api/
- layout: Layout component under src/layouts/
- middleware: Middleware under src/middleware/
- cron: Scheduled task under src/server/crons/
- plugin: Plugin under src/plugins/

When creating resources, always use the create_resource tool and confirm the path with the user if ambiguous.
Be concise and helpful. Use code examples when relevant.

When the user asks about the current project, use the list_resources or get_project_info tools to get up-to-date information.
Do not guess resource paths — always verify with tools first.`;

let toolCallCounter = 0;

function nextToolId(): string {
  return `call_${++toolCallCounter}`;
}

// --- Factory ---

export interface AiServerOptions {
  crud: DevToolsCrudServer;
  getInfo: () => DevToolsInfo;
  /** Called for each text delta during streaming. The RPC layer wires this
   *  to a sharedState key so the client receives live updates. */
  onStreamChunk?: (chunk: AiStreamChunk) => void;
}

export function createAiServer(
  crud: DevToolsCrudServer,
  getInfo: () => DevToolsInfo,
  onStreamChunk?: (chunk: AiStreamChunk) => void
) {
  // ------------------------------------------------------------------
  // Tool definitions (used both for the AI SDK `tool()` helpers and for
  // the `ubean:ai:tools` RPC that exposes them to the client).
  // ------------------------------------------------------------------

  function getToolDefinitions(): AiToolDefinition[] {
    return [
      {
        name: 'list_resources',
        description: 'List all resources of a given type in the project',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Type of resource to list',
              enum: ['pages', 'apis', 'layouts', 'middlewares', 'crons', 'all']
            }
          },
          required: ['type']
        }
      },
      {
        name: 'create_resource',
        description: 'Create a new resource (page, api, layout, middleware, cron, plugin)',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Type of resource to create',
              enum: ['page', 'api', 'layout', 'middleware', 'cron', 'plugin']
            },
            path: {
              type: 'string',
              description: 'Route path (e.g., "about", "users/[id]", "auth")'
            },
            method: {
              type: 'string',
              description: 'HTTP method for API routes',
              enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
            },
            schedule: {
              type: 'string',
              description: 'Cron schedule expression (e.g., "0 0 * * *" for daily at midnight)'
            }
          },
          required: ['type', 'path']
        }
      },
      {
        name: 'delete_resource',
        description: 'Delete a resource (creates backup by default)',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Type of resource to delete',
              enum: ['page', 'api', 'layout', 'middleware', 'cron', 'plugin']
            },
            path: {
              type: 'string',
              description: 'Resource path'
            },
            force: {
              type: 'boolean',
              description: 'Permanently delete without backup'
            }
          },
          required: ['type', 'path']
        }
      },
      {
        name: 'get_project_info',
        description: 'Get project overview information (version, uptime, counts, config)',
        parameters: {
          type: 'object',
          properties: {}
        }
      },
      {
        name: 'read_resource',
        description: 'Read the content of a resource file',
        parameters: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              description: 'Resource type',
              enum: ['page', 'api', 'layout', 'middleware', 'cron', 'env', 'config']
            },
            path: {
              type: 'string',
              description: 'Resource path (not needed for env/config)'
            }
          },
          required: ['type']
        }
      },
      {
        name: 'set_env',
        description: 'Set or update an environment variable',
        parameters: {
          type: 'object',
          properties: {
            key: {
              type: 'string',
              description: 'Environment variable name'
            },
            value: {
              type: 'string',
              description: 'Environment variable value'
            }
          },
          required: ['key', 'value']
        }
      }
    ];
  }

  // ------------------------------------------------------------------
  // Tool execution (shared between command-parser path and AI SDK path)
  // ------------------------------------------------------------------

  async function executeToolCall(call: AiToolCall): Promise<AiToolResult> {
    try {
      const args = call.arguments;

      switch (call.name) {
        case 'list_resources': {
          const type = args.type as string;
          const info = getInfo();
          const result: Record<string, unknown> = {};

          if (type === 'pages' || type === 'all') {
            result.pages = info.pagesList?.map(p => ({ path: p.path, name: p.name, file: p.filePath })) || [];
          }
          if (type === 'apis' || type === 'all') {
            result.apis =
              info.routes?.filter(r => r.filePath).map(r => ({ method: r.method, path: r.path, file: r.filePath })) ||
              [];
          }
          if (type === 'layouts' || type === 'all') {
            result.layouts =
              info.layoutsList?.map(l => ({ name: l.name, path: l.path, default: l.isDefault, file: l.filePath })) ||
              [];
          }
          if (type === 'middlewares' || type === 'all') {
            result.middlewares =
              info.middlewaresList?.map(m => ({ path: m.path, global: m.global, file: m.filePath })) || [];
          }
          if (type === 'crons' || type === 'all') {
            result.crons = info.cronsList?.map(c => ({ name: c.name, schedule: c.schedule, file: c.filePath })) || [];
          }

          return { toolCallId: call.id, result };
        }

        case 'create_resource': {
          const result = await crud.create({
            type: args.type as never,
            path: args.path as string,
            method: args.method as string | undefined,
            schedule: args.schedule as string | undefined,
            force: false
          });
          return { toolCallId: call.id, result };
        }

        case 'delete_resource': {
          const result = await crud.delete({
            type: args.type as never,
            path: args.path as string,
            force: (args.force as boolean) || false
          });
          return { toolCallId: call.id, result };
        }

        case 'get_project_info': {
          const info = getInfo();
          return {
            toolCallId: call.id,
            result: {
              version: info.version,
              uptime: Date.now() - info.startTime,
              pages: info.pages,
              apiRoutes: info.apiRoutes,
              middlewares: info.middleware,
              layouts: info.layouts,
              crons: info.crons,
              presets: info.presets
            }
          };
        }

        case 'read_resource': {
          const result = await crud.read({
            type: args.type as never,
            path: args.path as string | undefined
          });
          return { toolCallId: call.id, result };
        }

        case 'set_env': {
          const result = await crud.update({
            type: 'env',
            key: args.key as string,
            value: args.value as string
          });
          return { toolCallId: call.id, result };
        }

        default:
          return {
            toolCallId: call.id,
            error: `Unknown tool: ${call.name}`
          };
      }
    } catch (err) {
      return {
        toolCallId: call.id,
        error: err instanceof Error ? err.message : String(err)
      };
    }
  }

  // ------------------------------------------------------------------
  // Command parser (fallback when no API key is configured)
  // ------------------------------------------------------------------

  function parseCommand(input: string): { toolCalls?: AiToolCall[]; response?: string } | null {
    const lower = input.trim().toLowerCase();

    const createMatch = input.match(
      /^(?:create|add|new|make|generate|scaffold|g)\s+(?:a\s+)?(page|api|layout|middleware|cron|plugin)\s+(?:at\s+)?["']?([\w\-/[\].]+)["']?(?:\s+(?:with|using)\s+(?:method\s+)?(GET|POST|PUT|PATCH|DELETE))?(?:\s+(?:schedule|cron)?\s+["']?([*\d/\-,\s]+)["']?)?/i
    );
    if (createMatch) {
      const [, type, path, method, schedule] = createMatch;
      const params: Record<string, unknown> = { type: type.toLowerCase(), path };
      if (method) params.method = method.toUpperCase();
      if (schedule) params.schedule = schedule.trim();
      return {
        toolCalls: [{ id: nextToolId(), name: 'create_resource', arguments: params }]
      };
    }

    const deleteMatch = input.match(
      /^(?:delete|remove|rm|del)\s+(?:the\s+)?(page|api|layout|middleware|cron|plugin)\s+(?:at\s+)?["']?([\w\-/[\].]+)["']?/i
    );
    if (deleteMatch) {
      const [, type, path] = deleteMatch;
      return {
        toolCalls: [
          {
            id: nextToolId(),
            name: 'delete_resource',
            arguments: { type: type.toLowerCase(), path, force: lower.includes('force') || lower.includes('permanent') }
          }
        ]
      };
    }

    const listMatch = input.match(/^(?:list|show|ls|get)\s+(all|pages|apis?|layouts?|middlewares?|crons?)(?:\s*$)/i);
    if (listMatch) {
      let type = listMatch[1].toLowerCase();
      if (type === 'all') type = 'all';
      else if (type.startsWith('api')) type = 'apis';
      else if (type.startsWith('layout')) type = 'layouts';
      else if (type.startsWith('middleware')) type = 'middlewares';
      else if (type.startsWith('cron')) type = 'crons';
      else type = 'pages';
      return {
        toolCalls: [{ id: nextToolId(), name: 'list_resources', arguments: { type } }]
      };
    }

    const infoMatch = /^(?:project\s+)?(?:info|status|overview|stats|about)$/i.test(input.trim());
    if (infoMatch) {
      return {
        toolCalls: [{ id: nextToolId(), name: 'get_project_info', arguments: {} }]
      };
    }

    const helpMatch = /^(help|\?|commands|what can you do)/i.test(input.trim());
    if (helpMatch) {
      return {
        response: `I can help you with the following:

**Create resources:**
- \`create page about\` — Create a new page at /about
- \`create api users with method POST\` — Create a POST API route
- \`create cron daily-cleanup schedule "0 0 * * *"\` — Create a daily cron job
- \`create layout admin\` — Create an admin layout

**Delete resources:**
- \`delete page about\` — Delete a page (with backup)
- \`delete api users --force\` — Permanently delete an API

**Inspect project:**
- \`list pages\` / \`list apis\` / \`list all\` — List resources
- \`project info\` — Show project overview

**Environment:**
- \`set env DATABASE_URL=postgres://...\` — Set environment variable

You can also ask me questions in natural language, or configure a DeepSeek/OpenAI-compatible API key for more advanced AI assistance.`
      };
    }

    const setEnvMatch = input.match(/^(?:set\s+env|env\s+set|add\s+env)\s+(\w+)\s*=\s*(.+)$/i);
    if (setEnvMatch) {
      return {
        toolCalls: [
          { id: nextToolId(), name: 'set_env', arguments: { key: setEnvMatch[1], value: setEnvMatch[2].trim() } }
        ]
      };
    }

    return null;
  }

  function formatToolResult(name: string, result: unknown): string {
    if (name === 'list_resources') {
      const r = result as Record<string, unknown[]>;
      const lines: string[] = [];
      for (const [key, items] of Object.entries(r)) {
        lines.push(`**${key}** (${items.length}):`);
        for (const item of items.slice(0, 20)) {
          const obj = item as Record<string, unknown>;
          const path = obj.path || obj.name || '';
          const extra = obj.method ? ` [${obj.method}]` : obj.default ? ' (default)' : '';
          lines.push(`  - ${path}${extra}`);
        }
        if (items.length > 20) lines.push(`  ... and ${items.length - 20} more`);
        lines.push('');
      }
      return lines.join('\n');
    }

    if (name === 'create_resource') {
      const r = result as { success?: boolean; created?: string[]; errors?: string[]; skipped?: string[] };
      if (r.success && r.created?.length) {
        return `✅ Created successfully:\n${r.created.map(f => `  - ${f}`).join('\n')}`;
      }
      if (r.errors?.length) {
        return `❌ Failed: ${r.errors.join(', ')}`;
      }
      if (r.skipped?.length) {
        return `⚠️ Skipped (already exists, use --force to overwrite):\n${r.skipped.map(f => `  - ${f}`).join('\n')}`;
      }
      return JSON.stringify(result, null, 2);
    }

    if (name === 'delete_resource') {
      const r = result as { success?: boolean; deleted?: string[]; errors?: string[] };
      if (r.success && r.deleted?.length) {
        return `🗑️ Deleted successfully:\n${r.deleted.map(f => `  - ${f}`).join('\n')}`;
      }
      if (r.errors?.length) {
        return `❌ Failed: ${r.errors.join(', ')}`;
      }
      return JSON.stringify(result, null, 2);
    }

    if (name === 'get_project_info') {
      const r = result as Record<string, unknown>;
      const uptimeMs = r.uptime as number;
      const s = Math.floor(uptimeMs / 1000);
      const m = Math.floor(s / 60);
      const h = Math.floor(m / 60);
      const uptime = h > 0 ? `${h}h ${m % 60}m` : m > 0 ? `${m}m ${s % 60}s` : `${s}s`;
      return `**Project Info:**
- Version: ${r.version}
- Uptime: ${uptime}
- Pages: ${r.pages}
- API Routes: ${r.apiRoutes}
- Middlewares: ${r.middlewares}
- Layouts: ${r.layouts}
- Cron Jobs: ${r.crons}
- Presets: ${(r.presets as string[]).join(', ') || 'none'}`;
    }

    if (name === 'set_env') {
      const r = result as { success?: boolean; errors?: string[] };
      if (r.success) return '✅ Environment variable set successfully.';
      return `❌ Failed: ${r.errors?.join(', ') || 'Unknown error'}`;
    }

    if (name === 'read_resource') {
      const r = result as { success?: boolean; content?: string; data?: unknown; error?: string };
      if (r.error) return `❌ ${r.error}`;
      if (r.content) return `\`\`\`\n${r.content}\n\`\`\``;
      if (r.data) return `\`\`\`json\n${JSON.stringify(r.data, null, 2)}\n\`\`\``;
      return '(empty)';
    }

    return JSON.stringify(result, null, 2);
  }

  // ------------------------------------------------------------------
  // Message conversion: AiChatMessage[] → AI SDK CoreMessage[]
  // ------------------------------------------------------------------

  function convertToCoreMessages(messages: AiChatMessage[]): ModelMessage[] {
    return messages
      .filter(m => m.role !== 'tool' || m.toolCallId)
      .map(m => {
        if (m.role === 'assistant' && m.toolCalls?.length) {
          return {
            role: 'assistant',
            content: [
              ...(m.content ? [{ type: 'text' as const, text: m.content }] : []),
              ...m.toolCalls.map(tc => ({
                type: 'tool-call' as const,
                toolCallId: tc.id,
                toolName: tc.name,
                input: tc.arguments
              }))
            ]
          };
        }
        if (m.role === 'tool') {
          return {
            role: 'tool',
            content: [
              {
                type: 'tool-result' as const,
                toolCallId: m.toolCallId!,
                toolName: 'tool',
                output: {
                  type: 'json' as const,
                  value: typeof m.content === 'string' ? m.content : JSON.parse(m.content)
                }
              }
            ]
          };
        }
        return { role: m.role, content: m.content } as ModelMessage;
      });
  }

  // ------------------------------------------------------------------
  // Build AI SDK tool map (with execute functions)
  // ------------------------------------------------------------------

  async function buildAiSdkTools(): Promise<ToolSet> {
    const ai = await import('ai');

    const defs = getToolDefinitions();
    const tools: Record<string, unknown> = {};

    for (const def of defs) {
      tools[def.name] = ai.tool({
        description: def.description,
        inputSchema: ai.jsonSchema(def.parameters),
        execute: async (args: Record<string, unknown>) => {
          const result = await executeToolCall({ id: nextToolId(), name: def.name, arguments: args });
          return result.error ? { error: result.error } : result.result;
        }
      } as any);
    }

    return tools as ToolSet;
  }

  // ------------------------------------------------------------------
  // Main chat entry point
  // ------------------------------------------------------------------

  async function chat(options: AiChatOptions): Promise<AiChatResponse> {
    const { messages, apiKey, apiBase, model, requestId } = options;
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');

    if (!lastUserMsg) {
      return {
        message: {
          role: 'assistant',
          content: 'Hello! I am ubean Assistant. Type "help" to see what I can do.',
          timestamp: Date.now()
        }
      };
    }

    // 1. Try command parser first (works without an API key).
    const parsed = parseCommand(lastUserMsg.content);

    if (parsed?.response) {
      return {
        message: {
          role: 'assistant',
          content: parsed.response,
          timestamp: Date.now()
        }
      };
    }

    if (parsed?.toolCalls && parsed.toolCalls.length > 0) {
      const toolResults: AiToolResult[] = [];
      for (const call of parsed.toolCalls) {
        const result = await executeToolCall(call);
        toolResults.push(result);
      }

      const responseParts: string[] = [];
      for (let i = 0; i < parsed.toolCalls.length; i++) {
        const call = parsed.toolCalls[i];
        const tr = toolResults[i];
        if (tr.error) {
          responseParts.push(`❌ Error executing ${call.name}: ${tr.error}`);
        } else {
          responseParts.push(formatToolResult(call.name, tr.result));
        }
      }

      return {
        message: {
          role: 'assistant',
          content: responseParts.join('\n\n'),
          toolCalls: parsed.toolCalls,
          timestamp: Date.now()
        },
        toolResults
      };
    }

    // 2. If an API key is available, use the AI SDK (streamText).
    const resolvedApiKey =
      apiKey || process.env.DEEPSEEK_API_KEY || process.env.UBEAN_AI_API_KEY || process.env.OPENAI_API_KEY;
    const resolvedApiBase = apiBase || process.env.UBEAN_AI_API_BASE || DEEPSEEK_API_BASE;
    const resolvedModel = model || process.env.UBEAN_AI_MODEL || DEEPSEEK_MODEL;

    if (resolvedApiKey) {
      try {
        return await callLlmApi({
          messages,
          apiKey: resolvedApiKey,
          apiBase: resolvedApiBase,
          model: resolvedModel,
          requestId
        });
      } catch (err) {
        return {
          message: {
            role: 'assistant',
            content: `I didn't understand that command. Type "help" to see available commands.\n\n(LLM API error: ${err instanceof Error ? err.message : String(err)})`,
            timestamp: Date.now()
          }
        };
      }
    }

    // 3. No API key — prompt the user to configure one.
    return {
      message: {
        role: 'assistant',
        content: `I didn't understand that command. Type "help" to see what I can do.\n\nTip: For natural language assistance, configure a DeepSeek or OpenAI-compatible API endpoint:\n\n\`\`\`ts\n// ubean.config.ts\nexport default defineConfig({\n  devtools: {\n    ai: {\n      apiKey: process.env.DEEPSEEK_API_KEY,\n      apiBase: 'https://api.deepseek.com/v1',\n      model: 'deepseek-chat'\n    }\n  }\n});\n\`\`\`\n\nOr set the \`DEEPSEEK_API_KEY\` environment variable.`,
        timestamp: Date.now()
      }
    };
  }

  // ------------------------------------------------------------------
  // LLM call via AI SDK (streamText with tool calling)
  // ------------------------------------------------------------------

  async function callLlmApi(
    options: Required<Omit<AiChatOptions, 'requestId'>> & { requestId?: string }
  ): Promise<AiChatResponse> {
    const { messages, apiKey, apiBase, model, requestId } = options;

    // Dynamic import — makes `ai` and `@ai-sdk/openai-compatible` optional.
    // If the packages are not installed (optionalDependencies), throw a clear
    // error guiding the user to install them (ADR-0004 OPT-10).
    let streamText: typeof import('ai').streamText;
    let stepCountIs: typeof import('ai').stepCountIs;
    let createOpenAICompatible: typeof import('@ai-sdk/openai-compatible').createOpenAICompatible;
    try {
      const [aiMod, compatMod] = await Promise.all([import('ai'), import('@ai-sdk/openai-compatible')]);
      streamText = aiMod.streamText;
      stepCountIs = aiMod.stepCountIs;
      createOpenAICompatible = compatMod.createOpenAICompatible;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `AI SDK packages are not installed. The DevTools AI assistant requires \`ai\` and \`@ai-sdk/openai-compatible\` to be installed. ` +
          `Install them with: pnpm add ai @ai-sdk/openai-compatible (or npm/yarn/bun equivalent). ` +
          `Original error: ${msg}`,
        { cause: err }
      );
    }

    const provider = createOpenAICompatible({
      baseURL: apiBase,
      name: apiBase.includes('deepseek') ? DEEPSEEK_PROVIDER_NAME : 'ubean-ai',
      apiKey
    });
    const aiModel = provider.chatModel(model);

    const coreMessages = convertToCoreMessages(messages);
    const tools = await buildAiSdkTools();

    const result = streamText({
      model: aiModel,
      system: SYSTEM_PROMPT,
      messages: coreMessages,
      tools,
      stopWhen: stepCountIs(5)
    });

    // --- Streaming path ---
    // When a requestId is provided, push accumulated text + tool events
    // through onStreamChunk so the client can render live updates.
    let accumulated = '';
    const streamToolCalls: AiToolCall[] = [];
    const streamToolResults: AiToolResult[] = [];
    let streamError: string | undefined;

    if (requestId && onStreamChunk) {
      try {
        for await (const part of result.fullStream) {
          switch (part.type) {
            case 'text-delta':
              accumulated += part.text;
              // Throttle: push on word boundary or every ~5 chars
              onStreamChunk({ requestId, text: accumulated, done: false });
              break;
            case 'tool-call':
              streamToolCalls.push({
                id: part.toolCallId,
                name: part.toolName,
                arguments: part.input as Record<string, unknown>
              });
              onStreamChunk({ requestId, text: accumulated, done: false, toolCalls: [...streamToolCalls] });
              break;
            case 'tool-result':
              streamToolResults.push({
                toolCallId: part.toolCallId,
                result: part.output as unknown
              });
              onStreamChunk({
                requestId,
                text: accumulated,
                done: false,
                toolCalls: [...streamToolCalls],
                toolResults: [...streamToolResults]
              });
              break;
            case 'error':
              streamError = part.error instanceof Error ? part.error.message : String(part.error);
              break;
          }
        }
      } catch (err) {
        streamError = err instanceof Error ? err.message : String(err);
      }

      if (streamError) {
        onStreamChunk({ requestId, text: accumulated, done: true, error: streamError });
        return {
          message: {
            role: 'assistant',
            content: accumulated || `Error: ${streamError}`,
            toolCalls: streamToolCalls.length ? streamToolCalls : undefined,
            timestamp: Date.now()
          },
          toolResults: streamToolResults.length ? streamToolResults : undefined
        };
      }
    } else {
      // --- Non-streaming path: just await the full result ---
      try {
        for await (const _ of result.fullStream) {
          if (_.type === 'text-delta') accumulated += _.text;
          if (_.type === 'tool-call') {
            streamToolCalls.push({
              id: _.toolCallId,
              name: _.toolName,
              arguments: _.input as Record<string, unknown>
            });
          }
          if (_.type === 'tool-result') {
            streamToolResults.push({ toolCallId: _.toolCallId, result: _.output as unknown });
          }
          if (_.type === 'error') {
            streamError = _.error instanceof Error ? _.error.message : String(_.error);
          }
        }
      } catch (err) {
        streamError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      message: {
        role: 'assistant',
        content: accumulated || (streamError ? `Error: ${streamError}` : ''),
        toolCalls: streamToolCalls.length ? streamToolCalls : undefined,
        timestamp: Date.now()
      },
      toolResults: streamToolResults.length ? streamToolResults : undefined
    };
  }

  return {
    getToolDefinitions,
    executeToolCall,
    chat,
    parseCommand,
    formatToolResult
  };
}

export type DevToolsAiServer = ReturnType<typeof createAiServer>;
