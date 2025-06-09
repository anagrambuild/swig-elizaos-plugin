import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  format: ['esm'],
  dts: true,
  target: 'es2022',
  minify: false,
  external: [
    '@elizaos/core',
    '@solana/web3.js',
    '@solana/spl-token',
    '@swig-wallet/classic',
    'bs58',
  ],
});
