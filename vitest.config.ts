import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Only src tests run by default. The 5 root-level Firebase-emulator suites stay on
    // disk but are excluded: they require the Firebase Emulator Suite (Java), which is
    // not available on this machine. They are replaced by Supabase suites in Stage 6.
    include: ['src/**/*.test.ts'],
  },
});
