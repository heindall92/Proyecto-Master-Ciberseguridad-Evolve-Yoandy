import React from 'react';

interface EmptyStateProps {
  message: string;
  icon?: string;
  description?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message, icon = 'i-overview', description }) => {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100%',
      padding: '40px',
      textAlign: 'center',
      opacity: 0.6
    }}>
      <div style={{ 
        width: '64px', height: '64px', marginBottom: '20px', 
        border: '1px solid var(--line)', borderRadius: '50%', 
        display: 'grid', placeItems: 'center', background: 'rgba(255,255,255,0.03)' 
      }}>
        <svg style={{ width: '32px', height: '32px', stroke: 'var(--text-dim)', fill: 'none', strokeWidth: 1.5 }}>
          <use href={`#${icon}`} />
        </svg>
      </div>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '14px', color: 'var(--text)', letterSpacing: '1px' }}>{message}</h3>
      {description && <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-dim)' }}>{description}</p>}
    </div>
  );
};
