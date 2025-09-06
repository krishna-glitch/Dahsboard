import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: './',
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
        changeOrigin: true, // Forward correct Host so cookies apply to frontend origin
        secure: false,
        ws: true,
        cookieDomainRewrite: { '*': 'localhost' }, // Rewrite any domain to localhost (dev origin)
        cookiePathRewrite: false,   // Preserve cookie path
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.log('proxy error', err);
          });
          proxy.on('proxyReq', (proxyReq, req) => {
            console.log('Sending Request to the Target:', req.method, req.url);
            // Ensure cookies are forwarded
            if (req.headers.cookie) {
              console.log('Forwarding cookies:', req.headers.cookie);
            }
          });
          proxy.on('proxyRes', (proxyRes, req) => {
            console.log('Received Response from the Target:', proxyRes.statusCode, req.url);
            // Log set-cookie headers
            if (proxyRes.headers['set-cookie']) {
              console.log('Received Set-Cookie:', proxyRes.headers['set-cookie']);
            }
          });
        },
      }
    }
  }
})
