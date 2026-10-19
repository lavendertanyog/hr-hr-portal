"use client";

import React, { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import UserRolesPage from '../users/page';
import LeavePicker from './LeavePicker';
import { useT } from '../i18n/LanguageProvider';

const TABS = [
  { key: 'roles', label: 'User roles' },
  { key: 'leave', label: 'Leave' },
];

function EmployeeContent() {
  const { t } = useT();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') === 'leave' ? 'leave' : 'roles');

  return (
    <div className="p-8">
      <div className="mb-4 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">{t("HR Portal")}</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">{t("Employee")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("Manage roles, leave days and project assignments for any Nextan employee.")}</p>
      </div>

      <div className="mb-6 flex gap-7 border-b border-slate-200 pl-3" role="tablist">
        {TABS.map((tabItem) => (
          <button key={tabItem.key} type="button" role="tab" aria-selected={tab === tabItem.key} onClick={() => setTab(tabItem.key)}
            className={`-mb-px border-b-2 pb-3 pt-2 text-sm font-semibold transition ${
              tab === tabItem.key ? 'border-[#1a3a8f] text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
            {t(tabItem.label)}
          </button>
        ))}
      </div>

      <div style={{ display: tab === 'roles' ? 'block' : 'none' }}>
        <UserRolesPage hideHeader />
      </div>
      {tab === 'leave' && <LeavePicker />}
    </div>
  );
}

export default function PeoplePage() {
  const { t } = useT();
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">{t("Loading…")}</div>}>
      <EmployeeContent />
    </Suspense>
  );
}
