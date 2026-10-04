import { Menu } from 'lucide-react';
import { useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext.jsx';
import { FarmSelector } from '../farm/FarmSelector.jsx';

const titles = {
  '/app/dashboard': 'Dashboard', '/app/farms': 'My farms',
  '/app/crop-recommendation': 'Crop recommendation', '/app/irrigation': 'Irrigation',
  '/app/fertilizer': 'Fertilizer', '/app/disease-detection': 'Disease detection',
  '/app/disease-risk': 'Disease risk', '/app/weather': 'Weather', '/app/market': 'Market intelligence',
  '/app/crop-ranking': 'Crop ranking', '/app/evaluation': 'Farm evaluation'
};

export function Topbar({ onMenu, menuOpen, menuButtonRef }) {
  const { pathname } = useLocation();
  const { user } = useAuth();
  return (
    <header className="topbar">
      <div className="topbar__context">
        <button ref={menuButtonRef} type="button" className="icon-button mobile-menu-button" aria-label={menuOpen ? 'Navigation open' : 'Open navigation'} aria-expanded={menuOpen} aria-controls="app-sidebar" onClick={onMenu}><Menu size={21} /></button>
        <div className="breadcrumb"><span>AgriSense</span><span className="breadcrumb__slash">/</span><strong>{titles[pathname] || 'Workspace'}</strong></div>
      </div>
      <div className="topbar__actions">
        <FarmSelector compact />
        <span className="topbar-divider" />
        <span className="topbar-profile"><span className="avatar avatar--topbar" aria-hidden="true">{(user?.name || 'F').trim().charAt(0).toUpperCase()}</span><span className="topbar-profile__copy"><strong>{user?.name || 'Farm user'}</strong><small>AgriSense account</small></span></span>
      </div>
    </header>
  );
}
