/**
 * @ubean/vue route-name 纯函数单测
 *
 * 覆盖 generateRouteName / generateLayoutName。
 * 锁定路由名生成规则（pascalCase、动态参数、catch-all、optional、route groups）。
 * (服务端 generateApiRouteId 的测试保留在 @ubean/scan)
 */
import { describe, it, expect } from 'vitest';
import { generateRouteName, generateLayoutName } from '../src/route-name';

describe('generateRouteName()', () => {
  it('根路径 / → Root', () => {
    expect(generateRouteName('/')).toBe('Root');
  });

  it('空字符串 → Root', () => {
    expect(generateRouteName('')).toBe('Root');
  });

  it('`index` 段折叠 —— 与目录形态同名的文件形态派生同一个名字', () => {
    expect(generateRouteName('/a/index')).toBe('A');
    expect(generateRouteName('/users/index')).toBe('Users');
    expect(generateRouteName('/index')).toBe('Root');
  });

  it('静态路径 → PascalCase 拼接', () => {
    expect(generateRouteName('/about')).toBe('About');
    expect(generateRouteName('/user/profile')).toBe('UserProfile');
  });

  it('kebab-case 段 → PascalCase', () => {
    expect(generateRouteName('/user-profile')).toBe('UserProfile');
  });

  it('动态参数 [id] → PascalCase 参数名', () => {
    // generateRouteName 处理文件路由语法 [id]，不处理 Hono :id 语法
    expect(generateRouteName('/users/[id]')).toBe('UsersId');
  });

  it('catch-all [...slug] → AllSlug', () => {
    expect(generateRouteName('/[...slug]')).toBe('AllSlug');
    expect(generateRouteName('/blog/[...slug]')).toBe('BlogAllSlug');
  });

  it('optional param [[page]] → PageOptional', () => {
    expect(generateRouteName('/docs/[[page]]')).toBe('DocsPageOptional');
  });

  it('route group (group) → 跳过不参与命名', () => {
    expect(generateRouteName('/(marketing)/about')).toBe('About');
    expect(generateRouteName('/(admin)/users/[id]')).toBe('UsersId');
  });

  it('多段 route group 全部跳过', () => {
    expect(generateRouteName('/(a)/(b)/about')).toBe('About');
  });

  it('尾部斜杠被忽略', () => {
    expect(generateRouteName('/about/')).toBe('About');
  });

  it('复杂路径：group + 动态 + catch-all', () => {
    expect(generateRouteName('/(dashboard)/projects/[projectId]/[...rest]')).toBe('ProjectsProjectIdAllRest');
  });

  it('下划线段 → PascalCase', () => {
    expect(generateRouteName('/user_settings')).toBe('UserSettings');
  });

  // ── repeatable 参数(`[x]+` / `[x]*`):修饰符不得进入名字 ──

  it('repeatable [slugs]+ → Slugs(修饰符不进入名字)', () => {
    expect(generateRouteName('/articles/[slugs]+')).toBe('ArticlesSlugs');
  });

  it('zero-or-more [slugs]* → SlugsOptional(* 与 [[x]]+ 同义)', () => {
    // `*` 在 vue-router 里是「零或多个」,与 `[[]]+` 解析成同一个路径 `:slugs*`,
    // 名字也必须一致,否则同一路由两个拼写会拿到两个名字。
    expect(generateRouteName('/articles/[slugs]*')).toBe('ArticlesSlugsOptional');
  });

  it('可选 repeatable [[slugs]]+ → SlugsOptional', () => {
    expect(generateRouteName('/articles/[[slugs]]+')).toBe('ArticlesSlugsOptional');
  });

  it('动态参数与静态段在同一段内混合(下划线展开)', () => {
    // `product_[skuId]_[seo].vue` → `/product_:skuId_:seo`
    expect(generateRouteName('/product_[skuId]_[seo]')).toBe('ProductSkuIdSeo');
  });

  it('生成的名字始终是合法标识符', () => {
    const samples = [
      '/articles/[slugs]+',
      '/articles/[[slugs]]+',
      '/articles/[slugs]*',
      '/product_[skuId]_[seo]',
      '/(admin)/files/[...path]'
    ];
    for (const sample of samples) {
      expect(generateRouteName(sample)).toMatch(/^[A-Za-z_$][\w$]*$/);
    }
  });
});

describe('generateLayoutName()', () => {
  it('default → default（特殊保留）', () => {
    expect(generateLayoutName('default')).toBe('default');
    expect(generateLayoutName('default.vue')).toBe('default');
    expect(generateLayoutName('default.ts')).toBe('default');
  });

  it('default/index → default', () => {
    expect(generateLayoutName('default/index')).toBe('default');
    expect(generateLayoutName('default/index.vue')).toBe('default');
  });

  it('普通名 → PascalCase', () => {
    expect(generateLayoutName('admin')).toBe('Admin');
    expect(generateLayoutName('admin.vue')).toBe('Admin');
  });

  it('多段 → PascalCase 拼接', () => {
    expect(generateLayoutName('admin/dashboard')).toBe('AdminDashboard');
    expect(generateLayoutName('admin/dashboard.vue')).toBe('AdminDashboard');
  });

  it('kebab-case → PascalCase', () => {
    expect(generateLayoutName('admin-panel')).toBe('AdminPanel');
  });

  it('下划线 → PascalCase', () => {
    expect(generateLayoutName('side_bar')).toBe('SideBar');
  });
});
