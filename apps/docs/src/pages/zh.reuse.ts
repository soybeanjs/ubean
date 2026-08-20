import { definePage } from 'ubean';

// Reuse route: register /zh (Chinese homepage) that reuses the Index page
// component with the home layout. Without this, /zh falls through to the
// [...slug].vue catch-all which tries to load content/zh/index.md (not
// present) and returns a 404. The layout must be set explicitly because
// reuse routes only inherit `cache` from their target, not `layout`.
definePage({
  reuse: 'Index',
  path: '/zh',
  layout: 'home'
});
