import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import viteCompression from 'vite-plugin-compression';
import { fileURLToPath } from 'node:url';

// https://vite.dev/config/
export default defineConfig(async () => {
  const plugins = [
    react(),
    // Enable gzip compression for better Lighthouse scores
    viteCompression({
      algorithm: 'gzip',
      ext: '.gz',
    }),
    // Enable brotli compression (preferred)
    viteCompression({
      algorithm: 'brotliCompress',
      ext: '.br',
    }),
  ];

  if (process.env.ANALYZE === '1' || process.env.VISUALIZE === '1') {
    try {
      const { visualizer } = await import('rollup-plugin-visualizer');
      plugins.push(visualizer({
        filename: 'dist/stats.html',
        template: 'treemap',
        gzipSize: true,
        brotliSize: true,
      }));
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[vite] rollup-plugin-visualizer not installed; skip analyze');
    }
  }

  return {
    plugins,
    base: './',
    resolve: {
      alias: [
        { find: 'apache-arrow', replacement: '@apache-arrow/esnext-esm' },
        {
          find: 'plotly.js/dist/plotly',
          replacement: fileURLToPath(
            new URL('./node_modules/plotly.js-dist-min/plotly.min.js', import.meta.url),
          ),
        },
      ],
    },
    build: {
      // Use default minifier unless explicitly requested; avoids requiring lightningcss
      cssMinify: process.env.CSS_MINIFIER === 'lightningcss' ? 'lightningcss' : true,
      // Enable source maps by default for better debugging and Lighthouse scores
      sourcemap: process.env.VITE_SOURCEMAP !== '0',
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalized = id.split('node_modules/').pop() || id;
            if (normalized.includes('plotly.js-basic-dist-min')) return 'plotly-basic';
            if (normalized.includes('plotly.js-gl2d-dist-min')) return 'plotly-gl2d';
            if (normalized.includes('plotly.js-dist-min')) return 'plotly-full';
            if (normalized.includes('react-plotly')) return 'plotly-react';
            if (normalized.includes('plotly')) return 'plotly-vendor';
            if (normalized.includes('@tanstack/react-query') || normalized.includes('@apache-arrow')) {
              return 'data-vendor';
            }
            if (
              normalized.includes('react/') ||
              normalized.includes('react-dom') ||
              normalized.includes('react-router-dom')
            ) {
              return 'react-vendor';
            }
            return undefined;
          },
          sourcemapExcludeSources: true,
        },
      },
    },
  };
});
