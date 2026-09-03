import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname),
      // @strudel/core's node build trips on this browser-only dependency
      '@kabelsalat/web': path.resolve(__dirname, 'tests/stubs/kabelsalat-web.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    server: {
      deps: {
        // process @strudel through vite so the @kabelsalat/web alias applies
        // to its internal imports (its node build lacks the named export)
        inline: [/@strudel\//],
      },
    },
  },
});
