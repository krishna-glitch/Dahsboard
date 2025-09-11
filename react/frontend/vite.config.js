import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(async () => {
  const plugins = [react()];
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
    build: {
      // Use default minifier unless explicitly requested; avoids requiring lightningcss
      cssMinify: process.env.CSS_MINIFIER === 'lightningcss' ? 'lightningcss' : true,
      // Enable source maps by default for better debugging and Lighthouse scores
      sourcemap: process.env.VITE_SOURCEMAP !== '0',
      rollupOptions: {
        output: {
          // Optimize chunk sizes and enable source maps for better debugging
          manualChunks: {
            // Separate large vendor libraries for better caching
            'plotly-basic': ['plotly.js-basic-dist-min'],
            'plotly-gl2d': ['plotly.js-gl2d-dist-min'], 
            'plotly-full': ['plotly.js-dist-min'],
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'data-vendor': ['@tanstack/react-query', '@apache-arrow/esnext-esm'],
          },
          sourcemapExcludeSources: true, // Exclude source content to reduce map file size
        }
      }
    },
    resolve: {
      alias: {
        // Use the ESM build of Apache Arrow
        'apache-arrow': '@apache-arrow/esnext-esm'
      }
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:5000',
          changeOrigin: true,
          secure: false,
          ws: true,
        }
      }
    }
  }
})
