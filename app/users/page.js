"use client";

import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

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
  const def = ALL_ROLES.find((r) => r.key === role);
  const color = def ? def.color : 'bg-gray-100 text-gray-600';
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{roleLabel(role)}</span>;
}

// One employee's card in the grid. Only fields the system actually tracks — no invented
// department/phone/photo — so "Joined" is the account's created_at, not a claimed hire date.
function EmployeeCard({ user, isSelected, onSelect }) {
  const roles = Array.isArray(user.user_roles) && user.user_roles.length > 0
    ? user.user_roles : [user.user_role].filter(Boolean);
  const primaryRole = ROLE_PRIORITY.find((r) => roles.includes(r)) || roles[0];
  const initials = (user.full_name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  return (
    <button type="button" onClick={onSelect} title="View employee details"
      className={`text-left rounded-2xl border bg-white p-5 shadow-sm transition hover:shadow-md ${
        isSelected ? 'border-[#1a3a8f] ring-2 ring-[#1a3a8f]/20' : 'border-gray-100 hover:border-slate-300'
      }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="w-12 h-12 rounded-full bg-[#e8edf8] text-[#1a3a8f] flex items-center justify-center font-semibold flex-shrink-0">
          {initials}
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          className="text-slate-300">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </div>
      <p className="font-semibold text-slate-900 truncate">{user.full_name}</p>
      <p className="text-xs text-slate-400 mb-4">{primaryRole ? roleLabel(primaryRole) : '—'}</p>

      <div className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b border-slate-100">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Joined</p>
          <p className="text-sm font-medium text-slate-700">{joined}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Leave / yr</p>
          <p className="text-sm font-medium text-slate-700">{user.leave_entitlement_days ?? 12} days</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
          <rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 6-10 7L2 6" />
        </svg>
        <span className="truncate">{user.email}</span>
      </div>

      {roles.length > 1 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {roles.map((r) => <RoleBadge key={r} role={r} />)}
        </div>
      )}
    </button>
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

// Side panel — shows an at-a-glance summary of one employee's roles, leave entitlement,
// and project assignments next to the table, with a pencil icon per section that opens the
// same edit modals the row-level "Actions" menu already uses, so there's exactly one code
// path for actually saving each kind of edit.
function UserDetailPanel({ user, projectRoles, projectRolesLoading, onClose, onEditUser, onManageRoles, onLeaveDays, onProjectRoles, onDeleteUser }) {
  const roles = Array.isArray(user.user_roles) && user.user_roles.length > 0
    ? user.user_roles : [user.user_role].filter(Boolean);
  const initials = (user.full_name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  const isHr = roles.includes('hr');

  return (
    <div className="w-full lg:w-96 flex-shrink-0 rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex-shrink-0 w-11 h-11 rounded-full bg-[#e8edf8] text-[#1a3a8f] flex items-center justify-center font-semibold text-sm">
            {initials}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 truncate">{user.full_name}</p>
            <p className="text-xs text-slate-400 truncate">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isHr && <EditIconButton label="Edit name / email" onClick={() => onEditUser(user)} />}
          <button onClick={onClose} aria-label="Close panel"
            className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-6 py-5 space-y-6">
        {/* Roles */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Roles</p>
            <EditIconButton label="Manage roles" onClick={() => onManageRoles(user)} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {roles.map((r) => <RoleBadge key={r} role={r} />)}
          </div>
        </div>

        {/* Leave entitlement */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Leave entitlement</p>
            <EditIconButton label="Edit leave entitlement" onClick={() => onLeaveDays(user)} />
          </div>
          <p className="text-2xl font-semibold text-slate-900">{user.leave_entitlement_days ?? 12} <span className="text-sm font-normal text-slate-400">days / year</span></p>
        </div>

        {/* Project assignments */}
        <div>
          <div className="flex items-center justify-between mb-2.5">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">Project assignments</p>
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
        </div>
      </div>

      <div className="px-6 pb-6 pt-2 border-t border-slate-100">
        <button onClick={() => onDeleteUser(user)}
          className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-100 hover:border-red-300 transition">
          Delete User
        </button>
      </div>
    </div>
  );
}

export default function UserRolesPage() {
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
    <div className="p-8">
      {/* Header */}
      <div className="mb-7">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">User Role Management</h1>
        <p className="mt-2 text-sm text-slate-500">
          Assign and manage multiple roles for any Nextan employee. Changes take effect on their next login.
        </p>
      </div>

      {/* Stat cards — click to filter the table below; "All Users" resets the filter */}
      <div className="mb-7 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <button type="button" onClick={() => { setRoleFilter('ALL'); setPage(1); }}
          className={`text-left rounded-2xl border bg-white px-6 py-5 shadow-sm transition ${
            roleFilter === 'ALL' ? 'border-[#1a3a8f] ring-2 ring-[#1a3a8f]/30' : 'border-gray-100 hover:border-slate-300'
          }`}>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">All Users</p>
          <p className="mt-3 text-4xl font-semibold text-slate-900">{allUsers.length}</p>
        </button>
        {roleCounts.map(({ key, label, count }) => (
          <button key={key} type="button" onClick={() => { setRoleFilter(key); setPage(1); }}
            className={`text-left rounded-2xl border bg-white px-6 py-5 shadow-sm transition ${
              roleFilter === key ? 'border-[#1a3a8f] ring-2 ring-[#1a3a8f]/30' : 'border-gray-100 hover:border-slate-300'
            }`}>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{label}</p>
            <p className="mt-3 text-4xl font-semibold text-slate-900">{count}</p>
          </button>
        ))}
      </div>

      {feedback && (
        <div className={`mb-5 rounded-2xl px-4 py-3 text-sm font-medium border ${
          feedback.toLowerCase().includes('fail') || feedback.toLowerCase().includes('error')
            ? 'border-red-200 bg-red-50 text-red-700'
            : 'border-green-200 bg-green-50 text-green-700'
        }`}>{feedback}</div>
      )}

      <div className="flex items-start gap-6">
      <div className={`rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden transition-all ${selectedUserId ? 'flex-1 min-w-0' : 'w-full'}`}>
        {/* Toolbar: search · role filter · view toggle */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="Search users…"
              className="rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-60" />
          </div>
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="ALL">Filter by Role</option>
            {ALL_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        <div className="p-4">
          {loading ? (
            <p className="px-2 py-8 text-sm text-slate-400">Loading users…</p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-8 text-sm text-slate-400">No users match this filter.</p>
          ) : (
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${selectedUserId ? '' : 'xl:grid-cols-3'}`}>
              {pageData.map((u) => (
                <EmployeeCard key={u.user_id} user={u} isSelected={selectedUserId === u.user_id}
                  onSelect={() => setSelectedUserId(u.user_id)} />
              ))}
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-3 bg-slate-50 flex items-center justify-between border-t border-gray-100">
            <span className="text-xs text-slate-500">Page {safePage} of {totalPages} · {filtered.length} users</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">Prev</button>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">Next</button>
            </div>
          </div>
        )}
      </div>

      {selectedUserId && (() => {
        const liveSelectedUser = allUsers.find((u) => u.user_id === selectedUserId);
        if (!liveSelectedUser) return null;
        return (
          <UserDetailPanel
            user={liveSelectedUser}
            projectRoles={selectedUserProjectRoles}
            projectRolesLoading={selectedUserProjectRolesLoading}
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
