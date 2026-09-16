/**
 * 两条构建路径的产物对照（RM-V16 的完成判据）。
 *
 * 同一 fixture、同一配置，分别跑旧路径（两次 `viteBuild`）与新路径（一次 `createBuilder` +
 * `buildApp` 编排两个环境），比对**产物文件清单**与 `dist/manifest.json`。
 *
 * 刻意不比对文件内容哈希：chunk 划分由打包器决定，重排编排后哈希会变（RM-V17 的判据是
 * 「布局与语义可比」，不是逐字节相同）。清单对照足以发现「少产出一个文件」「preset 包装换了
 * 名字」「manifest 结构变了」这类真实回归 —— 而 rm-V14 那次 `ubean build` 直接失败，正是
 * 因为没有测试跑构建（见 `production-build.test.ts` 的说明）。
 */
import { existsSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildProduction, buildWithEnvironments } from '@ubean/build/production';
import { loadUbeanConfig } from '@ubean/config';
import { registerBuiltinPresets, resolvePresetByName } from '@ubean/preset';
import { scanProject } from '@ubean/scan';

const FIXTURE = resolve(import.meta.dirname, 'fixtures/build-project');
const LEGACY_OUT = '.temp-build-legacy';
const ENV_OUT = '.temp-build-env';

afterEach(() => {
  for (const dir of [LEGACY_OUT, ENV_OUT]) {
    rmSync(join(FIXTURE, dir), { recursive: true, force: true });
  }
  rmSync(join(FIXTURE, '.ubean'), { recursive: true, force: true });
});

/** 递归列出目录下的相对文件路径（排序后便于比较）。 */
function listFiles(dir: string, prefix = ''): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir).sort()) {
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(full).isDirectory()) out.push(...listFiles(full, rel));
    else out.push(rel);
  }
  return out;
}

describe('构建路径对照：viteBuild ×2 vs createBuilder + environments', () => {
  it('产物文件清单与 manifest 与旧路径一致', async () => {
    registerBuiltinPresets();
    const config = await loadUbeanConfig(FIXTURE);
    const scanResult = await scanProject({ cwd: FIXTURE, srcDir: config.srcDir, dirs: config.dir });
    const preset = resolvePresetByName(config.build.preset);

    const legacyManifest = await buildProduction({
      cwd: FIXTURE,
      config: { ...config, build: { ...config.build, outputDir: LEGACY_OUT } },
      preset,
      scanResult
    });
    const envManifest = await buildWithEnvironments({
      cwd: FIXTURE,
      config: { ...config, build: { ...config.build, outputDir: ENV_OUT } },
      preset,
      scanResult
    });

    // manifest 契约逐字段对照（条目里的 assets 只比数量与 entry 标记：chunk 划分可以不同）
    expect(envManifest.entry).toBe(legacyManifest.entry);
    expect(envManifest.preset).toBe(legacyManifest.preset);
    expect(envManifest.clientDir?.replace(ENV_OUT, LEGACY_OUT)).toBe(legacyManifest.clientDir);
    expect(envManifest.serverDir?.replace(ENV_OUT, LEGACY_OUT)).toBe(legacyManifest.serverDir);
    expect(envManifest.assets.length).toBe(legacyManifest.assets.length);
    expect(envManifest.assets.filter(a => a.isEntry).map(a => a.file.replace(/-[\w-]+\.js$/, '.js'))).toEqual(
      legacyManifest.assets.filter(a => a.isEntry).map(a => a.file.replace(/-[\w-]+\.js$/, '.js'))
    );

    // 文件清单对照：把输出目录名与内容哈希抹掉后应完全一致
    const normalize = (files: string[], outDir: string) =>
      files.map(file => file.replace(outDir, '<out>').replace(/-[\w-]{8}\./g, '.<hash>.')).sort();

    const legacyFiles = normalize(listFiles(join(FIXTURE, LEGACY_OUT)), LEGACY_OUT);
    const envFiles = normalize(listFiles(join(FIXTURE, ENV_OUT)), ENV_OUT);

    expect(envFiles).toEqual(legacyFiles);
  }, 300_000);
});
