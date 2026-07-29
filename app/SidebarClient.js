"use client";

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';

function deriveNameFromEmail(email) {
  return String(email || '')
    .split('@')[0].split('.').filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
}

const NAV = [
  { label: 'Admin Approvals', href: '/admin' },
  { label: 'User Roles', href: '/users' },
  { label: 'Hierarchy', href: '/hierarchy' },
  { label: 'Project Codes', href: '/project-codes' },
];

function formatRole(role) {
  return String(role || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// Module-level: resets on every full page reload.
let _hr_lastVerified = 0;

export default function SidebarClient({ isDrawer = false, onClose }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [logoMissing, setLogoMissing] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('hr_portal_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, [pathname]);

  // Role verification: runs once on initial page load (module var = 0) then every 60s via interval.
  // Removed the per-navigation fetch — it was firing on every link click and causing UI lag.
  useEffect(() => {
    const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

    const verify = (signal) => {
      const stored = sessionStorage.getItem('hr_portal_user');
      if (!stored) return;
      const u = JSON.parse(stored);
      if (!u?.user_id) return;
      if (Date.now() - _hr_lastVerified < 55_000) return; // skip if checked recently
      fetch(`${API_BASE}/api/v1/auth/verify-session?userId=${u.user_id}`, { signal })
        .then((r) => r.json())
        .then((payload) => {
          if (!payload.success) { handleLogout(); return; }
          const { user_roles, user_role, account_status } = payload.data;
          const roles = Array.isArray(user_roles) && user_roles.length > 0 ? user_roles : [user_role].filter(Boolean);
          const hasAccess = String(account_status || 'active').toLowerCase() === 'active' && roles.includes('hr');
          _hr_lastVerified = Date.now();
          if (!hasAccess) handleLogout();
        })
        .catch(() => {}); // ignore AbortError
    };

    // Run once on mount (catches revocation on page load)
    const ctrl = new AbortController();
    verify(ctrl.signal);

    // Then every 60 seconds
    const id = setInterval(() => {
      const c = new AbortController();
      verify(c.signal);
    }, 60_000);

    return () => { ctrl.abort(); clearInterval(id); };
  }, []);

  const handleLogout = () => {
    sessionStorage.removeItem('hr_portal_user');
    router.push('/');
  };

  if (!user) return null;

  const displayName = user?.full_name || deriveNameFromEmail(user?.email) || 'HR';
  const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || 'HR';

  const sidebarStyle = isDrawer
    ? { width: 280, minHeight: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50, boxShadow: '0 20px 60px rgba(15,23,42,0.18)' }
    : { width: 240, minHeight: '100vh', borderRight: '1px solid #e5e7eb' };

  return (
    <aside className="flex flex-col bg-white" style={sidebarStyle}>
      {isDrawer && (
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <span className="text-sm font-semibold text-slate-900">Navigation</span>
          <button type="button" onClick={onClose} className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* Logo */}
      <div className="flex items-center justify-center" style={{ padding: '28px 24px 20px' }}>
        {!logoMissing ? (
          <Image
            src="/nextan-logo.png"
            alt="Nextan"
            width={120}
            height={36}
            className="object-contain"
            onError={() => setLogoMissing(true)}
          />
        ) : (
          <span className="text-lg font-bold text-blue-900 tracking-tight">nextan</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3" style={{ paddingTop: 8 }}>
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href}
              className="flex items-center rounded-2xl text-sm font-medium transition-colors"
              style={{
                padding: '13px 18px', marginBottom: 6,
                background: active ? '#e8edf8' : 'white',
                color: active ? '#1a3a8f' : '#374151',
                fontWeight: active ? 600 : 500,
              }}>
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Profile block */}
      <div className="px-3 pb-5 pt-3" style={{ borderTop: '1px solid #f0f0f0' }}>
        <div className="flex items-center gap-3 rounded-2xl" style={{ background: '#f5f7fc', padding: '12px 14px' }}>
          <div className="flex items-center justify-center rounded-full text-white text-sm font-bold flex-shrink-0"
            style={{ width: 38, height: 38, background: '#1a3a8f', fontSize: 13 }}>
            {initials}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="text-sm font-semibold truncate" style={{ color: '#111827', lineHeight: 1.3 }}>{displayName}</p>
            <p className="text-xs truncate" style={{ color: '#6b7280', marginTop: 1 }}>HR</p>
          </div>

          {/* Logout button */}
          <button
            onClick={handleLogout}
            title="Log out"
            className="flex-shrink-0 flex items-center justify-center rounded-lg transition hover:bg-red-50"
            style={{ width: 30, height: 30, color: '#9ca3af' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
