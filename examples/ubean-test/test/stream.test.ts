/**
 * Streaming 响应系统测试
 *
 * 覆盖 ubean 的流式响应能力:
 * - createStreamResponse: 创建 ReadableStream 响应
 * - StreamHelper: enqueue/close/error 接口
 * - HTTP 集成: 通过 /api/stream-test 验证端到端流式输出
 *
 * 测试策略:
 * - 函数级: 直接调用 createStreamResponse 验证 Response 与流内容
 * - HTTP 集成级: 通过 /api/stream-test 验证 Content-Type 与流式数据
 */
import { describe, it, expect } from 'vitest';
import { createStreamResponse } from 'ubean';
import { api } from './helper';

describe('Streaming response system', () => {
  describe('createStreamResponse()', () => {
    it('returns a Response instance', () => {
      const res = createStreamResponse({}, async stream => {
        stream.enqueue('hello');
        stream.close();
      });
      expect(res).toBeInstanceOf(Response);
    });

    it('returns 200 status by default', () => {
      const res = createStreamResponse({}, async stream => {
        stream.enqueue('data');
        stream.close();
      });
      expect(res.status).toBe(200);
    });

    it('accepts custom status code', () => {
      const res = createStreamResponse({ status: 201 }, async stream => {
        stream.enqueue('created');
        stream.close();
      });
      expect(res.status).toBe(201);
    });

    it('accepts custom headers', () => {
      const res = createStreamResponse(
        { headers: { 'Content-Type': 'text/event-stream', 'X-Custom': 'yes' } },
        async stream => {
          stream.close();
        }
      );
      expect(res.headers.get('Content-Type')).toBe('text/event-stream');
      expect(res.headers.get('X-Custom')).toBe('yes');
    });

    it('returns a ReadableStream body', () => {
      const res = createStreamResponse({}, async stream => {
        stream.enqueue('x');
        stream.close();
      });
      expect(res.body).toBeInstanceOf(ReadableStream);
    });

    it('streams enqueued string chunks', async () => {
      const res = createStreamResponse({}, async stream => {
        stream.enqueue('chunk1\n');
        stream.enqueue('chunk2\n');
        stream.close();
      });
      const text = await res.text();
      expect(text).toBe('chunk1\nchunk2\n');
    });

    it('serializes non-string chunks as JSON', async () => {
      const res = createStreamResponse({}, async stream => {
        stream.enqueue({ message: 'hello' });
        stream.enqueue([1, 2, 3]);
        stream.close();
      });
      const text = await res.text();
      expect(text).toContain('"message":"hello"');
      expect(text).toContain('[1,2,3]');
    });

    it('streams chunks asynchronously', async () => {
      const res = createStreamResponse({}, async stream => {
        stream.enqueue('start\n');
        await new Promise(r => setTimeout(r, 10));
        stream.enqueue('middle\n');
        await new Promise(r => setTimeout(r, 10));
        stream.enqueue('end\n');
        stream.close();
      });
      const text = await res.text();
      expect(text).toBe('start\nmiddle\nend\n');
    });

    it('close() ends the stream', async () => {
      const res = createStreamResponse({}, async stream => {
        stream.enqueue('done');
        stream.close();
      });
      const reader = res.body!.getReader();
      const { value, done } = await reader.read();
      expect(done).toBe(false);
      expect(new TextDecoder().decode(value)).toBe('done');
      const final = await reader.read();
      expect(final.done).toBe(true);
    });

    it('error() propagates error to stream', async () => {
      const res = createStreamResponse({}, async stream => {
        stream.error(new Error('stream error'));
      });
      // Reading the body should reject or produce no data
      await expect(res.text()).rejects.toThrow();
    });

    it('onStart callback is awaited', async () => {
      let callbackCompleted = false;
      const res = createStreamResponse({}, async stream => {
        await new Promise(r => setTimeout(r, 20));
        stream.enqueue('after-delay');
        stream.close();
        callbackCompleted = true;
      });
      await res.text();
      expect(callbackCompleted).toBe(true);
    });

    it('handles thrown error in onStart', async () => {
      const res = createStreamResponse({}, async () => {
        throw new Error('callback failure');
      });
      await expect(res.text()).rejects.toThrow('callback failure');
    });

    it('encodes UTF-8 multi-byte characters correctly', async () => {
      const res = createStreamResponse({}, async stream => {
        stream.enqueue('héllo wörld 中文 🚀');
        stream.close();
      });
      const text = await res.text();
      expect(text).toBe('héllo wörld 中文 🚀');
    });
  });

  describe('HTTP integration - /api/stream-test', () => {
    it('returns 200 status', async () => {
      const res = await api('/api/stream-test');
      expect(res.status).toBe(200);
    });

    it('returns text/plain Content-Type', async () => {
      const res = await api('/api/stream-test');
      expect(res.headers.get('Content-Type')).toContain('text/plain');
    });

    it('contains "Streaming start" prefix', async () => {
      const res = await api('/api/stream-test');
      expect(res.text).toContain('Streaming start');
    });

    it('contains "Streaming complete" suffix', async () => {
      const res = await api('/api/stream-test');
      expect(res.text).toContain('Streaming complete');
    });

    it('streams 5 numbered chunks', async () => {
      const res = await api('/api/stream-test');
      // The stream emits Chunk 1..Chunk 5
      for (let i = 1; i <= 5; i++) {
        expect(res.text).toContain(`Chunk ${i}`);
      }
    });

    it('chunks appear in correct order', async () => {
      const res = await api('/api/stream-test');
      const startIdx = res.text.indexOf('Streaming start');
      const chunk1Idx = res.text.indexOf('Chunk 1');
      const chunk5Idx = res.text.indexOf('Chunk 5');
      const endIdx = res.text.indexOf('Streaming complete');
      expect(startIdx).toBeLessThan(chunk1Idx);
      expect(chunk1Idx).toBeLessThan(chunk5Idx);
      expect(chunk5Idx).toBeLessThan(endIdx);
    });
  });
});
