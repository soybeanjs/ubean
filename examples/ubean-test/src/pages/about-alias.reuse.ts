import { definePage } from 'ubean';

// Reuse route: register /about-alias that reuses the About page component.
// The component loader is shared with the target page — no separate .vue file needed.
definePage({
  reuse: 'About',
  path: '/about-alias'
});
