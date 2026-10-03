import { Leaf, LogOut, PanelLeftClose } from 'lucide-react';
import { NavLink } from 'react-router';
import { useAuth } from '../../context/AuthContext.jsx';
import { Brand } from '../Brand.jsx';
import { navigationGroups } from './navigation.js';

function initials(name = '') {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'F';
}

export function AppSidebar({ open, onClose }) {
  const { user, logout } = useAuth();
  return (
    <>
      {open && <button className="sidebar-scrim" aria-label="Close navigation" onClick={onClose} />}
      <aside className={`app-sidebar${open ? ' app-sidebar--open' : ''}`} aria-label="Main navigation">
        <div className="sidebar-brand-row"><Brand inverse /><button className="icon-button sidebar-close" aria-label="Close navigation" onClick={onClose}><PanelLeftClose size={19} /></button></div>
        <div className="sidebar-organization"><span className="organization-dot" /><span>MY FARM WORKSPACE</span></div>
        <nav className="sidebar-nav">
          {navigationGroups.map((group) => (
            <section className="nav-group" key={group.label} aria-label={group.label}>
              <h2>{group.label}</h2>
              {group.links.map(({ label, to, icon: Icon, end }) => (
                <NavLink key={to} to={to} end={end} onClick={onClose} className={({ isActive }) => `nav-link${isActive ? ' nav-link--active' : ''}`}>
                  <Icon size={18} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note"><span className="sidebar-note__icon"><Leaf size={15} /></span><span><strong>Grounded in your farm</strong><small>Advice shaped by your field data.</small></span></div>
          <div className="profile-block">
            <span className="avatar avatar--sidebar">{initials(user?.name)}</span>
            <span className="profile-copy"><strong>{user?.name || 'Farm user'}</strong><small>{user?.email || 'AgriSense account'}</small></span>
            <button type="button" className="icon-button logout-button" aria-label="Log out" title="Log out" onClick={logout}><LogOut size={17} /></button>
          </div>
        </div>
      </aside>
    </>
  );
}
