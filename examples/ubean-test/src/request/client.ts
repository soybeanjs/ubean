import { createClient, createTypedClient, createTypedFlatClient } from 'ubean';
import type { paths } from '../../.ubean/openapi';

/**
 * 底层 HTTP 客户端实例(ofetch 封装)。
 *
 * api 和 flatApi 共用同一个 client 实例,共享 baseURL/timeout/headers 等配置。
 * 调整配置时只需修改此处一处。
 */
const client = createClient({
  // baseURL: '/api',  // 按需设置 API 基础路径
  // timeout: 10000,
});

/**
 * 浏览器端类型化 HTTP 客户端(抛异常模式)
 *
 * 路径、参数、请求体和返回值类型均从 OpenAPI schema 自动推断。
 * 启动 dev server 后类型会自动更新(.ubean/openapi.d.ts)。
 *
 * 支持通过 responseType 配置不同的返回类型:
 * - 'json' (默认): 返回解析后的 JSON 数据
 * - 'blob': 返回 { file: Blob; filename: string; contentType: string }
 * - 'text': 返回 string
 * - 'arraybuffer': 返回 { file: ArrayBuffer; filename: string; contentType: string }
 *
 * @example
 * import { api } from '../request/client';
 *
 * // JSON 请求(默认)
 * const user = await api.get('/api/users/{id}', { params: { path: { id: 1 } } });
 *
 * // 文件下载
 * const file = await api.get('/api/download', { responseType: 'blob' });
 * // file: { file: Blob; filename: string; contentType: string }
 *
 * // 文本
 * const text = await api.get('/api/text', { responseType: 'text' });
 * // text: string
 */
export const api = createTypedClient<paths>(client);

/**
 * 扁平模式类型化 HTTP 客户端(不抛异常,通过返回值判断)
 *
 * 返回 { data, error, status } — 成功时 error 为 null,失败时 data 为 null。
 * 接口与 api 一致,同样支持 responseType。
 *
 * @example
 * import { flatApi } from '../request/client';
 *
 * const { data, error } = await flatApi.get('/api/users/{id}', {
 *   params: { path: { id: 1 } }
 * });
 * if (error) {
 *   console.error('Failed:', error.message);
 * } else {
 *   console.log('User:', data);
 * }
 *
 * // 文件下载
 * const { data, error } = await flatApi.get('/api/download', { responseType: 'blob' });
 * if (!error) {
 *   console.log('Filename:', data.filename);
 * }
 */
export const flatApi = createTypedFlatClient<paths>(client);
