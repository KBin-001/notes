import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

export default defineConfig({
  integrations: [mdx()],
  markdown: {
    shikiConfig: {
      theme: 'github-dark',
      langs: ['bash', 'diff', 'log', 'c', 'cpp', 'java', 'xml', 'text'],
    },
  },
});
