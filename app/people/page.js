"use client";

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import UserRolesPage from '../users/page';
import HierarchyPage from '../hierarchy/page';

const TABS = [
  { key: 'roles', label: 'User roles' },
  { key: 'hierarchy', label: 'Org hierarchy' },
];

function PeopleContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'hierarchy' ? 'hierarchy' : 'roles');

  return (
    <div className="p-8">
      <div className="mb-6 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">People</h1>
        <p className="mt-2 text-sm text-slate-500">
          Manage roles and visualise reporting lines for any Nextan employee.
        </p>
      </div>

      <div className="mb-8 inline-flex rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
              tab === t.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ display: tab === 'roles' ? 'block' : 'none' }}>
        <UserRolesPage hideHeader />
      </div>
      <div style={{ display: tab === 'hierarchy' ? 'block' : 'none' }}>
        <HierarchyPage hideHeader />
      </div>
    </div>
  );
}

export default function PeoplePage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">Loading…</div>}>
      <PeopleContent />
    </Suspense>
  );
}
