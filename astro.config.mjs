import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  site: 'https://kbin-001.github.io',
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
      langs: ['bash', 'diff', 'log', 'c', 'cpp', 'java', 'xml', 'text', 'makefile'],
      langAlias: {
        dts: 'c',
      },
    },
  },
});
