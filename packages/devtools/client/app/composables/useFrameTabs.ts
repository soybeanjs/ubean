/**
 * Frame-nav shim —— SPA 侧的一半协议。
 *
 * devframe 的 shared-frame anchor（本包的 dock 定义里 `frameId: 'ubean'` +
 * `subTabs: { protocol: 'postmessage' }`）让 hub 外壳只持**一个** iframe：SPA 通过
 * `postMessage` 上报自己的视图清单，hub 据此合成 member docks；点击 member dock 时 hub 发
 * `navigate`，SPA 走自己的 hash 路由 —— 全程不重载 iframe。
 *
 * 协议两端都由 devframe 定义（`FRAME_NAV_CHANNEL` / `FRAME_NAV_VERSION` / `FrameTab`），
 * 这里只实现 frame 侧。SPA 不依赖 hub 或 RPC，因此即使没有外壳（直接打开
 * `/_devtools/`）也照常工作 —— 只是没人听它上报。
 */
import { onMounted, onUnmounted } from 'vue';
import { FRAME_NAV_CHANNEL, FRAME_NAV_VERSION } from '@devframes/hub/client';

/** 与 anchor dock 的 `frameId` 一致（devframe 默认取 anchor 的 id）。 */
const FRAME_ID = 'ubean';

export interface FrameTabDescriptor {
  id: string;
  title: string;
  icon?: string;
}

export interface UseFrameTabsOptions {
  /** 视图清单（id 与 hash 路由段一致）。 */
  tabs: readonly FrameTabDescriptor[];
  /** 当前视图 id。 */
  current: () => string;
  /** 收到 host 的 navigate 时调用，参数是目标 tab id。 */
  onNavigate: (tabId: string) => void;
  /** 覆盖 frameId（默认 `'ubean'`）。 */
  frameId?: string;
  /** 覆盖 postMessage 目标 origin（默认 `'*'`，dev 下端口会变）。 */
  targetOrigin?: string;
}

/**
 * 注册 frame-nav：上报视图清单、响应 navigate、并在内部导航时回传 `navigated`。
 * 返回一个手动重播清单的函数（视图集合动态变化时用）。
 */
export function useFrameTabs(options: UseFrameTabsOptions): () => void {
  const frameId = options.frameId ?? FRAME_ID;
  const targetOrigin = options.targetOrigin ?? '*';
  const parent = typeof window === 'undefined' ? undefined : window.parent;

  const envelope = () => ({ channel: FRAME_NAV_CHANNEL, v: FRAME_NAV_VERSION, frameId, from: 'frame' as const });

  /** 把视图清单报给 host —— 这是 hub 合成 member docks 的唯一来源。 */
  function postManifest() {
    if (!parent || parent === window) return;
    parent.postMessage(
      {
        ...envelope(),
        type: 'ready',
        current: options.current(),
        tabs: options.tabs.map(tab => ({
          id: tab.id,
          title: tab.title,
          icon: tab.icon,
          // hub 把 `path` 当 opaque 交回来，SPA 自己映射到 hash 路由。
          navTarget: { path: tab.id },
          fallbackUrl: `#/${tab.id}`
        }))
      },
      targetOrigin
    );
  }

  /** 内部导航（用户点了 SPA 里的链接 / 改了 hash）→ 让 host 的 dock 高亮跟上。 */
  function postNavigated() {
    if (!parent || parent === window) return;
    parent.postMessage({ ...envelope(), type: 'navigated', tabId: options.current() }, targetOrigin);
  }

  function onMessage(event: MessageEvent) {
    const data = event.data as
      | { channel?: string; v?: number; frameId?: string; from?: string; type?: string; tabId?: string }
      | undefined;
    if (
      !data ||
      data.channel !== FRAME_NAV_CHANNEL ||
      data.v !== FRAME_NAV_VERSION ||
      data.frameId !== frameId ||
      data.from !== 'host'
    ) {
      return;
    }
    if (data.type === 'hello') {
      postManifest();
      return;
    }
    if (data.type === 'navigate' && data.tabId) {
      options.onNavigate(data.tabId);
      // 导航完成后回报当前位置，host 据此确认高亮。
      postNavigated();
    }
  }

  onMounted(() => {
    window.addEventListener('message', onMessage);
    window.addEventListener('hashchange', postNavigated);
    // host 侧 `attachFrameNavClient` 会先发 `hello`；这里也主动报一次，避免
    // 双方都等对方的握手（host 的 handshake 超时后 anchor 会退化成普通 iframe）。
    postManifest();
  });

  onUnmounted(() => {
    window.removeEventListener('message', onMessage);
    window.removeEventListener('hashchange', postNavigated);
  });

  return postManifest;
}
