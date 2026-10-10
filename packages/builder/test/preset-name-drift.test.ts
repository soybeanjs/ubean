/**
 * `BuiltinPresetName` 与预设注册表的防漂移守卫。
 *
 * `@ubean/config` 的类型不能从 `@ubean/preset` import（`@ubean/preset` 是零 workspace
 * 依赖的叶子包，加任何一条依赖边都会打乱包图），所以 11 个规范预设名在
 * `packages/config/src/types.ts` 里**硬编码**了一份字面量联合。硬编码的代价就是会漂移：
 * 新增一个平台预设后忘了同步联合类型，用户在 `build.preset` 里写那个新名字会**编译报错**
 * （看起来像"框架不支持"，实际只是类型没跟上）。
 *
 * `packages/builder` 是唯一同时依赖 `@ubean/config` 与 `@ubean/preset` 的包，所以守卫放这里。
 *
 * 断言方式是「从源码文本里抽出联合成员，与注册表的运行时事实对齐」，而不是在测试里
 * 再抄一份名单 —— 抄一份就变成三方漂移（源码 / 测试 / 注册表），而这类白名单漏项
 * 在本仓已经吃过一次亏（见 `AGENTS.md` §8 #21 的页面元数据序列化白名单）。
 *
 * 注意本仓的 `typecheck` 只覆盖各包 `src` 下的 TS（tsconfig 排除 `test`），所以测试文件里
 * 写类型层断言不会被 CI 检查。这条守卫刻意只用运行时断言。
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getPresetNames, getPresetAliases, registerBuiltinPresets } from '@ubean/preset';

const repoRoot = resolve(import.meta.dirname, '../../..');
const configTypesPath = resolve(repoRoot, 'packages/config/src/types.ts');
const configTypesSource = readFileSync(configTypesPath, 'utf8');

/** 从 `export type BuiltinPresetName = 'a' | 'b' | …;` 里抽出成员。 */
function extractUnionMembers(source: string, typeName: string): string[] {
  const match = source.match(new RegExp(`export type ${typeName}\\s*=([^;]+);`));
  if (!match) throw new Error(`找不到 ${typeName} 的类型声明（${configTypesPath}）`);
  return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

registerBuiltinPresets();

describe('BuiltinPresetName × 预设注册表', () => {
  it('联合类型的成员与已注册的规范预设名完全一致', () => {
    const declared = extractUnionMembers(configTypesSource, 'BuiltinPresetName').sort();
    const registered = getPresetNames().sort();

    // 反向自证：两边都非空，否则「相等」可能是两个空集合的假绿
    expect(declared.length).toBeGreaterThan(5);
    expect(registered.length).toBeGreaterThan(5);

    expect(declared).toEqual(registered);
  });

  it('别名刻意不进联合类型（别名表是 @ubean/preset 的唯一事实来源）', () => {
    const declared = new Set(extractUnionMembers(configTypesSource, 'BuiltinPresetName'));
    // `getPresetAliases()` 同时包含「规范名 → 自己」的自映射，别名只取 `key !== value` 那一部分
    const aliases = [...getPresetAliases()].filter(([key, name]) => key !== name).map(([key]) => key);

    // 别名表非空，否则下面的交集断言是空集合的假绿
    expect(aliases.length).toBeGreaterThan(5);

    const leaked = aliases.filter(alias => declared.has(alias));
    expect(leaked, `别名不该出现在 BuiltinPresetName 里：${leaked.join(', ')}`).toEqual([]);
  });

  it('build.preset 用的是 PresetName 而不是裸 string', () => {
    // 这条防的是「有人把类型收紧改回去」——类型收紧是本次改动的目的，回退应当是显式决定
    expect(configTypesSource).toMatch(/preset\?:\s*PresetName;/);
    expect(configTypesSource).toMatch(/export type PresetName = BuiltinPresetName \| \(string & \{\}\);/);
  });
});
