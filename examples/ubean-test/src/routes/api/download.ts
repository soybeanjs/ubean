import { object, optional, pipe, string, description } from 'valibot';
import { defineHandler, describeRoute, validator } from 'ubean';

const downloadQuerySchema = object({
  filename: optional(pipe(string(), description('Filename for the downloaded file'))),
  contentType: optional(pipe(string(), description('Content-Type of the response')))
});

/**
 * 文件下载测试路由
 *
 * 用于测试 typed client 的 responseType 功能(blob/arraybuffer/stream/text)。
 * 返回带 Content-Disposition 头的二进制内容,文件名通过 query 参数指定。
 */
export const GET = defineHandler(
  describeRoute({
    summary: 'Download a file',
    description: 'Returns a binary file with Content-Disposition header for responseType testing.',
    tags: ['Files'],
    responses: {
      200: {
        description: 'Binary file content',
        content: {
          'application/octet-stream': {
            schema: { type: 'string', format: 'binary' }
          }
        }
      }
    }
  }),
  validator('query', downloadQuerySchema),
  c => {
    const query = c.req.valid('query');
    const filename = query.filename || 'test-file.bin';
    const contentType = query.contentType || 'application/octet-stream';

    // 构造简单的二进制内容(用于测试 arraybuffer/blob/stream)
    const encoder = new TextEncoder();
    const content = `File content for ${filename}\nGenerated at ${new Date().toISOString()}\n`;
    const bytes = encoder.encode(content);

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(bytes.length)
      }
    });
  }
);
