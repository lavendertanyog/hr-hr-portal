"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import Image from 'next/image';
import axios from 'axios';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

const ROLE_OPTIONS = [
  { key: 'account_manager', label: 'Account Manager' },
  { key: 'manager', label: 'Manager' },
  { key: 'staff', label: 'Staff' },
  { key: 'hr', label: 'HR' },
];

function initialsOf(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || '?';
}
function roleLabel(r) {
  return String(r || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function userRoles(u) {
  return Array.isArray(u.user_roles) && u.user_roles.length > 0 ? u.user_roles : [u.user_role].filter(Boolean);
}
// Which level of the org tree a user belongs to. Priority: AM > Manager > Staff.
// A user who is only HR (or has no recognised role) sits outside the tree entirely.
function primaryLevel(u) {
  const roles = userRoles(u).map((r) => String(r).toLowerCase());
  if (roles.includes('account_manager')) return 'account_manager';
  if (roles.includes('manager')) return 'manager';
  if (roles.includes('staff')) return 'staff';
  return null;
}

const LEVEL_COLOR = {
  account_manager: { border: '#7c3aed', text: '#6d28d9', bg: '#f5f3ff' },
  manager:         { border: '#1a3a8f', text: '#1d4ed8', bg: '#eff6ff' },
  staff:           { border: '#64748b', text: '#475569', bg: '#f8fafc' },
};

function RoleEditor({ user, requesterId, onSaved, onClose }) {
  const [selected, setSelected] = useState(userRoles(user).map((r) => String(r).toLowerCase()));
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const toggle = (key) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]));
  };

  const save = async () => {
    if (selected.length === 0) return;
    setSubmitting(true); setFeedback('');
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/update-user-roles`, { requesterId, userId: user.user_id, roles: selected });
      await onSaved?.();
      onClose();
    } catch (err) {
      setFeedback(err.response?.data?.error || 'Failed to update roles.');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="absolute z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">Roles</p>
      <div className="space-y-1.5 mb-3">
        {ROLE_OPTIONS.map((r) => (
          <label key={r.key} className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={selected.includes(r.key)} onChange={() => toggle(r.key)} className="rounded border-slate-300" />
            {r.label}
          </label>
        ))}
      </div>
      {feedback && <p className="text-[11px] text-red-500 mb-2">{feedback}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={submitting || selected.length === 0}
          className="flex-1 rounded-lg bg-[#1a3a8f] px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onClose}
          className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

function OrgNode({ user, level, requesterId, isRoot, supervisorOptions, onReassign, onRemove, onRolesSaved }) {
  const [moving, setMoving] = useState(false);
  const [editingRoles, setEditingRoles] = useState(false);
  const color = LEVEL_COLOR[level] || LEVEL_COLOR.staff;

  return (
    <div title={user.email}
      className="relative flex flex-col gap-1.5 rounded-xl border-2 bg-white px-3 py-2 shadow-sm"
      style={{ borderColor: color.border, background: color.bg, minWidth: 180, maxWidth: 220 }}>
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
          style={{ width: 32, height: 32, background: color.border }}>
          {initialsOf(user.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
          <p className="text-[11px] font-medium truncate" style={{ color: color.text }}>{roleLabel(level)}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={() => { setEditingRoles((v) => !v); setMoving(false); }} title="Edit roles"
            className="flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
          {!isRoot && (
            <button type="button" onClick={() => { setMoving((v) => !v); setEditingRoles(false); }} title="Reassign"
              className="flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {editingRoles && (
        <RoleEditor user={user} requesterId={requesterId} onSaved={onRolesSaved} onClose={() => setEditingRoles(false)} />
      )}
      {moving && !isRoot && (
        <div className="space-y-1.5">
          <select autoFocus defaultValue=""
            onChange={(e) => { if (e.target.value) { onReassign(user.user_id, e.target.value); setMoving(false); } }}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none">
            <option value="" disabled>Move under…</option>
            {supervisorOptions.filter((s) => s.user_id !== user.supervisor_id).map((s) => (
              <option key={s.user_id} value={s.user_id}>{s.full_name}</option>
            ))}
          </select>
          {user.supervisor_id && (
            <button type="button" onClick={() => { onRemove(user.user_id); setMoving(false); }}
              className="w-full rounded-lg border border-dashed border-red-300 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-50 transition">
              Remove from team
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function UnassignedNode({ user, level, supervisorOptions, onReassign }) {
  const [assigning, setAssigning] = useState(false);
  const color = LEVEL_COLOR[level] || LEVEL_COLOR.staff;
  return (
    <div title={user.email}
      className="flex flex-col gap-1.5 rounded-xl border-2 border-dashed bg-white px-3 py-2 shadow-sm"
      style={{ borderColor: '#f59e0b', background: '#fffbeb', minWidth: 180, maxWidth: 220 }}>
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
          style={{ width: 32, height: 32, background: '#f59e0b' }}>
          {initialsOf(user.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
          <p className="text-[11px] font-medium truncate text-amber-700">{roleLabel(level)}</p>
        </div>
      </div>
      {assigning ? (
        <select autoFocus defaultValue=""
          onChange={(e) => { if (e.target.value) { onReassign(user.user_id, e.target.value); setAssigning(false); } }}
          onBlur={() => setAssigning(false)}
          className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 focus:outline-none">
          <option value="" disabled>Assign to…</option>
          {supervisorOptions.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
        </select>
      ) : (
        <button type="button" onClick={() => setAssigning(true)}
          className="w-full rounded-lg border border-dashed border-amber-400 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition">
          + Assign
        </button>
      )}
    </div>
  );
}

function TreeRow({ children }) { return <div className="flex flex-wrap gap-4">{children}</div>; }

function HierarchyContent() {
  const [requesterId, setRequesterId] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logoMissing, setLogoMissing] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setRequesterId(u.user_id);
    } catch {}
  }, []);

  const fetchUsers = useCallback(async (rid) => {
    if (!rid) return;
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/v1/hr/active-users?requesterId=${rid}`);
      setAllUsers(res.data?.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (requesterId) fetchUsers(requesterId); }, [requesterId, fetchUsers]);

  const amList = useMemo(() => allUsers.filter((u) => primaryLevel(u) === 'account_manager'), [allUsers]);
  const managerList = useMemo(() => allUsers.filter((u) => primaryLevel(u) === 'manager'), [allUsers]);
  const staffList = useMemo(() => allUsers.filter((u) => primaryLevel(u) === 'staff'), [allUsers]);

  const amIds = useMemo(() => new Set(amList.map((u) => u.user_id)), [amList]);
  const managerIds = useMemo(() => new Set(managerList.map((u) => u.user_id)), [managerList]);

  const managersByAM = useMemo(() => {
    const map = new Map();
    amList.forEach((am) => map.set(am.user_id, []));
    managerList.forEach((m) => { if (amIds.has(m.supervisor_id)) map.get(m.supervisor_id).push(m); });
    return map;
  }, [amList, managerList, amIds]);
  const unassignedManagers = useMemo(() => managerList.filter((m) => !amIds.has(m.supervisor_id)), [managerList, amIds]);

  const staffByManager = useMemo(() => {
    const map = new Map();
    managerList.forEach((m) => map.set(m.user_id, []));
    staffList.forEach((s) => { if (managerIds.has(s.supervisor_id)) map.get(s.supervisor_id).push(s); });
    return map;
  }, [managerList, staffList, managerIds]);
  const unassignedStaff = useMemo(() => staffList.filter((s) => !managerIds.has(s.supervisor_id)), [staffList, managerIds]);

  const handleReassign = async (userId, supervisorId) => {
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/set-supervisor`, { requesterId, staffId: userId, supervisorId });
      await fetchUsers(requesterId);
    } catch (_) {}
  };
  const handleRemove = async (userId) => {
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/remove-supervisor`, { requesterId, staffId: userId });
      await fetchUsers(requesterId);
    } catch (_) {}
  };
  const refresh = () => fetchUsers(requesterId);

  return (
    <div className="p-8">
      <div className="mb-7 flex items-start justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Organisation Hierarchy</h1>
          <p className="mt-2 text-sm text-slate-500">
            Account Managers, Managers, and Staff reporting lines — click <span className="font-semibold">✓</span> to edit roles, <span className="font-semibold">✎</span> to reassign.
          </p>
        </div>
        <div className="hidden md:block">
          {!logoMissing
            ? <Image src="/nextan-logo.png" alt="Nextan" width={140} height={44} className="object-contain opacity-80" onError={() => setLogoMissing(true)} />
            : <span className="text-lg font-bold tracking-tight text-blue-900">nextan</span>}
        </div>
      </div>

      <div className="mb-7 grid grid-cols-3 gap-4">
        {[
          { label: 'Account Managers', value: amList.length, color: 'text-purple-700' },
          { label: 'Managers', value: managerList.length, color: 'text-blue-700' },
          { label: 'Staff', value: staffList.length, color: 'text-slate-700' },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-100 bg-white px-6 py-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{s.label}</p>
            <p className={`mt-3 text-4xl font-semibold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {loading ? <p className="text-sm text-slate-400 py-8">Loading…</p> : amList.length === 0 ? (
        <p className="text-sm text-slate-400 py-8">No Account Managers found.</p>
      ) : (
        <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-8 space-y-8">
          {amList.map((am) => {
            const managers = managersByAM.get(am.user_id) || [];
            return (
              <div key={am.user_id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
                <OrgNode user={am} level="account_manager" requesterId={requesterId} isRoot
                  supervisorOptions={[]} onReassign={handleReassign} onRemove={handleRemove} onRolesSaved={refresh} />
                {managers.length > 0 ? (
                  <div className="mt-4 pl-6 border-l-2 border-slate-200 space-y-4">
                    <TreeRow>
                      {managers.map((m) => (
                        <OrgNode key={m.user_id} user={m} level="manager" requesterId={requesterId}
                          supervisorOptions={amList} onReassign={handleReassign} onRemove={handleRemove} onRolesSaved={refresh} />
                      ))}
                    </TreeRow>
                    {managers.map((m) => {
                      const staff = staffByManager.get(m.user_id) || [];
                      if (staff.length === 0) return null;
                      return (
                        <div key={m.user_id} className="pl-6 border-l-2 border-slate-200">
                          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Reports to {m.full_name}</p>
                          <TreeRow>
                            {staff.map((s) => (
                              <OrgNode key={s.user_id} user={s} level="staff" requesterId={requesterId}
                                supervisorOptions={managerList} onReassign={handleReassign} onRemove={handleRemove} onRolesSaved={refresh} />
                            ))}
                          </TreeRow>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="mt-3 pl-6 text-xs text-slate-400 italic">No managers reporting to this Account Manager yet.</p>
                )}
              </div>
            );
          })}

          {(unassignedManagers.length > 0 || unassignedStaff.length > 0) && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-3">Unassigned</p>
              {unassignedManagers.length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">Managers without an Account Manager</p>
                  <TreeRow>
                    {unassignedManagers.map((m) => (
                      <UnassignedNode key={m.user_id} user={m} level="manager" supervisorOptions={amList} onReassign={handleReassign} />
                    ))}
                  </TreeRow>
                </div>
              )}
              {unassignedStaff.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">Staff without a Manager</p>
                  <TreeRow>
                    {unassignedStaff.map((s) => (
                      <UnassignedNode key={s.user_id} user={s} level="staff" supervisorOptions={managerList} onReassign={handleReassign} />
                    ))}
                  </TreeRow>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function HierarchyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">Loading hierarchy…</div>}>
      <HierarchyContent />
    </Suspense>
  );
}
