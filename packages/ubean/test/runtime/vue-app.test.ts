import { describe, expect, it, vi } from 'vitest';
import { createRenderer, defineComponent, h } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import { PageView } from '../../src/runtime/vue/app';

interface TestNode {
  children: TestNode[];
  parent: TestNode | null;
  text?: string;
}

function createTestRenderer() {
  return createRenderer<TestNode, TestNode>({
    createElement: () => ({ children: [], parent: null }),
    createText: text => ({ children: [], parent: null, text }),
    createComment: text => ({ children: [], parent: null, text }),
    setText: (node, text) => {
      node.text = text;
    },
    setElementText: (node, text) => {
      node.text = text;
    },
    parentNode: node => node.parent,
    nextSibling: () => null,
    insert: (child, parent) => {
      child.parent = parent;
      parent.children.push(child);
    },
    remove: child => {
      if (!child.parent) return;
      child.parent.children = child.parent.children.filter(node => node !== child);
      child.parent = null;
    },
    patchProp: () => {}
  });
}

describe('PageView', () => {
  it('passes the render key as a prop rather than a non-function slot', async () => {
    const Page = defineComponent({
      name: 'CacheDemo',
      render: () => h('main', 'cache demo')
    });
    const Root = defineComponent({
      render: () => h(PageView)
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: Page }]
    });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const renderer = createTestRenderer();
    const app = renderer.createApp(Root);
    app.use(router);

    await router.push('/');
    await router.isReady();
    app.mount({ children: [], parent: null });

    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('Non-function value encountered for slot "key"'));

    warn.mockRestore();
  });
});
