"use client";

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import FilterSearch from '../people/FilterSearch';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

const ALL_ROLES = [
  { key: 'hr',              label: 'HR',              color: 'bg-green-50 text-green-700'   },
  { key: 'account_manager', label: 'Account Manager', color: 'bg-purple-50 text-purple-700' },
  { key: 'manager',         label: 'Manager',          color: 'bg-blue-50 text-blue-700'     },
  { key: 'staff',           label: 'Staff',            color: 'bg-gray-100 text-gray-600'    },
];

// Role priority for primary label: hr > account_manager > manager > staff
const ROLE_PRIORITY = ['hr', 'account_manager', 'manager', 'staff'];

function roleLabel(role) {
  const def = ALL_ROLES.find((r) => r.key === role);
  return def ? def.label : String(role || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function RoleBadge({ role }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{roleLabel(role)}</span>;
}

const ROLE_ICON = { hr: 'shield', account_manager: 'briefcase', manager: 'users', staff: 'user' };

function RoleIcon({ name, size = 15 }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'shield': return <svg {...common}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /><path d="M9 12l2 2 4-4" /></svg>;
    case 'briefcase': return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></svg>;
    case 'users': return <svg {...common}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.8c2 .7 3.2 2.4 3.5 5.2" /></svg>;
    default: return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6" /></svg>;
  }
}

function primaryRoleOf(user) {
  const roles = Array.isArray(user.user_roles) && user.user_roles.length > 0 ? user.user_roles : [user.user_role].filter(Boolean);
  return { roles, primary: ROLE_PRIORITY.find((r) => roles.includes(r)) || roles[0] };
}

// One employee's card in the grid. One neutral style for everyone — the role is shown as text,
// not colour. Only fields the system actually tracks — no invented department/phone/photo — so
// "Joined" is the account's created_at.
function EmployeeCard({ user, isSelected, onSelect }) {
  const { roles, primary } = primaryRoleOf(user);
  const initials = (user.full_name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <div role="button" tabIndex={0} onClick={onSelect} title="View employee details"
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(); } }}
      className={`cursor-pointer rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
        isSelected ? 'border-[#1a3a8f] ring-2 ring-[#1a3a8f]/20' : 'border-slate-200 hover:border-slate-300'
      }`}>
      <div className="flex justify-end -mb-2">
        <span className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">Active</span>
      </div>

      <div className="flex flex-col items-center text-center">
        <span className="flex items-center justify-center w-16 h-16 rounded-full bg-[#e8edf8] text-[#1a3a8f] text-lg font-semibold">{initials}</span>
        <p className="mt-3 text-base font-semibold text-slate-900 leading-snug max-w-full truncate">{user.full_name}</p>
        <p className="flex items-center gap-1.5 text-sm text-slate-400 max-w-full">
          <RoleIcon name={ROLE_ICON[primary]} size={13} /><span className="truncate">{primary ? roleLabel(primary) : '—'}</span>
        </p>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] text-slate-400">Joined</p>
            <p className="text-xs font-semibold text-slate-700">{joined}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">Leave / yr</p>
            <p className="text-xs font-semibold text-slate-700">{user.leave_entitlement_days ?? 12} days</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-600 min-w-0 mt-3 pt-3 border-t border-slate-200/70">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 text-slate-400">
            <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" />
          </svg>
          <span className="truncate">{user.email}</span>
        </div>
      </div>

      {roles.length > 1 && (
        <div className="flex flex-wrap justify-center gap-1 mt-3">
          {roles.map((r) => <RoleBadge key={r} role={r} />)}
        </div>
      )}
    </div>
  );
}

const PROJECT_ROLE_OPTIONS = [
  { key: 'account_manager', label: 'Account Manager' },
  { key: 'manager', label: 'Manager' },
  { key: 'staff', label: 'Staff' },
  { key: 'hr', label: 'HR' },
];


function EditIconButton({ onClick, label }) {
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label}
      className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-[#1a3a8f] transition">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    </button>
  );
}

