import React from 'react';

const Support = () => {
  return (
    <div style={{
      maxWidth: 720,
      margin: '40px auto',
      background: 'var(--surface, #0b1020)',
      border: '1px solid rgba(148,163,184,0.15)',
      borderRadius: 12,
      padding: 24,
      color: 'var(--text, #e5e7eb)'
    }}>
      <h1 style={{ marginTop: 0, marginBottom: 8 }}>Account Support</h1>
      <p style={{ marginTop: 0, color: '#94a3b8' }}>
        Forgot your password or having trouble signing in? Choose an option below.
      </p>

      <div style={{ display: 'grid', gap: 14, marginTop: 18 }}>
        <a href="#" onClick={(e) => e.preventDefault()} style={linkCard}>Reset password (coming soon)</a>
        <a href="mailto:support@example.com?subject=Water%20Quality%20Dashboard%20Support" style={linkCard}>
          Email Support (support@example.com)
        </a>
        <a href="/about" style={linkCard}>Read about the platform</a>
      </div>

      <p style={{ marginTop: 18, color: '#94a3b8', fontSize: 14 }}>
        Tip: If this is a demo environment, use the credentials on the sign‑in page.
      </p>
    </div>
  );
};

const linkCard = {
  display: 'block',
  padding: '14px 16px',
  borderRadius: 10,
  textDecoration: 'none',
  color: '#e5e7eb',
  background: 'rgba(17,24,39,0.7)',
  border: '1px solid rgba(148,163,184,0.2)'
};

export default Support;

