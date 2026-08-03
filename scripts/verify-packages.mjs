/**
 * 包树与扩展契约 CI 校验（OPT-09 + OPT-07）
 *
 * 真理源：各 packages 子目录下 package.json 的 name 字段（非目录名——builder 不等于 @ubean/build、ubean 无 scope）。
 * 校验：
 *   1. 存在性：每个包名出现在 AGENTS.md
 *   2. 计数：AGENTS.md 含「{实际包数} 个包」
 *   3. 扩展覆盖：每个「扩展包」出现在 engineering.md 契约表
 *
 * 扩展集派生规则（ADR-0006 细化）：有 ./vite 子路径导出 **且不在主包 `ubean` 的 dependencies 中**
 * 的包。主包 `ubean` 自身也不是扩展。此规则与 AGENTS §2.1「扩展包不进入主包硬依赖」对齐，
 * 自动排除同样有 ./vite 导出但是核心依赖的包（@ubean/actions / @ubean/build / @ubean/islands）。
 *
 * 来源：ADR-0005（OPT-09 实现）、ADR-0006（OPT-07 契约表 + 派生规则细化）。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const packagesDir = join(root, 'packages');
const agentsPath = join(root, 'AGENTS.md');
const engineeringPath = join(root, 'apps/docs/src/content/zh/contributing/engineering.md');
const mainPkgPath = join(packagesDir, 'ubean', 'package.json');

let failed = false;
const fail = msg => {
  console.error(`✗ ${msg}`);
  failed = true;
};

// 0. 读主包 dependencies：用于排除核心包（同样有 ./vite 导出但是 hard dep）
const mainPkg = JSON.parse(readFileSync(mainPkgPath, 'utf8'));
const mainHardDeps = new Set(Object.keys(mainPkg.dependencies || {}));
const mainPkgName = mainPkg.name; // 'ubean'

// 1. 读全部 packages/*/package.json：name + 是否有 ./vite 导出
const entries = readdirSync(packagesDir)
  .filter(d => statSync(join(packagesDir, d)).isDirectory())
  .map(dir => {
    const pkgPath = join(packagesDir, dir, 'package.json');
    let pkg;
    try {
      pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    } catch {
      return null; // 无 package.json 的目录跳过
    }
    const hasViteExport = !!(pkg.exports && pkg.exports['./vite']);
    return { dir, name: pkg.name, hasViteExport };
  })
  .filter(Boolean);

const names = entries.map(e => e.name).filter(Boolean);
// 扩展集派生：有 ./vite 导出 AND 不是主包自身 AND 不在主包 dependencies 中
const extensions = entries.filter(
  e => e.hasViteExport && e.name && e.name !== mainPkgName && !mainHardDeps.has(e.name)
);

if (names.length === 0) {
  fail('未读到任何 packages/*/package.json 的 name 字段');
  process.exit(failed ? 1 : 0);
}

console.log(`读到 ${names.length} 个包，其中 ${extensions.length} 个扩展（有 ./vite 导出且不在主包 dependencies）`);

// 2. AGENTS.md 存在性 + 计数
const agents = readFileSync(agentsPath, 'utf8');
const missingInAgents = names.filter(n => !agents.includes(n));
if (missingInAgents.length) {
  fail(`以下包名未出现在 AGENTS.md：${missingInAgents.join(', ')}`);
}
if (!agents.includes(`${names.length} 个包`)) {
  fail(`AGENTS.md 未含「${names.length} 个包」计数（实际包数 ${names.length}）`);
}

// 3. engineering.md 扩展契约覆盖（派生扩展集 → 存在性）
const engineering = readFileSync(engineeringPath, 'utf8');
const missingInTable = extensions.map(e => e.name).filter(n => !engineering.includes(n));
if (missingInTable.length) {
  fail(`以下扩展包未出现在 engineering.md 契约表：${missingInTable.join(', ')}`);
}

if (failed) {
  console.error('\n包树/扩展契约校验失败');
  process.exit(1);
}
console.log('✓ 包树（AGENTS）与扩展契约（engineering.md）校验通过');
