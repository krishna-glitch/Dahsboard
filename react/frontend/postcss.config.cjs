// PostCSS config with optional PurgeCSS
// Enable by setting VITE_PURGE_CSS=1 on build

// eslint-disable-next-line @typescript-eslint/no-var-requires
const purgecss = require('@fullhuman/postcss-purgecss');

const enablePurge = String(process.env.VITE_PURGE_CSS || '').toLowerCase() === '1';

module.exports = {
  plugins: [
    enablePurge && purgecss({
      content: [
        './index.html',
        './src/**/*.{js,jsx,ts,tsx}',
      ],
      defaultExtractor: content => content.match(/[A-Za-z0-9-_:/%.]+/g) || [],
      safelist: {
        standard: [
          // bootstrap core
          /^container(-fluid)?$/, /^row$/, /^col-/, /^g-/, /^gx-/, /^gy-/,
          /^btn/, /^alert/, /^badge/, /^dropdown/, /^modal/, /^offcanvas/, /^toast/,
          /^table/, /^thead/, /^tbody/, /^pagination/, /^page-item/, /^page-link/,
          /^form-/, /^input-/, /^is-/, /^was-/, /^valid/, /^invalid/,
          /^text-/, /^bg-/, /^border-/, /^d-/, /^flex/, /^align-/, /^justify-/, /^gap-/,
          // spacing utilities (padding/margin)
          /^p-/, /^px-/, /^py-/, /^pt-/, /^pb-/, /^ps-/, /^pe-/,
          /^m-/, /^mx-/, /^my-/, /^mt-/, /^mb-/, /^ms-/, /^me-/,
          // icons
          /^bi-/,
          // app-specific
          /^data-table-/, /^modern-data-table/, /^virtualized-table-container/,
          /^redox-/, /^dashboard-/, /^layout-/, /^sidebar-/, /^card-/, /^toast-/,
          /^metrics-grid/, /^chart-container/
        ]
      },
    })
  ].filter(Boolean)
};
