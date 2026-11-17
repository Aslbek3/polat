import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Testlar bitta haqiqiy PostgreSQL bazasini ishlatadi — parallel fayllar
    // bir-birining jadvallarini tozalab yubormasligi uchun ketma-ket.
    fileParallelism: false,
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 20_000,
  },
});
