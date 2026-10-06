"use client";

import React from 'react';

// One rounded field: a role dropdown on the left, the search box beside it. Shared by the
// User roles and Leave tabs so both filter the same way.
export default function FilterSearch({ role, onRole, roleOptions, search, onSearch, placeholder = 'Search name or email' }) {
  return (
    <div className="flex items-center rounded-full border border-slate-200 bg-white overflow-hidden w-full max-w-xl focus-within:ring-2 focus-within:ring-blue-400 transition">
      <div className="relative flex-shrink-0 border-r border-slate-200 bg-slate-50/70">
        <select value={role} onChange={(e) => onRole(e.target.value)} aria-label="Filter by role"
          className="appearance-none bg-transparent pl-5 pr-9 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none cursor-pointer">
          {roleOptions.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </select>
        <svg className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      <div className="relative flex-1 min-w-0">
        <svg className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input type="text" value={search} onChange={(e) => onSearch(e.target.value)} placeholder={placeholder}
          className="w-full bg-transparent pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none" />
      </div>
    </div>
  );
}
