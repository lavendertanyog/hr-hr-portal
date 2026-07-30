"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
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

function RoleBadge({ role }) {
  const def = ALL_ROLES.find((r) => r.key === role);
  const label = def ? def.label : String(role || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  const color = def ? def.color : 'bg-gray-100 text-gray-600';
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{label}</span>;
}

// Row action: primary "Manage Roles" button + a "···" menu for secondary actions
function RowActions({ user, onManageRoles, onLeaveDays, openMenuId, setOpenMenuId }) {
  const isOpen = openMenuId === user.user_id;
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onManageRoles(user)}
        className="rounded-xl border border-[#1a3a8f] px-4 py-2 text-xs font-semibold text-[#1a3a8f] hover:bg-[#e8edf8] transition">
        Manage Roles
      </button>
      <div className="relative">
        <button type="button" onClick={() => setOpenMenuId(isOpen ? null : user.user_id)}
          className="flex items-center justify-center rounded-xl border border-slate-200 w-8 h-8 text-slate-500 hover:bg-slate-100 transition">
          &#8230;
        </button>
        {isOpen && (
          <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
            <button type="button" onClick={() => { onLeaveDays(user); setOpenMenuId(null); }}
              className="block w-full px-4 py-2.5 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
              Leave Days
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function UserRolesPage() {
  const [requesterId, setRequesterId] = useState(null);
  const [requesterUser, setRequesterUser] = useState(null);
  const [logoMissing, setLogoMissing] = useState(false);

  // Data
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');

  const [viewMode, setViewMode] = useState('list'); // 'list' | 'grouped'
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const [openMenuId, setOpenMenuId] = useState(null);
  const menuRef = useRef(null);

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

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) { setRequesterId(u.user_id); setRequesterUser(u); }
    } catch {}
  }, []);

  useEffect(() => {
    const closeMenu = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuId(null);
    };
    document.addEventListener('mousedown', closeMenu);
    return () => document.removeEventListener('mousedown', closeMenu);
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

  // By-role grouping (search still applies within each group)
  const searchedUsers = allUsers.filter((u) => {
    const q = searchQuery.trim().toLowerCase();
    return !q || (u.full_name + ' ' + u.email).toLowerCase().includes(q);
  });
  const byRole = ALL_ROLES.map(({ key, label, color }) => ({
    key, label, color,
    users: searchedUsers.filter((u) => {
      const roles = Array.isArray(u.user_roles) && u.user_roles.length > 0 ? u.user_roles : [u.user_role];
      return roles.includes(key);
    }),
  })).filter((g) => roleFilter === 'ALL' || g.key === roleFilter);

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
      <div className="mb-7 flex items-start justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">User Role Management</h1>
          <p className="mt-2 text-sm text-slate-500">
            Assign and manage multiple roles for any Nextan employee. Changes take effect on their next login.
          </p>
        </div>
        <div className="hidden md:block">
          {!logoMissing ? (
            <Image src="/nextan-logo.png" alt="Nextan" width={110} height={34}
              className="object-contain opacity-80" onError={() => setLogoMissing(true)} />
          ) : (
            <span className="text-lg font-bold tracking-tight text-blue-900">nextan</span>
          )}
        </div>
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

      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        {/* Toolbar: search · role filter · view toggle */}
        <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
          <input type="text" value={searchQuery} onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            placeholder="Search users…"
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-60" />
          <select value={roleFilter} onChange={(e) => { setRoleFilter(e.target.value); setPage(1); }}
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400">
            <option value="ALL">Filter by Role</option>
            {ALL_ROLES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <div className="ml-auto flex gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1">
            <button type="button" onClick={() => setViewMode('list')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'list' ? 'bg-white shadow-sm text-[#1a3a8f]' : 'text-slate-500'}`}>
              List
            </button>
            <button type="button" onClick={() => setViewMode('grouped')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${viewMode === 'grouped' ? 'bg-white shadow-sm text-[#1a3a8f]' : 'text-slate-500'}`}>
              Grouped
            </button>
          </div>
        </div>

        {/* ─── List view ─── */}
        {viewMode === 'list' ? (
          <div ref={menuRef}>
            {loading ? (
              <p className="px-6 py-8 text-sm text-slate-400">Loading users…</p>
            ) : filtered.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-400">No users match this filter.</p>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Roles</th>
                    <th className="px-6 py-4">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageData.map((u) => {
                    const roles = Array.isArray(u.user_roles) && u.user_roles.length > 0
                      ? u.user_roles : [u.user_role].filter(Boolean);
                    return (
                      <tr key={u.user_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 font-semibold text-slate-900">{u.full_name}</td>
                        <td className="px-6 py-4 text-slate-600">{u.email}</td>
                        <td className="px-6 py-4">
                          <div className="flex flex-wrap gap-1">
                            {roles.map((r) => <RoleBadge key={r} role={r} />)}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <RowActions user={u} onManageRoles={openRoleModal} onLeaveDays={openLeaveModal}
                            openMenuId={openMenuId} setOpenMenuId={setOpenMenuId} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

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
        ) : (
          /* ─── Grouped view ─── */
          <div className="divide-y divide-gray-100" ref={menuRef}>
            {byRole.map(({ key, label, color, users: roleUsers }) => (
              <div key={key}>
                <div className="flex items-center gap-3 px-6 py-4 bg-gray-50">
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}>{label}</span>
                  <span className="text-sm text-slate-500">{roleUsers.length} {roleUsers.length === 1 ? 'user' : 'users'}</span>
                </div>
                {roleUsers.length === 0 ? (
                  <p className="px-6 py-4 text-sm text-slate-400">No users assigned to this role.</p>
                ) : (
                  <table className="min-w-full text-sm">
                    <thead className="border-b border-gray-100 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      <tr>
                        <th className="px-6 py-3">Name</th>
                        <th className="px-6 py-3">Email</th>
                        <th className="px-6 py-3">All Roles</th>
                        <th className="px-6 py-3">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {roleUsers.map((u) => {
                        const roles = Array.isArray(u.user_roles) && u.user_roles.length > 0
                          ? u.user_roles : [u.user_role].filter(Boolean);
                        return (
                          <tr key={u.user_id} className="hover:bg-gray-50">
                            <td className="px-6 py-3 font-semibold text-slate-900">{u.full_name}</td>
                            <td className="px-6 py-3 text-slate-600">{u.email}</td>
                            <td className="px-6 py-3">
                              <div className="flex flex-wrap gap-1">
                                {roles.map((r) => <RoleBadge key={r} role={r} />)}
                              </div>
                            </td>
                            <td className="px-6 py-3">
                              <RowActions user={u} onManageRoles={openRoleModal} onLeaveDays={openLeaveModal}
                                openMenuId={openMenuId} setOpenMenuId={setOpenMenuId} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Role Management Modal */}
      {roleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Manage Roles</h2>
                <p className="text-sm text-slate-500 mt-0.5">{roleModal.full_name}</p>
                <p className="text-xs text-slate-400">{roleModal.email}</p>
              </div>
              <button onClick={() => setRoleModal(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 text-xl leading-none">&times;</button>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Leave Entitlement</h2>
                <p className="text-sm text-slate-500 mt-0.5">{leaveModal.full_name}</p>
                <p className="text-xs text-slate-400">{leaveModal.email}</p>
              </div>
              <button onClick={() => setLeaveModal(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 text-xl leading-none">&times;</button>
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
    </div>
  );
}
