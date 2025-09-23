import React, { useState, useEffect } from 'react';
import SimpleLoadingBar from './SimpleLoadingBar';

/**
 * Demo component to showcase the enhanced progress bar features
 * Remove this file after testing
 */
const ProgressBarDemo = () => {
  const [scenario, setScenario] = useState('indeterminate');
  const [progress, setProgress] = useState(0);
  const [current, setCurrent] = useState(0);
  const [total] = useState(1500);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (scenario === 'determinate' && isVisible) {
      const interval = setInterval(() => {
        setProgress(prev => {
          const next = prev + Math.random() * 10;
          if (next >= 100) {
            clearInterval(interval);
            setTimeout(() => setIsVisible(false), 1000);
            return 100;
          }
          return next;
        });
        setCurrent(prev => Math.min(prev + Math.floor(Math.random() * 50), total));
      }, 200);

      return () => clearInterval(interval);
    }
  }, [scenario, isVisible, total]);

  const startDemo = (type) => {
    setScenario(type);
    setIsVisible(true);
    setProgress(0);
    setCurrent(0);

    if (type === 'indeterminate') {
      setTimeout(() => setIsVisible(false), 5000);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px' }}>
      <h3>Enhanced Progress Bar Demo</h3>

      <div style={{ marginBottom: '20px' }}>
        <button onClick={() => startDemo('indeterminate')} style={{ marginRight: '10px' }}>
          Show Indeterminate (Water Quality Style)
        </button>
        <button onClick={() => startDemo('determinate')} style={{ marginRight: '10px' }}>
          Show Determinate (Redox Analysis Style)
        </button>
        <button onClick={() => setIsVisible(false)}>
          Hide
        </button>
      </div>

      {/* Indeterminate Progress Bar */}
      {scenario === 'indeterminate' && (
        <SimpleLoadingBar
          isVisible={isVisible}
          message="Loading water quality data for 3 sites..."
          stage="loading"
          compact={false}
          progress={null} // Indeterminate
          current={null}
          total={null}
          showPercentage={false}
          showCounts={false}
        />
      )}

      {/* Determinate Progress Bar */}
      {scenario === 'determinate' && (
        <SimpleLoadingBar
          isVisible={isVisible}
          message="Loading redox data for 4 sites..."
          stage="processing"
          compact={false}
          progress={Math.round(progress)}
          current={current}
          total={total}
          showPercentage={true}
          showCounts={true}
        />
      )}

      <div style={{ marginTop: '20px', padding: '15px', background: '#f8f9fa', borderRadius: '8px' }}>
        <h4>Features Demonstrated:</h4>
        <ul>
          <li><strong>Indeterminate:</strong> Sliding animation when progress is unknown</li>
          <li><strong>Determinate:</strong> Real percentage progress with data counts</li>
          <li><strong>Dynamic Messages:</strong> Context-aware loading messages</li>
          <li><strong>Real Data:</strong> Shows current/total items loaded</li>
          <li><strong>Dark Mode:</strong> Properly styled for dark/light modes</li>
          <li><strong>Responsive:</strong> Works on all screen sizes</li>
        </ul>
      </div>
    </div>
  );
};

export default ProgressBarDemo;