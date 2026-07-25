export type RuntimeTarget = 'node' | 'worker' | 'browser' | 'deno' | 'bun' | 'edge-light';

export interface CapabilitySet {
  staticServe: boolean;
  websocket: boolean;
  sse: boolean;
  cronTriggers: boolean;
  queues: boolean;
  kv: boolean;
  storage: boolean;
  database: boolean;
  envVars: boolean;
  secrets: boolean;
  nodeCompat: boolean;
  streaming: boolean;
  compression: boolean;
  https: boolean;
  http2: boolean;
  middleware: boolean;
  bodyLimit: boolean;
  multipart: boolean;
  rpc: boolean;
}

export interface CapabilityInfo extends CapabilitySet {
  runtime: RuntimeTarget[];
}

export type CapabilityName = keyof CapabilitySet;

export interface CapabilityRequirement {
  capability: CapabilityName;
  required: boolean;
  message?: string;
}

export interface CapabilityDiagnostic {
  capability: CapabilityName;
  supported: boolean;
  required: boolean;
  message: string;
}

export interface CapabilityDiagnosisResult {
  valid: boolean;
  diagnostics: CapabilityDiagnostic[];
  errors: string[];
  warnings: string[];
  presetName: string;
}

const DEFAULT_CAPABILITIES: CapabilitySet = {
  staticServe: false,
  websocket: false,
  sse: false,
  cronTriggers: false,
  queues: false,
  kv: false,
  storage: false,
  database: false,
  envVars: true,
  secrets: false,
  nodeCompat: false,
  streaming: true,
  compression: false,
  https: false,
  http2: false,
  middleware: true,
  bodyLimit: true,
  multipart: false,
  rpc: false
};

export function createCapabilitySet(overrides: Partial<CapabilitySet> = {}): CapabilitySet {
  return { ...DEFAULT_CAPABILITIES, ...overrides };
}

const CAPABILITY_MESSAGES: Record<CapabilityName, { missing: string; present?: string }> = {
  staticServe: { missing: 'Preset does not support static file serving' },
  websocket: { missing: 'Preset does not support WebSocket' },
  sse: { missing: 'Preset does not support Server-Sent Events' },
  cronTriggers: { missing: 'Preset does not support cron triggers' },
  queues: { missing: 'Preset does not support queue processing' },
  kv: { missing: 'Preset does not support KV storage' },
  storage: { missing: 'Preset does not support blob storage' },
  database: { missing: 'Preset does not have built-in database support' },
  envVars: { missing: 'Preset does not support environment variables' },
  secrets: { missing: 'Preset does not support secret management' },
  nodeCompat: { missing: 'Preset does not provide Node.js compatibility layer' },
  streaming: { missing: 'Preset does not support streaming responses' },
  compression: { missing: 'Preset does not support response compression' },
  https: { missing: 'Preset does not support HTTPS' },
  http2: { missing: 'Preset does not support HTTP/2' },
  middleware: { missing: 'Preset does not support middleware' },
  bodyLimit: { missing: 'Preset does not support request body size limits' },
  multipart: { missing: 'Preset does not support multipart/form-data' },
  rpc: { missing: 'Preset does not support RPC transport' }
};

export function diagnoseCapabilities(
  presetName: string,
  presetCapabilities: Partial<CapabilitySet>,
  requirements: CapabilityRequirement[]
): CapabilityDiagnosisResult {
  const capabilities = createCapabilitySet(presetCapabilities);
  const diagnostics: CapabilityDiagnostic[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const req of requirements) {
    const supported = capabilities[req.capability];
    const messages = CAPABILITY_MESSAGES[req.capability];
    const message = req.message || messages.missing;

    diagnostics.push({
      capability: req.capability,
      supported,
      required: req.required,
      message: supported ? `${req.capability} is supported` : message
    });

    if (!supported) {
      if (req.required) {
        errors.push(`[${presetName}] ${message}`);
      } else {
        warnings.push(`[${presetName}] ${message}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    diagnostics,
    errors,
    warnings,
    presetName
  };
}

export function requireCapability(
  capability: CapabilityName,
  required = true,
  message?: string
): CapabilityRequirement {
  return { capability, required, message };
}

export const NODE_CAPABILITIES: CapabilitySet = createCapabilitySet({
  staticServe: true,
  websocket: true,
  sse: true,
  cronTriggers: true,
  queues: true,
  kv: true,
  storage: true,
  database: true,
  secrets: true,
  nodeCompat: true,
  streaming: true,
  compression: true,
  https: true,
  http2: true,
  multipart: true,
  rpc: true
});

export const STANDARD_CAPABILITIES: CapabilitySet = createCapabilitySet({
  staticServe: true,
  sse: true,
  middleware: true,
  bodyLimit: true,
  streaming: true
});

export const WORKER_CAPABILITIES: CapabilitySet = createCapabilitySet({
  staticServe: true,
  websocket: true,
  sse: true,
  kv: true,
  storage: false,
  envVars: true,
  nodeCompat: false,
  streaming: true,
  middleware: true,
  bodyLimit: true
});

export const DEV_REQUIREMENTS: CapabilityRequirement[] = [
  requireCapability('middleware', true, 'Dev server requires middleware support'),
  requireCapability('streaming', true, 'Dev server requires streaming support for SSE/HMR'),
  requireCapability('envVars', true, 'Dev server requires environment variable support'),
  requireCapability('staticServe', false, 'Static file serving is recommended for dev'),
  requireCapability('nodeCompat', false, 'Node compatibility enables full dev feature set')
];

export const NODE_REQUIREMENTS: CapabilityRequirement[] = DEV_REQUIREMENTS;
