import { useState } from 'react';
import { Outlet } from 'react-router';
import { FarmProvider } from '../../context/FarmContext.jsx';
import { AppSidebar } from '../navigation/AppSidebar.jsx';
import { Topbar } from '../navigation/Topbar.jsx';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <FarmProvider>
      <div className="app-frame">
        <AppSidebar open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="app-main"><Topbar onMenu={() => setMenuOpen(true)} /><main className="page-content"><Outlet /></main></div>
      </div>
    </FarmProvider>
  );
}
