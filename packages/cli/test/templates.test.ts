/**
 * OPT-04 4c — @ubean/cli templates 纯函数单测
 *
 * 覆盖 renderTemplate / toKebabCase / toPascalCase / toCamelCase /
 * 各 render*Template 函数。锁定模板渲染与命名转换的回归基线。
 */
import { describe, it, expect } from 'vitest';
import {
  renderTemplate,
  renderPageTemplate,
  renderApiTemplate,
  renderLayoutTemplate,
  renderCronTemplate,
  renderPluginTemplate,
  toKebabCase,
  toPascalCase,
  toCamelCase,
  PAGE_TEMPLATE,
  API_TEMPLATE
} from '../src/shared/templates';

describe('renderTemplate()', () => {
  it('替换顶层变量', () => {
    expect(renderTemplate('hello {{name}}', { variables: { name: 'world' } })).toBe('hello world');
  });

  it('未提供值时保留占位符', () => {
    expect(renderTemplate('hello {{name}}', { variables: {} })).toBe('hello {{name}}');
  });

  it('null 视为未提供，保留占位符', () => {
    expect(renderTemplate('hello {{name}}', { variables: { name: null } })).toBe('hello {{name}}');
  });

  it('嵌套路径取值', () => {
    expect(renderTemplate('{{a.b.c}}', { variables: { a: { b: { c: 'deep' } } } })).toBe('deep');
  });

  it('嵌套路径中途为 null → 保留占位符', () => {
    expect(renderTemplate('{{a.b.c}}', { variables: { a: { b: null } } })).toBe('{{a.b.c}}');
  });

  it('自定义定界符', () => {
    expect(renderTemplate('hello [[name]]', { variables: { name: 'world' }, delimiters: ['[[', ']]'] })).toBe(
      'hello world'
    );
  });

  it('占位符两侧空格被容忍', () => {
    expect(renderTemplate('{{  name  }}', { variables: { name: 'x' } })).toBe('x');
  });

  it('多个占位符同时替换', () => {
    expect(renderTemplate('{{a}}-{{b}}-{{a}}', { variables: { a: '1', b: '2' } })).toBe('1-2-1');
  });

  it('值为数字时转字符串', () => {
    expect(renderTemplate('{{n}}', { variables: { n: 42 } })).toBe('42');
  });

  it('值为布尔时转字符串', () => {
    expect(renderTemplate('{{flag}}', { variables: { flag: true } })).toBe('true');
  });
});

describe('toKebabCase()', () => {
  it('camelCase → kebab', () => {
    expect(toKebabCase('fooBar')).toBe('foo-bar');
  });

  it('PascalCase → kebab', () => {
    expect(toKebabCase('FooBar')).toBe('foo-bar');
  });

  it('空格分隔 → kebab', () => {
    expect(toKebabCase('foo bar baz')).toBe('foo-bar-baz');
  });

  it('下划线 → kebab', () => {
    expect(toKebabCase('foo_bar')).toBe('foo-bar');
  });

  it('混合分隔符', () => {
    expect(toKebabCase('fooBar_baz Quux')).toBe('foo-bar-baz-quux');
  });

  it('已 kebab 不变', () => {
    expect(toKebabCase('foo-bar')).toBe('foo-bar');
  });
});

describe('toPascalCase()', () => {
  it('kebab → Pascal', () => {
    expect(toPascalCase('foo-bar')).toBe('FooBar');
  });

  it('snake → Pascal', () => {
    expect(toPascalCase('foo_bar')).toBe('FooBar');
  });

  it('空格 → Pascal', () => {
    expect(toPascalCase('foo bar')).toBe('FooBar');
  });

  it('camel → Pascal', () => {
    expect(toPascalCase('fooBar')).toBe('FooBar');
  });

  it('已 Pascal 不变', () => {
    expect(toPascalCase('FooBar')).toBe('FooBar');
  });
});

describe('toCamelCase()', () => {
  it('kebab → camel', () => {
    expect(toCamelCase('foo-bar')).toBe('fooBar');
  });

  it('Pascal → camel', () => {
    expect(toCamelCase('FooBar')).toBe('fooBar');
  });

  it('snake → camel', () => {
    expect(toCamelCase('foo_bar')).toBe('fooBar');
  });
});

describe('renderPageTemplate()', () => {
  it('渲染 page 模板，含 kebab class 名', () => {
    const code = renderPageTemplate({
      name: 'About',
      path: '/about',
      kebabName: 'about',
      pascalName: 'About',
      camelName: 'about'
    });
    expect(code).toContain("title: 'About'");
    expect(code).toContain('class="about-page"');
    expect(code).toContain('<div>About</div>');
  });

  it('多词 name → kebab class', () => {
    const code = renderPageTemplate({
      name: 'UserProfile',
      path: '/user-profile',
      kebabName: 'user-profile',
      pascalName: 'UserProfile',
      camelName: 'userProfile'
    });
    expect(code).toContain('class="user-profile-page"');
  });
});

describe('renderApiTemplate()', () => {
  it('渲染 api 模板', () => {
    const code = renderApiTemplate({
      name: 'users',
      method: 'GET',
      path: '/api/users',
      kebabName: 'users'
    });
    expect(code).toContain('defineHandler');
    expect(code).toContain("'users endpoint'");
  });
});

describe('renderLayoutTemplate()', () => {
  it('渲染 layout 模板，含 slot', () => {
    const code = renderLayoutTemplate({
      name: 'default',
      path: '/',
      pascalName: 'Default'
    });
    expect(code).toContain('<slot />');
    expect(code).toContain('class="default"');
  });
});

describe('renderCronTemplate()', () => {
  it('渲染 cron 模板，含 schedule', () => {
    const code = renderCronTemplate({
      name: 'cleanup',
      schedule: '0 * * * *',
      kebabName: 'cleanup'
    });
    expect(code).toContain("name: 'cleanup'");
    expect(code).toContain("schedule: '0 * * * *'");
  });
});

describe('renderPluginTemplate()', () => {
  it('渲染 plugin 模板', () => {
    const code = renderPluginTemplate({
      name: 'analytics',
      kebabName: 'analytics',
      pascalName: 'Analytics'
    });
    expect(code).toContain("name: 'analytics'");
    expect(code).toContain('plugin setup');
  });
});

describe('模板常量', () => {
  it('PAGE_TEMPLATE 含 definePage', () => {
    expect(PAGE_TEMPLATE).toContain('definePage');
  });

  it('API_TEMPLATE 含 defineHandler', () => {
    expect(API_TEMPLATE).toContain('defineHandler');
  });
});
