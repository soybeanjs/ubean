import { defineHandler, defineManifest, createManifestResponse } from 'ubean';

const manifest = defineManifest({
  name: 'Ubean Test App',
  short_name: 'UbeanTest',
  description: 'A test project for ubean framework',
  start_url: '/',
  display: 'standalone',
  background_color: '#ffffff',
  theme_color: '#3b82f6',
  orientation: 'portrait-primary',
  icons: [
    {
      src: '/icon-192.png',
      sizes: '192x192',
      type: 'image/png',
      purpose: 'any maskable'
    },
    {
      src: '/icon-512.png',
      sizes: '512x512',
      type: 'image/png',
      purpose: 'any maskable'
    }
  ],
  categories: ['developer', 'tools'],
  lang: 'en',
  dir: 'ltr'
});

export const GET = defineHandler(() => {
  return createManifestResponse(manifest);
});
