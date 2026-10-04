import { useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router';
import { FarmProvider } from '../../context/FarmContext.jsx';
import { AppSidebar } from '../navigation/AppSidebar.jsx';
import { Topbar } from '../navigation/Topbar.jsx';

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef(null);
  const sidebarRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const sidebar = sidebarRef.current;
    const focusable = () => [...(sidebar?.querySelectorAll('a[href], button:not([disabled]), select:not([disabled]), [tabindex="0"]') || [])]
      .filter((element) => element.getClientRects().length > 0);
    focusable()[0]?.focus();
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      if (!items.length) return;
      if (event.shiftKey && document.activeElement === items[0]) {
        event.preventDefault(); items.at(-1).focus();
      } else if (!event.shiftKey && document.activeElement === items.at(-1)) {
        event.preventDefault(); items[0].focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      menuButtonRef.current?.focus();
    };
  }, [menuOpen]);

  return (
    <FarmProvider>
      <div className="app-frame">
        <AppSidebar ref={sidebarRef} open={menuOpen} onClose={() => setMenuOpen(false)} />
        <div className="app-main"><Topbar menuOpen={menuOpen} menuButtonRef={menuButtonRef} onMenu={() => setMenuOpen(true)} /><main className="page-content"><Outlet /></main></div>
      </div>
    </FarmProvider>
  );
}