// Slide-in drawer for one employee, opened from a card. Previous / next step through the
// employees currently shown; the pencil and bin icons open the same edit and delete modals
// as before, so each kind of edit still has exactly one code path for saving.
function UserDetailPanel({ user, projectRoles, projectRolesLoading, onClose, onPrev, onNext, hasPrev, hasNext, onEditUser, onManageRoles, onLeaveDays, onProjectRoles, onDeleteUser }) {
  const [tab, setTab] = useState('details');
  const [balance, setBalance] = useState(null);
  const roles = Array.isArray(user.user_roles) && user.user_roles.length > 0
    ? user.user_roles : [user.user_role].filter(Boolean);
  const primaryRole = ROLE_PRIORITY.find((r) => roles.includes(r)) || roles[0];
  const initials = (user.full_name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const isHr = roles.includes('hr');
  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  useEffect(() => {
    const onKey = (e) => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev && !typing) onPrev();
      if (e.key === 'ArrowRight' && hasNext && !typing) onNext();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext, hasPrev, hasNext]);

  useEffect(() => {
    let cancelled = false;
    setBalance(null);
    axios.get(`${BACKEND}/api/v1/leave/balance/${user.user_id}`)
      .then((r) => { if (!cancelled) setBalance(r.data?.data || null); })
      .catch(() => { if (!cancelled) setBalance(null); });
    return () => { cancelled = true; };
  }, [user.user_id, user.leave_entitlement_days]);

  const total = balance?.totalDays ?? user.leave_entitlement_days ?? 12;
  const used = balance?.usedDays ?? 0;
  const left = balance?.remainingDays ?? Math.max(0, total - used);
  const usedPct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 100;

  const iconBtn = 'flex items-center justify-center w-9 h-9 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition disabled:opacity-30 disabled:hover:bg-transparent';

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/30" onClick={onClose} />
      <aside className="absolute right-0 top-0 h-full w-full max-w-xl bg-white shadow-2xl flex flex-col" role="dialog" aria-label={`${user.full_name} details`}>
        <button type="button" onClick={onClose} aria-label="Close details" title="Close"
          className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white border border-slate-200 shadow-md text-slate-500 hover:text-slate-900 transition">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <button type="button" onClick={onPrev} disabled={!hasPrev} aria-label="Previous employee" title="Previous employee" className={iconBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button type="button" onClick={onNext} disabled={!hasNext} aria-label="Next employee" title="Next employee" className={iconBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {!isHr && (
              <button type="button" onClick={() => onEditUser(user)} aria-label="Edit name and email" title="Edit name and email" className={iconBtn}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              </button>
            )}
            <button type="button" onClick={() => onDeleteUser(user)} aria-label="Delete employee" title="Delete employee"
              className={`${iconBtn} hover:!bg-red-50 hover:!text-red-600 hover:!border-red-200`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" /></svg>
            </button>
            <button type="button" onClick={onClose} aria-label="Close" title="Close" className={iconBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>

        <div className="bg-[#f3f6fc] px-6 py-5 flex items-center gap-4">
          <div className="flex-shrink-0 w-20 h-20 rounded-full bg-[#e8edf8] text-[#1a3a8f] flex items-center justify-center font-semibold text-2xl ring-4 ring-white">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-slate-900 truncate">{user.full_name}</p>
            <div className="flex flex-wrap items-center gap-2 mt-1">
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">Active</span>
              <span className="text-xs text-slate-500">{primaryRole ? roleLabel(primaryRole) : '—'}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
              <span className="truncate">{user.email}</span>
              <span>Joined {joined}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-6 px-6 border-b border-slate-100">
          {[{ key: 'details', label: 'Details' }, { key: 'leave', label: 'Leave' }].map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)}
              className={`py-3 text-xs font-semibold uppercase tracking-[0.18em] border-b-2 transition ${tab === t.key ? 'border-[#1a3a8f] text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 bg-slate-50/40">
          {tab === 'details' ? (
            <>
              <section className="rounded-2xl border border-slate-100 bg-white p-5">
                <p className="text-sm font-semibold text-slate-900 mb-4">Personal information</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                  {[['Full name', user.full_name], ['Email', user.email], ['Joined', joined], ['Status', 'Active']].map(([label, value]) => (
                    <div key={label} className="min-w-0">
                      <p className="text-[11px] text-slate-400 mb-0.5">{label}</p>
                      <p className="text-sm font-medium text-slate-800 break-words">{value}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-100 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-slate-900">Roles</p>
                  <EditIconButton label="Manage roles" onClick={() => onManageRoles(user)} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {roles.map((r) => <RoleBadge key={r} role={r} />)}
                </div>
              </section>

              <section className="rounded-2xl border border-slate-100 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-slate-900">Project assignments</p>
                  <EditIconButton label="Manage project assignments" onClick={() => onProjectRoles(user)} />
                </div>
                {projectRolesLoading ? (
                  <p className="text-sm text-slate-400">Loading…</p>
                ) : projectRoles.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">No project assignments.</p>
                ) : (
                  <div className="space-y-1.5">
                    {projectRoles.map((r) => (
                      <div key={r.project_code} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                        <span className="text-xs font-mono font-medium text-slate-700">{r.project_code}</span>
                        <RoleBadge role={r.project_role} />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          ) : (
            <section className="rounded-2xl border border-slate-100 bg-white p-5">
              <div className="flex items-center justify-between mb-4">
                <p className="text-sm font-semibold text-slate-900">Leave entitlement</p>
                <EditIconButton label="Edit leave entitlement" onClick={() => onLeaveDays(user)} />
              </div>
              <p className="text-3xl font-semibold text-slate-900">{total} <span className="text-sm font-normal text-slate-400">days per year</span></p>
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
                  <span>{used} used</span>
                  <span className={left === 0 ? 'text-red-600 font-semibold' : ''}>{left} left</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                  <div className={`h-full rounded-full ${left === 0 ? 'bg-red-400' : left <= 3 ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${usedPct}%` }} />
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-400">Used counts approved Annual and Emergency leave. Annual and Emergency share this balance; Sick leave has no cap.</p>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

export default function UserRolesPage({ hideHeader = false } = {}) {
  const [requesterId, setRequesterId] = useState(null);
  const [requesterUser, setRequesterUser] = useState(null);

  // Data
  const [allUsers, setAllUsers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [page, setPage] = useState(1);

  // Edit user modal (name/email)
  const [editModal, setEditModal] = useState(null);
  const [editFullName, setEditFullName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editFeedback, setEditFeedback] = useState('');

  // Role modal
  const [roleModal, setRoleModal] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [roleFeedback, setRoleFeedback] = useState('');

  // Leave entitlement modal
  const [leaveModal, setLeaveModal] = useState(null);
  const [leaveDays, setLeaveDays] = useState(12);
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveFeedback, setLeaveFeedback] = useState('');

  // Project roles modal (multi-row: project + role per row)
  const [projectRolesModal, setProjectRolesModal] = useState(null);
  const [projectRoleRows, setProjectRoleRows] = useState([]); // [{ projectCode, projectRole }]
  const [projectRolesLoading, setProjectRolesLoading] = useState(false);
  const [projectRolesSubmitting, setProjectRolesSubmitting] = useState(false);
  const [projectRolesFeedback, setProjectRolesFeedback] = useState('');

  // Delete user confirmation modal
  const [deleteModal, setDeleteModal] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState('');

  // Detail panel — opened by clicking a row (not its Actions menu). selectedUserId drives it
  // rather than the user object itself, so the panel always reflects fresh data from allUsers
  // after an edit instead of showing a stale snapshot from the moment the row was clicked.
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedUserProjectRoles, setSelectedUserProjectRoles] = useState([]);
  const [selectedUserProjectRolesLoading, setSelectedUserProjectRolesLoading] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) { setRequesterId(u.user_id); setRequesterUser(u); }
    } catch {}
  }, []);


  const fetchUsers = useCallback(async (rid) => {
    if (!rid) return;
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/v1/hr/active-users?requesterId=${rid}`);
      setAllUsers(res.data?.data || []);
    } catch (err) {
      setFeedback(err.response?.data?.error || 'Failed to load users.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (requesterId) fetchUsers(requesterId); }, [requesterId, fetchUsers]);

  const fetchSelectedUserProjectRoles = useCallback(async (userId) => {
    if (!userId || !requesterId) return;
    setSelectedUserProjectRolesLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/v1/hr/user-project-roles/${userId}?requesterId=${requesterId}`);
      setSelectedUserProjectRoles(res.data?.data || []);
    } catch {
      setSelectedUserProjectRoles([]);
    } finally { setSelectedUserProjectRolesLoading(false); }
  }, [requesterId]);

  useEffect(() => {
    if (selectedUserId) fetchSelectedUserProjectRoles(selectedUserId);
  }, [selectedUserId, fetchSelectedUserProjectRoles]);

  useEffect(() => {
    axios.get(`${BACKEND}/api/v1/projects`).then((r) => setProjects(r.data?.data || [])).catch(() => {});
  }, []);

  const openEditModal = (u) => {
    setEditModal(u);
    setEditFullName(u.full_name || '');
    setEditEmail(u.email || '');
    setEditFeedback('');
  };

  const submitEditUser = async () => {
    if (!editModal) return;
    setEditSubmitting(true); setEditFeedback('');
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/users/${editModal.user_id}`, {
        requesterId, fullName: editFullName, email: editEmail,
      });
      setEditFeedback('User updated successfully.');
      setTimeout(() => {
        setEditModal(null); setEditFeedback('');
        fetchUsers(requesterId);
      }, 1000);
    } catch (err) {
      setEditFeedback(err.response?.data?.error || 'Failed to update user.');
    } finally { setEditSubmitting(false); }
  };

  const openRoleModal = (u) => {
    const currentRoles = Array.isArray(u.user_roles) && u.user_roles.length > 0
      ? u.user_roles : [u.user_role].filter(Boolean);
    setRoleModal(u);
    setSelectedRoles(currentRoles);
    setRoleFeedback('');
  };

  const toggleRole = (key) => {
    setSelectedRoles((prev) =>
      prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]
    );
  };

  const submitRoles = async () => {
    if (!roleModal || selectedRoles.length === 0) return;
    setRoleSubmitting(true); setRoleFeedback('');
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/update-user-roles`, {
        requesterId,
        userId: roleModal.user_id,
        roles: selectedRoles,
      });
      setRoleFeedback('Roles updated successfully.');
      setTimeout(() => {
        setRoleModal(null); setRoleFeedback('');
        fetchUsers(requesterId);
      }, 1200);
    } catch (err) {
      setRoleFeedback(err.response?.data?.error || 'Failed to update roles.');
    } finally { setRoleSubmitting(false); }
  };

  const openLeaveModal = (u) => {
    setLeaveModal(u);
    setLeaveDays(u.leave_entitlement_days ?? 12);
    setLeaveFeedback('');
  };

  const submitLeaveDays = async () => {
    if (!leaveModal) return;
    setLeaveSubmitting(true); setLeaveFeedback('');
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/update-leave-entitlement`, {
        requesterId,
        userId: leaveModal.user_id,
        leaveEntitlementDays: Number(leaveDays),
      });
      setLeaveFeedback('Leave entitlement updated successfully.');
      setTimeout(() => {
        setLeaveModal(null); setLeaveFeedback('');
        fetchUsers(requesterId);
      }, 1200);
    } catch (err) {
      setLeaveFeedback(err.response?.data?.error || 'Failed to update leave entitlement.');
    } finally { setLeaveSubmitting(false); }
  };

  const openProjectRolesModal = async (u) => {
    setProjectRolesModal(u);
    setProjectRoleRows([]);
    setProjectRolesFeedback('');
    setProjectRolesLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/v1/hr/user-project-roles/${u.user_id}?requesterId=${requesterId}`);
      const rows = (res.data?.data || []).map((r) => ({ projectCode: r.project_code, projectRole: r.project_role }));
      setProjectRoleRows(rows.length > 0 ? rows : [{ projectCode: '', projectRole: 'staff' }]);
    } catch (err) {
      setProjectRolesFeedback(err.response?.data?.error || 'Failed to load current project roles.');
      setProjectRoleRows([{ projectCode: '', projectRole: 'staff' }]);
    } finally { setProjectRolesLoading(false); }
  };

  const updateProjectRoleRow = (index, field, value) => {
    setProjectRoleRows((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const removeProjectRoleRow = (index) => {
    setProjectRoleRows((prev) => prev.filter((_, i) => i !== index));
  };

  const addProjectRoleRow = () => {
    setProjectRoleRows((prev) => [...prev, { projectCode: '', projectRole: 'staff' }]);
  };

  const submitProjectRoles = async () => {
    if (!projectRolesModal) return;
    const assignments = projectRoleRows.filter((r) => r.projectCode && r.projectRole);
    setProjectRolesSubmitting(true); setProjectRolesFeedback('');
    try {
      await axios.post(`${BACKEND}/api/v1/hr/set-project-roles`, {
        requesterId,
        userId: projectRolesModal.user_id,
        assignments,
      });
      setProjectRolesFeedback('Project roles updated successfully.');
      setTimeout(() => {
        setProjectRolesModal(null); setProjectRolesFeedback('');
        fetchUsers(requesterId);
        if (selectedUserId === projectRolesModal.user_id) fetchSelectedUserProjectRoles(selectedUserId);
      }, 1000);
    } catch (err) {
      setProjectRolesFeedback(err.response?.data?.error || 'Failed to update project roles.');
    } finally { setProjectRolesSubmitting(false); }
  };

  const openDeleteModal = (u) => {
    setDeleteModal(u);
    setDeleteConfirmText('');
    setDeleteFeedback('');
  };

  const submitDeleteUser = async () => {
    if (!deleteModal || deleteConfirmText !== deleteModal.full_name) return;
    setDeleteSubmitting(true); setDeleteFeedback('');
    try {
      await axios.delete(`${BACKEND}/api/v1/hr/users/${deleteModal.user_id}`, { data: { requesterId } });
      setDeleteModal(null); setDeleteConfirmText('');
      if (selectedUserId === deleteModal.user_id) setSelectedUserId(null);
      fetchUsers(requesterId);
    } catch (err) {
      setDeleteFeedback(err.response?.data?.error || 'Failed to delete user.');
    } finally { setDeleteSubmitting(false); }
  };

  // Filtered list (search + role filter, used by both List and Grouped views)
  const filtered = allUsers.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    const matchQ = !q || (u.full_name + ' ' + u.email).toLowerCase().includes(q);
    const roles = Array.isArray(u.user_roles) && u.user_roles.length > 0 ? u.user_roles : [u.user_role];
    const matchRole = roleFilter === 'ALL' || roles.includes(roleFilter);
    return matchQ && matchRole;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const safePage = Math.min(page, totalPages);
  const pageData = filtered.slice((safePage - 1) * 10, safePage * 10);

  const displayName = requesterUser?.full_name || 'HR Admin';

  const roleCounts = ALL_ROLES.map(({ key, label, color }) => ({
    key, label, color,
    count: allUsers.filter((u) => {
      const roles = Array.isArray(u.user_roles) && u.user_roles.length > 0 ? u.user_roles : [u.user_role];
      return roles.includes(key);
    }).length,
  }));

  return (
    <div className={hideHeader ? '' : 'p-8'}>
      {/* Header */}
      {!hideHeader && (
        <div className="mb-10 pl-3">
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">User Role Management</h1>
          <p className="mt-2 text-sm text-slate-500">
            Assign and manage multiple roles for any Nextan employee. Changes take effect on their next login.
          </p>
        </div>
      )}

      {feedback && (
        <div className={`mb-5 rounded-2xl px-4 py-3 text-sm font-medium border ${
          feedback.toLowerCase().includes('fail') || feedback.toLowerCase().includes('error')
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-green-200 bg-green-50 text-green-700'
        }`}>{feedback}</div>
      )}

      <div className="flex flex-col lg:flex-row items-start gap-6">
        <div className="flex-1 min-w-0 w-full">
          {/* One rounded field: role dropdown + search, with the user count beside it */}
          <div className="flex flex-wrap items-center gap-4 mb-5">
            <FilterSearch
              role={roleFilter}
              onRole={(v) => { setRoleFilter(v); setPage(1); }}
              roleOptions={[{ key: 'ALL', label: `All roles (${allUsers.length})` }, ...roleCounts.map((r) => ({ key: r.key, label: `${r.label} (${r.count})` }))]}
              search={searchQuery}
              onSearch={(v) => { setSearchQuery(v); setPage(1); }}
            />
            <span className="text-sm text-slate-500">{filtered.length} {filtered.length === 1 ? 'user' : 'users'}</span>
          </div>

          {loading ? (
            <p className="py-8 text-sm text-slate-400">Loading users…</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-sm text-slate-400">No users match this filter.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
              {pageData.map((u) => (
                <EmployeeCard key={u.user_id} user={u} isSelected={selectedUserId === u.user_id}
                  onSelect={() => setSelectedUserId(u.user_id)} />
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-5 flex items-center justify-between">
              <span className="text-xs text-slate-500">Page {safePage} of {totalPages} · {filtered.length} users</span>
              <div className="flex gap-2">
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                  className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50">Prev</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                  className="rounded-full border border-slate-200 bg-white px-4 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-50">Next</button>
              </div>
            </div>
          )}
        </div>

        {(() => {
          const liveSelectedUser = allUsers.find((u) => u.user_id === selectedUserId);
          if (!liveSelectedUser) return null;
          const navIndex = filtered.findIndex((u) => u.user_id === selectedUserId);
          return (
            <UserDetailPanel
              key={selectedUserId}
              user={liveSelectedUser}
              projectRoles={selectedUserProjectRoles}
              projectRolesLoading={selectedUserProjectRolesLoading}
              hasPrev={navIndex > 0}
              hasNext={navIndex >= 0 && navIndex < filtered.length - 1}
              onPrev={() => { if (navIndex > 0) setSelectedUserId(filtered[navIndex - 1].user_id); }}
              onNext={() => { if (navIndex >= 0 && navIndex < filtered.length - 1) setSelectedUserId(filtered[navIndex + 1].user_id); }}
              onClose={() => setSelectedUserId(null)}
              onEditUser={openEditModal}
              onManageRoles={openRoleModal}
              onLeaveDays={openLeaveModal}
              onProjectRoles={openProjectRolesModal}
              onDeleteUser={openDeleteModal}
            />
          );
        })()}
      </div>

      {/* Role Management Modal */}
      {roleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setRoleModal(null); }}>
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Manage Roles</h2>
                <p className="text-sm text-slate-500 mt-0.5">{roleModal.full_name}</p>
                <p className="text-xs text-slate-400">{roleModal.email}</p>
              </div>
              <button onClick={() => setRoleModal(null)} aria-label="Close"
                className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 mb-4">
                Select all applicable roles. You must select at least one role.
              </p>
              <div className="space-y-2.5">
                {ALL_ROLES.map(({ key, label, color }) => {
                  const checked = selectedRoles.includes(key);
                  return (
                    <label key={key}
                      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition ${
                        checked ? 'border-[#1a3a8f] bg-[#e8edf8]' : 'border-slate-200 hover:bg-slate-50'
                      }`}>
                      <input type="checkbox" checked={checked} onChange={() => toggleRole(key)}
                        className="rounded border-slate-300" />
                      <span className={`text-sm font-semibold ${checked ? 'text-[#1a3a8f]' : 'text-slate-700'}`}>{label}</span>
                    </label>
                  );
                })}
              </div>
              {roleFeedback && (
                <p className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-medium ${
                  roleFeedback.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>{roleFeedback}</p>
              )}
            </div>
            <div className="flex gap-3 justify-end px-6 pb-6 pt-2">
              <button onClick={() => setRoleModal(null)}
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={submitRoles} disabled={roleSubmitting || selectedRoles.length === 0}
                className="rounded-2xl bg-[#1a3a8f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12307a] disabled:opacity-60 transition">
                {roleSubmitting ? 'Saving…' : 'Save Roles'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Entitlement Modal */}
      {leaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setLeaveModal(null); }}>
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Leave Entitlement</h2>
                <p className="text-sm text-slate-500 mt-0.5">{leaveModal.full_name}</p>
                <p className="text-xs text-slate-400">{leaveModal.email}</p>
              </div>
              <button onClick={() => setLeaveModal(null)} aria-label="Close"
                className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 mb-3">
                Annual + emergency leave days allowed for this employee per year.
              </p>
              <input type="number" min="0" step="1" value={leaveDays}
                onChange={(e) => setLeaveDays(e.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400" />
              {leaveFeedback && (
                <p className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-medium ${
                  leaveFeedback.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>{leaveFeedback}</p>
              )}
            </div>
            <div className="flex gap-3 justify-end px-6 pb-6 pt-2">
              <button onClick={() => setLeaveModal(null)}
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={submitLeaveDays} disabled={leaveSubmitting || leaveDays === '' || Number(leaveDays) < 0}
                className="rounded-2xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60 transition">
                {leaveSubmitting ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project Roles Modal — multi-row: project + role per row, saved all at once */}
      {projectRolesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setProjectRolesModal(null); }}>
          <div className="w-full max-w-2xl rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Manage Project Roles</h2>
                <p className="text-sm text-slate-500 mt-0.5">{projectRolesModal.full_name}</p>
                <p className="text-xs text-slate-400">{projectRolesModal.email}</p>
              </div>
              <button onClick={() => setProjectRolesModal(null)} aria-label="Close"
                className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5">
              {projectRolesLoading ? (
                <p className="text-sm text-slate-400 py-4">Loading current assignments…</p>
              ) : (
                <div className="space-y-3">
                  <div className="hidden sm:grid grid-cols-[1fr_1fr_auto] gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 px-1">
                    <span>Project</span>
                    <span>Role</span>
                    <span></span>
                  </div>
                  {projectRoleRows.map((row, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-center min-w-0">
                      <select value={row.projectCode} onChange={(e) => updateProjectRoleRow(i, 'projectCode', e.target.value)}
                        className="min-w-0 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <option value="">Select project…</option>
                        {projects.map((p) => <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>)}
                      </select>
                      <select value={row.projectRole} onChange={(e) => updateProjectRoleRow(i, 'projectRole', e.target.value)}
                        className="min-w-0 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {PROJECT_ROLE_OPTIONS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
                      </select>
                      <button type="button" onClick={() => removeProjectRoleRow(i)}
                        title="Remove this assignment"
                        className="flex-shrink-0 justify-self-start sm:justify-self-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-100">
                        &#128465;
                      </button>
                    </div>
                  ))}
                  <button type="button" onClick={addProjectRoleRow}
                    className="text-sm font-semibold text-[#1a3a8f] hover:underline">
                    + Add Another Project Assignment
                  </button>
                </div>
              )}
              {projectRolesFeedback && (
                <p className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-medium ${
                  projectRolesFeedback.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>{projectRolesFeedback}</p>
              )}
            </div>
            <div className="flex gap-3 justify-end px-6 pb-6 pt-2">
              <button onClick={() => setProjectRolesModal(null)}
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={submitProjectRoles} disabled={projectRolesSubmitting || projectRolesLoading}
                className="rounded-2xl bg-[#1a3a8f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12307a] disabled:opacity-60 transition">
                {projectRolesSubmitting ? 'Saving…' : 'Save All'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setEditModal(null); }}>
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Edit User</h2>
                <p className="text-xs text-slate-400">{editModal.email}</p>
              </div>
              <button onClick={() => setEditModal(null)} aria-label="Close"
                className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                <input value={editFullName} onChange={(e) => setEditFullName(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Email</label>
                <input value={editEmail} onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              {editFeedback && (
                <p className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
                  editFeedback.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>{editFeedback}</p>
              )}
            </div>
            <div className="flex gap-3 justify-end px-6 pb-6 pt-2">
              <button onClick={() => setEditModal(null)}
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={submitEditUser} disabled={editSubmitting}
                className="rounded-2xl bg-[#1a3a8f] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12307a] disabled:opacity-60 transition">
                {editSubmitting ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteModal(null); }}>
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100">
              <h2 className="text-lg font-semibold text-red-600">Delete User</h2>
              <p className="text-sm text-slate-500 mt-0.5">{deleteModal.full_name}</p>
              <p className="text-xs text-slate-400">{deleteModal.email}</p>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-slate-600">
                This permanently deletes this user's account and all of their attendance, leave,
                and project-assignment records. This action can't be undone.
              </p>
              <label className="block text-sm font-semibold text-slate-700 mt-5 mb-2">
                Type <span className="font-bold">{deleteModal.full_name}</span> to confirm
              </label>
              <input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={deleteModal.full_name}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              {deleteFeedback && (
                <p className="mt-4 rounded-xl px-4 py-2.5 text-sm font-medium bg-red-50 text-red-700">{deleteFeedback}</p>
              )}
            </div>
            <div className="flex gap-3 justify-end px-6 pb-6 pt-2">
              <button onClick={() => setDeleteModal(null)}
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={submitDeleteUser} disabled={deleteSubmitting || deleteConfirmText !== deleteModal.full_name}
                className="rounded-2xl bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40 transition">
                {deleteSubmitting ? 'Deleting…' : 'Delete User'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
