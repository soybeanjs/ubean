/**
 * 文件下载系统测试
 *
 * 覆盖 ubean 的二进制响应能力, 主要通过 /api/download 路由验证:
 * - 默认 Content-Type: application/octet-stream
 * - Content-Disposition: attachment; filename="..."
 * - 自定义 filename 与 contentType query 参数
 * - Content-Length 与二进制内容正确性
 * - 不同 responseType (text/arraybuffer/blob) 的客户端处理
 *
 * 测试策略:
 * - HTTP 集成级: 通过 /api/download 验证响应头与二进制内容
 * - 客户端级: 使用 ubean createClient 的不同 responseType 验证解析
 */
import { describe, it, expect } from 'vitest';
import { get } from 'ubean';
import { api, getBaseUrl } from './helper';

describe('File download system', () => {
  describe('HTTP integration - /api/download (default behavior)', () => {
    it('returns 200 status', async () => {
      const res = await api('/api/download');
      expect(res.status).toBe(200);
    });

    it('returns application/octet-stream Content-Type by default', async () => {
      const res = await api('/api/download');
      expect(res.headers.get('Content-Type')).toBe('application/octet-stream');
    });

    it('returns Content-Disposition header with default filename', async () => {
      const res = await api('/api/download');
      const cd = res.headers.get('Content-Disposition');
      expect(cd).toBeTruthy();
      expect(cd).toContain('attachment');
      expect(cd).toContain('filename="test-file.bin"');
    });

    it('returns Content-Length header', async () => {
      const res = await api('/api/download');
      const len = res.headers.get('Content-Length');
      expect(len).toBeTruthy();
      expect(Number(len)).toBeGreaterThan(0);
    });

    it('returns binary body containing expected text', async () => {
      const res = await api('/api/download');
      expect(res.text).toContain('File content for test-file.bin');
      expect(res.text).toContain('Generated at');
    });
  });

  describe('HTTP integration - /api/download?filename=custom', () => {
    it('uses custom filename in Content-Disposition', async () => {
      const res = await api('/api/download?filename=report.pdf');
      const cd = res.headers.get('Content-Disposition');
      expect(cd).toContain('filename="report.pdf"');
    });

    it('reflects custom filename in body content', async () => {
      const res = await api('/api/download?filename=my-data.csv');
      expect(res.text).toContain('File content for my-data.csv');
    });

    it('handles filename with special characters', async () => {
      const res = await api('/api/download?filename=data_2024-01-15.json');
      const cd = res.headers.get('Content-Disposition');
      expect(cd).toContain('filename="data_2024-01-15.json"');
    });
  });

  describe('HTTP integration - /api/download?contentType=custom', () => {
    it('uses custom Content-Type', async () => {
      const res = await api('/api/download?contentType=application/pdf');
      expect(res.headers.get('Content-Type')).toBe('application/pdf');
    });

    it('uses text/csv contentType', async () => {
      const res = await api('/api/download?contentType=text/csv&filename=data.csv');
      expect(res.headers.get('Content-Type')).toBe('text/csv');
    });

    it('uses image/png contentType', async () => {
      const res = await api('/api/download?contentType=image/png&filename=img.png');
      expect(res.headers.get('Content-Type')).toBe('image/png');
    });

    it('preserves both custom filename and contentType together', async () => {
      const res = await api('/api/download?filename=archive.zip&contentType=application/zip');
      expect(res.headers.get('Content-Type')).toBe('application/zip');
      expect(res.headers.get('Content-Disposition')).toContain('filename="archive.zip"');
    });
  });

  describe('Content-Length accuracy', () => {
    it('Content-Length matches actual byte count of UTF-8 content', async () => {
      const res = await api('/api/download?filename=test.bin');
      const declaredLen = Number(res.headers.get('Content-Length'));
      // The response body should match Content-Length when treated as UTF-8 bytes
      // Note: res.text decodes the body; byte length may differ from string length
      const encoder = new TextEncoder();
      const actualBytes = encoder.encode(res.text);
      expect(actualBytes.length).toBe(declaredLen);
    });

    it('Content-Length increases with longer filename', async () => {
      const res1 = await api('/api/download?filename=short.bin');
      const res2 = await api('/api/download?filename=very-long-filename.bin');
      const len1 = Number(res1.headers.get('Content-Length'));
      const len2 = Number(res2.headers.get('Content-Length'));
      expect(len2).toBeGreaterThan(len1);
    });
  });

  describe('OpenAPI metadata (describeRoute)', () => {
    it('GET /api/download is documented in OpenAPI schema', async () => {
      const res = await api('/_openapi.json');
      expect(res.status).toBe(200);
      const schema = res.data as { paths: Record<string, Record<string, unknown>> };
      expect(schema.paths).toHaveProperty('/api/download');
      expect(schema.paths['/api/download']).toHaveProperty('get');
    });

    it('GET /api/download has "Files" tag', async () => {
      const res = await api('/_openapi.json');
      const schema = res.data as { paths: Record<string, { get: { tags?: string[] } }> };
      const op = schema.paths['/api/download']?.get;
      expect(op?.tags).toContain('Files');
    });

    it('GET /api/download declares filename query parameter', async () => {
      const res = await api('/_openapi.json');
      const schema = res.data as {
        paths: Record<string, { get: { parameters?: Array<{ name: string }> } }>;
      };
      const op = schema.paths['/api/download']?.get;
      const paramNames = (op?.parameters || []).map(p => p.name);
      expect(paramNames).toContain('filename');
      expect(paramNames).toContain('contentType');
    });
  });

  describe('Client-side responseType (using ubean createClient)', () => {
    it('get() returns Blob for binary responses by default', async () => {
      // ofetch returns Blob for application/octet-stream Content-Type
      const data = await get(`${getBaseUrl()}/api/download?filename=client.txt`);
      expect(data).toBeInstanceOf(Blob);
      const text = await (data as Blob).text();
      expect(text).toContain('File content for client.txt');
    });

    it('get() with responseType: "blob" returns Blob', async () => {
      const { createClient } = await import('ubean');
      const client = createClient({ baseURL: getBaseUrl() });
      const data = await client.get('/api/download?filename=blob.bin', {
        responseType: 'blob'
      });
      expect(data).toBeInstanceOf(Blob);
      const text = await data.text();
      expect(text).toContain('File content for blob.bin');
    });

    it('native fetch arrayBuffer() byte length matches Content-Length', async () => {
      const res = await fetch(`${getBaseUrl()}/api/download?filename=len-check.bin`);
      const declaredLen = Number(res.headers.get('Content-Length'));
      const buf = await res.arrayBuffer();
      expect(buf).toBeInstanceOf(ArrayBuffer);
      expect(buf.byteLength).toBe(declaredLen);
      const text = new TextDecoder().decode(buf);
      expect(text).toContain('File content for len-check.bin');
    });

    it('native fetch text() decodes binary body as UTF-8 string', async () => {
      const res = await fetch(`${getBaseUrl()}/api/download?filename=text.bin`);
      const text = await res.text();
      expect(typeof text).toBe('string');
      expect(text).toContain('File content for text.bin');
    });
  });

  describe('Multiple downloads (consistency)', () => {
    it('successive downloads return same filename', async () => {
      const res1 = await api('/api/download?filename=stable.bin');
      const res2 = await api('/api/download?filename=stable.bin');
      const cd1 = res1.headers.get('Content-Disposition');
      const cd2 = res2.headers.get('Content-Disposition');
      expect(cd1).toBe(cd2);
    });

    it('successive downloads return identical Content-Length', async () => {
      const res1 = await api('/api/download?filename=same.bin');
      const res2 = await api('/api/download?filename=same.bin');
      expect(res1.headers.get('Content-Length')).toBe(res2.headers.get('Content-Length'));
    });
  });
});
