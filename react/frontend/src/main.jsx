import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
/* CSS Load Order - Proper Cascade Hierarchy */
import 'bootstrap/dist/css/bootstrap.min.css' // 1. External framework
// Defer Bootstrap Icons CSS to avoid render-blocking
import './styles/design-tokens.css' // 3. Design system foundation
import './index.css' // 4. Base styles and remaining tokens
import './styles/modern-layout.css' // 5. Layout systems
import './styles/landing-pages.css' // 6. Page-specific layouts
import './styles/components.css' // 7. Component styles
import './styles/dashboard.css' // 8. Dashboard-specific components
import './styles/error-boundaries.css' // 9. Error boundary styles
import './App.css'; // 10. App-specific overrides LAST
import { BrowserRouter } from 'react-router-dom'; // Import BrowserRouter
import { TutorialProvider } from './contexts/TutorialContext.jsx';

// Initialize performance monitoring
import './utils/performanceMonitor';

// Load icon font CSS after initial paint to reduce render-blocking
try {
  const deferIcons = () => import('bootstrap-icons/font/bootstrap-icons.css');
  if (typeof window !== 'undefined') {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => deferIcons());
    } else {
      setTimeout(() => deferIcons(), 0);
    }
  }
} catch (_) { /* no-op */ }

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode> - Temporarily disabled to fix infinite re-render issues
    <BrowserRouter>
      <TutorialProvider>
        <App />
      </TutorialProvider>
    </BrowserRouter>
  // </React.StrictMode>
)
