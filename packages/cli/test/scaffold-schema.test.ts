import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { getScaffoldManifest, SCAFFOLD_CONTRACT_VERSION } from '../src/scaffold-manifest';

/**
 * `docs/contracts/scaffold-v1.schema.json` 是 studio / IDE 插件读的机器可读冻结契约（RM-S01/S02）。
 * 它没有任何进程加载（无校验器），因此字段漂移不会被发现 —— 这个用例把 schema 与
 * `getScaffoldManifest()` 逐字段对齐变成可执行断言。
 *
 * 不引入 ajv：这里要挡的是「schema 与实现不一致」，不是任意 JSON Schema 校验。
 */
const SCHEMA_PATH = fileURLToPath(new URL('../../../docs/contracts/scaffold-v1.schema.json', import.meta.url));

interface Schema {
  required: string[];
  properties: {
    contractVersion: { const: number };
    types: {
      items: {
        required: string[];
        properties: {
          type: { enum: string[] };
          args: { items: { required: string[]; properties: Record<string, { type: string }> } };
        };
      };
    };
  };
}

describe('docs/contracts/scaffold-v1.schema.json 与 getScaffoldManifest()', () => {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as Schema;
  const manifest = getScaffoldManifest();

  it('版本号与顶层必填字段一致', () => {
    expect(schema.properties.contractVersion.const).toBe(SCAFFOLD_CONTRACT_VERSION);
    expect([...schema.required].sort()).toEqual(['contractVersion', 'types']);
  });

  it('type 枚举与 manifest 的类型集合完全一致', () => {
    expect([...schema.properties.types.items.properties.type.enum].sort()).toEqual(
      manifest.types.map(t => t.type).sort()
    );
  });

  it('每个类型的必填键与 schema 声明一致', () => {
    const schemaRequired = [...schema.properties.types.items.required].sort();
    for (const entry of manifest.types) {
      const actual = Object.keys(entry).sort();
      expect(actual, `类型 ${entry.type} 的键与 schema 不一致`).toEqual(schemaRequired);
    }
  });

  it('每个参数对象的必填键与 schema 声明一致', () => {
    const schemaArgRequired = [...schema.properties.types.items.properties.args.items.required].sort();
    for (const entry of manifest.types) {
      for (const arg of entry.args) {
        const actual = Object.keys(arg).sort();
        // `default` 在 schema 里是可选的，允许出现也允许缺席。
        const requiredOnly = actual.filter(key => key !== 'default');
        expect(requiredOnly, `类型 ${entry.type} 的参数 ${arg.name} 与 schema 不一致`).toEqual(schemaArgRequired);
      }
    }
  });

  it('schema 里把 default 声明为 string（与实现一致，不是 number/boolean）', () => {
    expect(schema.properties.types.items.properties.args.items.properties.default.type).toBe('string');
  });
});
