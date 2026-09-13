import { networkInterfaces } from 'node:os';

/** 仅回环可达的 host（监听这些地址时局域网无法访问，不展示 Network 行）。 */
export function isLoopbackHost(host: string): boolean {
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

/** 通配绑定（监听所有网卡）。 */
export function isWildcardHost(host: string): boolean {
  return host === '0.0.0.0' || host === '::' || host === '';
}

/**
 * 本机局域网 IPv4 地址（`os.networkInterfaces()` 去掉 internal，按网卡名排序保证稳定输出）。
 * 仅返回 IPv4 —— IPv6 全局地址通常携带临时/隐私扩展后缀，逐条展示噪音大于价值。
 */
export function getLanAddresses(): string[] {
  const addresses: string[] = [];
  const byInterface = networkInterfaces();
  for (const name of Object.keys(byInterface).sort()) {
    for (const net of byInterface[name] || []) {
      if (net.internal || net.family !== 'IPv4') continue;
      if (!addresses.includes(net.address)) {
        addresses.push(net.address);
      }
    }
  }
  return addresses;
}
