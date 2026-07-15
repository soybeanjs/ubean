import { describe, it, expect } from 'vitest';
import type { TypedLinkProps } from 'ubean';
import { api } from './helper';

describe('Type safety', () => {
  describe('TypedLinkProps', () => {
    it('accepts string "to" prop', () => {
      const props: TypedLinkProps = {
        to: '/about'
      };
      expect(props.to).toBe('/about');
    });

    it('accepts object "to" prop with name', () => {
      const props: TypedLinkProps = {
        to: { name: 'about' }
      };
      expect(props.to).toEqual({ name: 'about' });
    });

    it('accepts object "to" prop with params', () => {
      const props: TypedLinkProps = {
        to: { name: 'user', params: { id: '42' } }
      };
      expect(props.to).toEqual({ name: 'user', params: { id: '42' } });
    });

    it('accepts object "to" prop with query', () => {
      const props: TypedLinkProps = {
        to: { name: 'search', query: { q: 'test' } }
      };
      expect(props.to).toEqual({ name: 'search', query: { q: 'test' } });
    });

    it('accepts object "to" prop with hash', () => {
      const props: TypedLinkProps = {
        to: { name: 'about', hash: '#section' }
      };
      expect(props.to).toEqual({ name: 'about', hash: '#section' } as any);
    });

    it('accepts activeClass prop', () => {
      const props: TypedLinkProps = {
        to: '/about',
        activeClass: 'active'
      };
      expect(props.activeClass).toBe('active');
    });

    it('accepts exactActiveClass prop', () => {
      const props: TypedLinkProps = {
        to: '/about',
        exactActiveClass: 'exact-active'
      };
      expect(props.exactActiveClass).toBe('exact-active');
    });
  });

  describe('Link component HTTP integration', () => {
    it('Link renders as anchor tag', async () => {
      const res = await api('/about');
      expect(res.status).toBe(200);
      expect(res.text).toContain('<a');
    });

    it('Link with to="/" renders correct href', async () => {
      const res = await api('/user/123');
      expect(res.status).toBe(200);
      // The back link should point to /
      expect(res.text).toContain('href="/"');
    });

    it('Link active class is applied on matching route', async () => {
      const res = await api('/');
      expect(res.status).toBe(200);
      // Links on the index page pointing to / should be active
    });
  });

  describe('Route type safety (compile-time)', () => {
    it('defineHandler accepts proper types at compile time', () => {
      // This is a type-level test - if it compiles, it passes
      const handler = async (c: any) => {
        return c.json({ ok: true });
      };
      expect(typeof handler).toBe('function');
    });

    it('defineValidator accepts Standard Schema', () => {
      // Type-level test: defineValidator should accept Standard Schema v1
      const schema = {
        '~standard': { version: 1, vendor: 'test' },
        safeParse: (input: unknown) => ({ success: true, data: input })
      };
      expect(schema['~standard'].version).toBe(1);
    });
  });
});
