import { defineHandler, defineCors } from 'ubean';

const cors = defineCors({
  origin: ['https://example.com', 'http://localhost:5173'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Custom-Header'],
  exposeHeaders: ['X-Custom-Response-Header'],
  credentials: true,
  maxAge: 86400
});

export const GET = defineHandler(cors, c => {
  return c.json({
    message: 'CORS test endpoint',
    corsEnabled: true,
    allowedOrigins: ['https://example.com', 'http://localhost:5173']
  });
});

export const POST = defineHandler(cors, c => {
  return c.json({ message: 'POST with CORS', received: true });
});

export const OPTIONS = defineHandler(cors, c => {
  return c.json({ message: 'Preflight handled' });
});
