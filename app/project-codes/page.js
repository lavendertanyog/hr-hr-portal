"use client";

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import axios from 'axios';
import ProjectCards from './ProjectCards';
import HierarchyPage from '../hierarchy/page';

const TABS = [
  { id: 'codes', label: 'Project Codes' },
  { id: 'hierarchy', label: 'Organisation Hierarchy' },
];

function ProjectsTabs() {
  // /project-codes?tab=hierarchy (used by the top-bar search) opens the hierarchy tab
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'hierarchy' ? 'hierarchy' : 'codes');
  const [sessionUser, setSessionUser] = useState(null);
  // Anyone can be assigned as a project's Account Manager or Manager, regardless of their own
  // role — so both fields in the Issue/Edit form list every active employee, not just users
  // already holding a manager/account_manager role.
  const [allUsers, setAllUsers] = useState([]);

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setSessionUser(u);
    } catch {}
  }, []);

  useEffect(() => {
    axios.get(`${backendBaseUrl}/api/v1/users`)
      .then((res) => setAllUsers(res.data.data || []))
      .catch(() => setAllUsers([]));
  }, [backendBaseUrl]);

  const onTabKeyDown = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
    setTab(next.id);
    document.getElementById(`projects-tab-${next.id}`)?.focus();
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-6 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">Projects</h1>
        <p className="mt-2 text-sm text-slate-500">Create and manage project codes, and see who reports to whom on each project.</p>
      </div>

      <div role="tablist" aria-label="Projects views" onKeyDown={onTabKeyDown}
        className="mb-6 flex flex-wrap gap-x-8 border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`projects-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls={`projects-panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => setTab(t.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-sm font-semibold transition ${
              tab === t.id ? 'border-[#1540A8] text-[#1540A8]' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-900'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Both tabs stay mounted so switching keeps each tab's filters and selection */}
      <div id="projects-panel-codes" role="tabpanel" aria-labelledby="projects-tab-codes" hidden={tab !== 'codes'}>
        <ProjectCards
          backendBaseUrl={backendBaseUrl}
          sessionUser={sessionUser}
          accountManagerOptions={allUsers}
          managerOptions={allUsers}
          requireAccountManager
        />
      </div>
      <div id="projects-panel-hierarchy" role="tabpanel" aria-labelledby="projects-tab-hierarchy" hidden={tab !== 'hierarchy'}>
        <HierarchyPage hideHeader />
      </div>
    </div>
  );
}

export default function ProjectCodesPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">Loading…</div>}>
      <ProjectsTabs />
    </Suspense>
  );
}
