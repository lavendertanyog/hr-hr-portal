"use client";

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import FilterSearch from './FilterSearch';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

const ROLE_FILTERS = [
  { key: 'ALL', label: 'All roles' },
  { key: 'hr', label: 'HR' },
  { key: 'account_manager', label: 'Account Manager' },
  { key: 'manager', label: 'Manager' },
  { key: 'staff', label: 'Staff' },
];
const ROLE_PRIORITY = ['hr', 'account_manager', 'manager', 'staff'];

function rolesOf(u) {
  return Array.isArray(u.user_roles) && u.user_roles.length > 0 ? u.user_roles : [u.user_role].filter(Boolean);
}
function primaryRoleLabel(u) {
  const key = ROLE_PRIORITY.find((r) => rolesOf(u).includes(r)) || rolesOf(u)[0];
  return ROLE_FILTERS.find((r) => r.key === key)?.label || '—';
}

// One list, one number per person: type the days and press Enter (or click away) and it saves.
export default function LeaveDays() {
  const [requesterId, setRequesterId] = useState('');
  const [users, setUsers] = useState([]);
  const [usedByUser, setUsedByUser] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState({}); // userId -> 'saving' | 'saved' | error text
  const [bulkDays, setBulkDays] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState('');

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setRequesterId(u.user_id);
    } catch {}
  }, []);

  const load = useCallback(async (rid) => {
    if (!rid) return;
    setLoading(true); setError('');
    try {
      const [usersRes, usageRes] = await Promise.all([
        axios.get(`${BACKEND}/api/v1/hr/active-users?requesterId=${rid}`),
        axios.get(`${BACKEND}/api/v1/hr/leave-balances?requesterId=${rid}`),
      ]);
      setUsers(usersRes.data?.data || []);
      const map = {};
      (usageRes.data?.data || []).forEach((r) => { map[r.user_id] = Number(r.used_days) || 0; });
      setUsedByUser(map);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load employees.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (requesterId) load(requesterId); }, [requesterId, load]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => (roleFilter === 'ALL' ? true : rolesOf(u).includes(roleFilter)))
      .filter((u) => !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [users, search, roleFilter]);

  const currentDays = (u) => u.leave_entitlement_days ?? 12;

  const saveRow = async (u) => {
    const draft = drafts[u.user_id];
    if (draft === undefined) return;
    const clearDraft = () => setDrafts((d) => { const n = { ...d }; delete n[u.user_id]; return n; });
    if (draft === '' || Number(draft) === currentDays(u)) { clearDraft(); return; }
    const days = Number(draft);
    if (!Number.isInteger(days) || days < 0) {
      setStatus((s) => ({ ...s, [u.user_id]: 'Enter a whole number, 0 or more.' }));
      return;
    }
    setStatus((s) => ({ ...s, [u.user_id]: 'saving' }));
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/update-leave-entitlement`, { requesterId, userId: u.user_id, leaveEntitlementDays: days });
      setUsers((prev) => prev.map((x) => (x.user_id === u.user_id ? { ...x, leave_entitlement_days: days } : x)));
      clearDraft();
      setStatus((s) => ({ ...s, [u.user_id]: 'saved' }));
      setTimeout(() => setStatus((s) => (s[u.user_id] === 'saved' ? { ...s, [u.user_id]: undefined } : s)), 2000);
    } catch (err) {
      setStatus((s) => ({ ...s, [u.user_id]: err.response?.data?.error || 'Could not save.' }));
    }
  };

  const applyToShown = async () => {
    const days = Number(bulkDays);
    if (bulkDays === '' || !Number.isInteger(days) || days < 0) { setBulkMsg('Enter a whole number, 0 or more.'); return; }
    if (rows.length === 0) { setBulkMsg('No employees shown.'); return; }
    if (!window.confirm(`Set ${rows.length} employee${rows.length === 1 ? '' : 's'} to ${days} days per year?`)) return;
    setBulkBusy(true); setBulkMsg('');
    try {
      const res = await axios.patch(`${BACKEND}/api/v1/hr/update-leave-entitlement-bulk`, {
        requesterId, userIds: rows.map((u) => u.user_id), leaveEntitlementDays: days,
      });
      const ids = new Set(rows.map((u) => u.user_id));
      setUsers((prev) => prev.map((x) => (ids.has(x.user_id) ? { ...x, leave_entitlement_days: days } : x)));
      setDrafts({});
      setBulkDays('');
      setBulkMsg(`Updated ${res.data?.updated ?? rows.length} employee(s) to ${days} days.`);
    } catch (err) {
      setBulkMsg(err.response?.data?.error || 'Failed to update leave days.');
    } finally { setBulkBusy(false); }
  };

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 px-4 py-3 border-b border-gray-100">
        <FilterSearch role={roleFilter} onRole={setRoleFilter} roleOptions={ROLE_FILTERS}
          search={search} onSearch={setSearch} placeholder="Search name or email" />
        <span className="text-sm text-slate-500">{rows.length} {rows.length === 1 ? 'user' : 'users'}</span>
        <div className="ml-auto flex items-center gap-2 text-sm text-slate-500">
          <span>Set everyone shown to</span>
          <input type="number" min="0" step="1" value={bulkDays} onChange={(e) => { setBulkDays(e.target.value); setBulkMsg(''); }} placeholder="days"
            onKeyDown={(e) => { if (e.key === 'Enter') applyToShown(); }}
            className="w-20 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400" />
          <button type="button" onClick={applyToShown} disabled={bulkBusy || bulkDays === ''}
            className="rounded-xl bg-[#1a3a8f] px-4 py-1.5 text-sm font-semibold text-white hover:bg-[#12307a] disabled:opacity-50 transition">
            {bulkBusy ? 'Saving…' : 'Apply'}
          </button>
        </div>
      </div>
      {bulkMsg && (
        <p className={`px-4 py-2 text-sm font-medium border-b border-gray-100 ${bulkMsg.startsWith('Updated') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{bulkMsg}</p>
      )}

      {loading ? (
        <p className="px-6 py-8 text-sm text-slate-400">Loading employees…</p>
      ) : error ? (
        <p className="px-6 py-8 text-sm text-red-600">{error}</p>
      ) : rows.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-400">No employees match this filter.</p>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            <tr>
              <th className="px-6 py-3">Employee</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Days per year</th>
              <th className="px-4 py-3">Used</th>
              <th className="px-4 py-3">Left</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const days = currentDays(u);
              const used = usedByUser[u.user_id] ?? 0;
              const left = Math.max(0, days - used);
              const st = status[u.user_id];
              const draft = drafts[u.user_id];
              return (
                <tr key={u.user_id} className="border-b border-gray-50 last:border-0">
                  <td className="px-6 py-3">
                    <p className="font-medium text-slate-900">{u.full_name}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{primaryRoleLabel(u)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input type="number" min="0" step="1" aria-label={`Days per year for ${u.full_name}`}
                        value={draft !== undefined ? draft : days}
                        onChange={(e) => { setDrafts((d) => ({ ...d, [u.user_id]: e.target.value })); setStatus((s) => ({ ...s, [u.user_id]: undefined })); }}
                        onBlur={() => saveRow(u)}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDrafts((d) => { const n = { ...d }; delete n[u.user_id]; return n; }); e.currentTarget.blur(); } }}
                        className={`w-20 rounded-xl border px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                          st && st !== 'saving' && st !== 'saved' ? 'border-red-300 bg-red-50' : st === 'saved' ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`} />
                      {st === 'saving' && <span className="text-xs text-slate-400">Saving…</span>}
                      {st === 'saved' && <span className="text-xs font-semibold text-green-600">Saved</span>}
                      {st && st !== 'saving' && st !== 'saved' && <span className="text-xs text-red-600">{st}</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{used}</td>
                  <td className={`px-4 py-3 font-medium ${left === 0 ? 'text-red-600' : 'text-slate-700'}`}>{left}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="px-6 py-3 text-xs text-slate-400 border-t border-gray-100">
        Type the days and press Enter or click away to save. Used counts approved Annual and Emergency leave.
      </p>
    </div>
  );
}
