"use client";

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { useRouter, usePathname } from 'next/navigation';
import { authHeaders, endSession } from './authSession';
import { WHATS_NEW_LATEST_ID, WHATS_NEW_SEEN_KEY } from './whatsNewData';

function deriveNameFromEmail(email) {
  return String(email || '').split('@')[0].split('.').filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()).join(' ');
}

function WhatsNewButton() {
  const [seenId, setSeenId] = useState(0);

  useEffect(() => {
    try { setSeenId(Number(localStorage.getItem(WHATS_NEW_SEEN_KEY)) || 0); } catch {}
  }, []);

  const hasUnseen = seenId < WHATS_NEW_LATEST_ID;

  const markSeen = () => {
    try { localStorage.setItem(WHATS_NEW_SEEN_KEY, String(WHATS_NEW_LATEST_ID)); } catch {}
    setSeenId(WHATS_NEW_LATEST_ID);
  };

  return (
    <Link href="/whats-new" onClick={markSeen} aria-label="What's new"
      className="relative flex items-center justify-center rounded-full text-slate-500 transition hover:bg-white"
      style={{ width: 40, height: 40 }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l2.09 6.26L20 10l-5.91 1.74L12 18l-2.09-6.26L4 10l5.91-1.74L12 2z" />
      </svg>
      {hasUnseen && <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-[#F7F9FD]" />}
    </Link>
  );
}

// Every page, and every named feature/action on those pages, so typing "approve" or
// "budget" finds the right place even if the user doesn't know which page it lives on.
const SEARCH_INDEX = [
  { label: 'Dashboard', href: '/dashboard', section: 'Page', keywords: 'home overview welcome pending out today' },
  { label: 'Approvals', href: '/admin', section: 'Page', keywords: 'approve accounts password reset leave requests' },
  { label: 'Employee', href: '/people', section: 'Page', keywords: 'user roles leave days entitlement employees' },
  { label: 'Projects', href: '/project-codes', section: 'Page', keywords: 'project codes budgets' },
  { label: 'Attendance', href: '/attendance', section: 'Page', keywords: 'attendance logs employees monitor' },
  { label: 'Reports', href: '/reports', section: 'Page', keywords: 'pdf report shareholder activity' },
  { label: 'Calendar', href: '/calendar', section: 'Page', keywords: 'public holidays singapore who is on leave' },
  { label: 'Claims', href: '/claims', section: 'Page', keywords: 'claims expense receipt reimbursement payroll paid export' },
  { label: 'Audit Log', href: '/audit-log', section: 'Page', keywords: 'audit trail history changes edits who changed before after' },
  { label: 'Pending Accounts', href: '/admin', section: 'Action', keywords: 'approve new signup account' },
  { label: 'Password Resets', href: '/admin', section: 'Action', keywords: 'reset password forgot temp' },
  { label: 'Leave Requests', href: '/admin', section: 'Action', keywords: 'approve leave time off' },
  { label: 'History', href: '/admin', section: 'Section', keywords: 'past decisions approved rejected' },
  { label: 'User Role Management', href: '/people?tab=roles', section: 'Action', keywords: 'assign role hr manager staff account manager' },
  { label: 'Leave days', href: '/people?tab=leave', section: 'Action', keywords: 'leave entitlement days per year assign employees' },
  { label: 'Org Hierarchy', href: '/project-codes?tab=hierarchy', section: 'Action', keywords: 'org chart reporting lines manager staff' },
  { label: 'Edit Organisation', href: '/project-codes?tab=hierarchy', section: 'Action', keywords: 'org chart edit assign remove manager staff' },
  { label: 'Change Password', href: '/profile', section: 'Action', keywords: 'password security account own my' },
  { label: 'Reset Password', href: '/profile', section: 'Action', keywords: 'password security account own my' },
  { label: 'Update Password', href: '/profile', section: 'Action', keywords: 'password security account own my' },
];

// Bolds/darkens the fragment of the label that actually matched what was typed and leaves
// the rest muted, so the row itself explains why it matched — no separate tag needed. When
// the match only came from a hidden keyword (not present in the label text), there's nothing
// to localize, so the whole label renders at normal weight instead of looking half-empty.
function HighlightedLabel({ label, query }) {
  if (!query) return <span>{label}</span>;
  const idx = label.toLowerCase().indexOf(query);
  if (idx === -1) return <span className="text-slate-900">{label}</span>;
  return (
    <span className="text-slate-400">
      {label.slice(0, idx)}
      <span className="text-slate-900 font-semibold">{label.slice(idx, idx + query.length)}</span>
      {label.slice(idx + query.length)}
    </span>
  );
}

function SearchBox() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const boxRef = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const q = query.trim().toLowerCase();
  const results = q
    ? SEARCH_INDEX.filter((item) => item.label.toLowerCase().includes(q) || item.keywords.includes(q)).slice(0, 8)
    : [];

  useEffect(() => { setActiveIndex(0); }, [query]);

  const go = (item) => {
    setQuery('');
    setOpen(false);
    router.push(item.href);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && results[activeIndex]) go(results[activeIndex]);
    else if (e.key === 'Escape') setOpen(false);
  };

  return (
    <div className="relative" ref={boxRef}>
      <div className="flex items-center gap-3 rounded-2xl bg-white border border-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.03)] px-4 max-w-xl focus-within:ring-2 focus-within:ring-blue-500" style={{ height: 48 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input type="text" placeholder="Search pages and actions, e.g. approve leave" aria-label="Search"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full bg-transparent text-sm text-slate-900 placeholder-slate-400 focus:outline-none" />
      </div>
      {open && q && (
        <div className="absolute left-0 top-full mt-2 w-80 rounded-2xl border border-slate-200 bg-white shadow-lg py-2 z-30 max-h-80 overflow-y-auto">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400">No matches for "{query}"</p>
          ) : results.map((item, i) => (
            <button key={`${item.href}-${item.label}`} type="button"
              onClick={() => go(item)} onMouseEnter={() => setActiveIndex(i)}
              className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left rounded-xl ${i === activeIndex ? 'bg-slate-50' : ''}`}>
              <span className="text-sm"><HighlightedLabel label={item.label} query={q} /></span>
              {i === activeIndex && (
                <kbd className="flex-shrink-0 text-[10px] border border-slate-300 rounded px-1.5 py-0.5 text-slate-400">↵</kbd>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TopBar({ onMenuClick, menuExpanded }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef(null);
  const notifRef = useRef(null);
  const [pending, setPending] = useState(null); // { leave, claims }

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('hr_portal_user');
      if (stored) setUser(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    const onClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setNotifOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  // Items waiting for HR. Refreshed on every page change, so the count drops as soon as they've
  // been worked through on Approvals and the user moves on.
  useEffect(() => {
    if (!user?.user_id) return;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
    Promise.all([
      axios.get(`${base}/api/v1/hr/leave-requests?requesterId=${user.user_id}`).catch(() => null),
      axios.get(`${base}/api/v1/claims/hr-pending`, { headers: authHeaders() }).catch(() => null),
    ]).then(([leaveRes, claimsRes]) => {
      const leave = (leaveRes?.data?.data || []).filter((r) => String(r.workflow_status).toUpperCase() === 'PENDING').length;
      setPending({ leave, claims: (claimsRes?.data?.data || []).length });
    });
  }, [user?.user_id, pathname]);

  const handleLogout = () => {
    endSession();
    sessionStorage.removeItem('hr_portal_user');
    router.push('/');
  };

  const displayName = user?.full_name || deriveNameFromEmail(user?.email) || 'HR';
  const totalPending = pending ? pending.leave + pending.claims : 0;
  const notifRows = [
    { label: 'Leave requests', count: pending?.leave || 0, href: '/admin?tab=leave' },
    { label: 'Expense claims', count: pending?.claims || 0, href: '/admin?tab=claims' },
  ];
  const initials = displayName.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || 'HR';

  return (
    <div className="sticky top-0 z-20 px-6 pt-4 pb-3 sm:px-8" style={{ background: '#F7F9FD' }}>
      <div className="flex items-center gap-3">
        {/* Menu: collapses/expands the rail on desktop, opens the drawer on small screens */}
        <button type="button" onClick={onMenuClick} aria-label="Toggle menu" aria-expanded={menuExpanded}
          className="flex-shrink-0 flex items-center justify-center rounded-full text-slate-500 transition hover:bg-white"
          style={{ width: 40, height: 40 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Search */}
        <div className="flex-1 min-w-0">
          <SearchBox />
        </div>

        {/* Right icons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <WhatsNewButton />
          {/* Notification bell */}
          <div className="relative" ref={notifRef}>
            <button type="button" onClick={() => setNotifOpen((v) => !v)}
              aria-label={totalPending > 0 ? `Notifications, ${totalPending} waiting for review` : 'Notifications'}
              className="relative flex items-center justify-center rounded-full text-slate-500 transition hover:bg-white"
              style={{ width: 40, height: 40 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {totalPending > 0 && (
                <span className="absolute top-1 right-1 flex min-w-[18px] h-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-[#F7F9FD]">
                  {totalPending > 99 ? '99+' : totalPending}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-lg p-2 z-30">
                <p className="px-3 pt-2 pb-1 text-sm font-semibold text-slate-900">Waiting for your review</p>
                {pending === null ? (
                  <p className="px-3 py-3 text-xs text-slate-400">Loading…</p>
                ) : totalPending === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-500">You&apos;re all caught up.</p>
                ) : notifRows.map((row) => (
                  <Link key={row.label} href={row.href} onClick={() => setNotifOpen(false)}
                    className="flex items-center justify-between rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                    {row.label}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${row.count > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-slate-100 text-slate-500'}`}>{row.count}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Calendar shortcut */}
          <Link href="/calendar" aria-label="Calendar"
            className="flex items-center justify-center rounded-full text-slate-500 transition hover:bg-white"
            style={{ width: 40, height: 40 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </Link>

          <div className="w-px h-6 bg-slate-200 mx-2" />

          {/* Avatar + name dropdown */}
          <div className="relative" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-full pl-1 pr-2 py-1 transition hover:bg-white">
              <div className="flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
                style={{ width: 36, height: 36, background: '#1a3a8f', boxShadow: '0 0 0 3px #f0c9dc' }}>
                {initials}
              </div>
              <span className="hidden sm:flex flex-col items-start leading-tight">
                <span className="text-sm font-semibold text-slate-800 truncate max-w-[140px]">{displayName}</span>
                <span className="text-xs text-slate-500">HR</span>
              </span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {menuOpen && (
              <div className="absolute right-0 mt-2 w-48 rounded-2xl border border-slate-200 bg-white shadow-lg py-2 z-30">
                <Link href="/profile" onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Profile</Link>
                <button type="button" onClick={handleLogout}
                  className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Log out</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
