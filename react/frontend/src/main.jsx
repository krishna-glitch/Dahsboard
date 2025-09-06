import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
/* CSS Load Order - Proper Cascade Hierarchy */
import 'bootstrap/dist/css/bootstrap.min.css' // 1. External framework
import 'bootstrap-icons/font/bootstrap-icons.css' // 2. Icons
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

ReactDOM.createRoot(document.getElementById('root')).render(
  // <React.StrictMode> - Temporarily disabled to fix infinite re-render issues
    <BrowserRouter>
      <TutorialProvider>
        <App />
      </TutorialProvider>
    </BrowserRouter>
  // </React.StrictMode>
)
