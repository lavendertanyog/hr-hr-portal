"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import axios from 'axios';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function RoleBadge({ role }) {
  const colors = { manager: 'bg-blue-50 text-blue-700', account_manager: 'bg-purple-50 text-purple-700', hr: 'bg-green-50 text-green-700', staff: 'bg-gray-100 text-gray-600' };
  const label = String(role || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${colors[role] || 'bg-gray-100 text-gray-600'}`}>{label}</span>;
}

function StatusBadge({ status }) {
  const colors = { pending: 'bg-yellow-50 text-yellow-700', active: 'bg-green-50 text-green-700', rejected: 'bg-red-50 text-red-600', approved: 'bg-green-50 text-green-700' };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${colors[status] || 'bg-gray-100 text-gray-600'}`}>{status}</span>;
}

export default function AdminPage() {
  const [adminId, setAdminId] = useState(null);
  const [isAdmin, setIsAdmin] = useState(null); // null = loading
  const [tab, setTab] = useState('accounts'); // 'accounts' | 'resets' | 'history'
  const [historySubFilter, setHistorySubFilter] = useState('Pending Accounts'); // 'Pending Accounts' | 'Reset History'
  const [historySearch, setHistorySearch] = useState('');
  const [pendingAccounts, setPendingAccounts] = useState([]);
  const [pendingResets, setPendingResets] = useState([]);
  const [historyAccounts, setHistoryAccounts] = useState([]);
  const [historyResets, setHistoryResets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState('');
  const [logoMissing, setLogoMissing] = useState(false);
  const [user, setUser] = useState(null);
  // Pagination
  const [accountsPage, setAccountsPage] = useState(1);
  const [resetsPage, setResetsPage] = useState(1);
  const [histAccPage, setHistAccPage] = useState(1);
  const [histResPage, setHistResPage] = useState(1);

  // Role management modal
  const [roleModal, setRoleModal] = useState(null); // { user_id, full_name, email, user_role, user_roles }
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [roleSubmitting, setRoleSubmitting] = useState(false);
  const [roleFeedback, setRoleFeedback] = useState('');

  const ALL_ROLES = [
    { key: 'hr', label: 'HR' },
    { key: 'account_manager', label: 'Account Manager' },
    { key: 'manager', label: 'Manager' },
    { key: 'staff', label: 'Staff' },
  ];

  const openRoleModal = (u) => {
    const currentRoles = Array.isArray(u.user_roles) && u.user_roles.length > 0
      ? u.user_roles
      : [u.user_role].filter(Boolean);
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
        requesterId: adminId,
        userId: roleModal.user_id,
        roles: selectedRoles,
      });
      setRoleFeedback('Roles updated successfully.');
      setTimeout(() => { setRoleModal(null); setRoleFeedback(''); fetchAll(adminId); }, 1200);
    } catch (err) {
      setRoleFeedback(err.response?.data?.error || 'Failed to update roles.');
    } finally { setRoleSubmitting(false); }
  };

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) { setAdminId(u.user_id); setUser(u); }
    } catch {}
  }, []);

  const fetchAll = useCallback(async (aid) => {
    if (!aid) return;
    setLoading(true);
    try {
      const [accsRes, resetsRes, histAccRes, histResRes] = await Promise.all([
        // HR-scoped: only fetches pending Manager & Account Manager registrations
        axios.get(`${BACKEND}/api/v1/hr/pending-registrations?requesterId=${aid}`).catch((e) => e.response || null),
        axios.get(`${BACKEND}/api/v1/admin/pending-resets?adminId=${aid}`).catch(() => null),
        axios.get(`${BACKEND}/api/v1/admin/account-history?adminId=${aid}`).catch(() => null),
        axios.get(`${BACKEND}/api/v1/admin/reset-history?adminId=${aid}`).catch(() => null),
      ]);
      if (accsRes?.data?.success) { setPendingAccounts(accsRes.data.data || []); setIsAdmin(true); }
      else if (accsRes?.status === 403 || accsRes?.data?.status === 403) { setIsAdmin(false); }
      else { setIsAdmin(true); }
      if (resetsRes?.data?.success) setPendingResets(resetsRes.data.data || []);
      if (histAccRes?.data?.success) setHistoryAccounts(histAccRes.data.data || []);
      if (histResRes?.data?.success) setHistoryResets(histResRes.data.data || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { if (adminId) fetchAll(adminId); }, [adminId, fetchAll]);

  const handleAccount = async (userId, action) => {
    setFeedback('');
    try {
      // HR can only approve/reject Manager and Account Manager registrations
      await axios.patch(`${BACKEND}/api/v1/hr/approve-registration`, { requesterId: adminId, userId, action });
      setFeedback(`Account ${action === 'approve' ? 'approved' : 'rejected'}.`);
      fetchAll(adminId);
    } catch (err) { setFeedback(err.response?.data?.error || 'Action failed.'); }
  };

  const handleReset = async (requestId, action) => {
    setFeedback('');
    try {
      await axios.patch(`${BACKEND}/api/v1/admin/approve-reset`, { adminId, requestId, action });
      setFeedback(`Password reset ${action === 'approve' ? 'approved' : 'rejected'}.`);
      fetchAll(adminId);
    } catch (err) { setFeedback(err.response?.data?.error || 'Action failed.'); }
  };

  const displayName = user?.full_name || (user?.email ? user.email.split('@')[0].split('.').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') : 'HR Admin');

  const TABS = [
    { key: 'accounts', label: `Pending Accounts (${pendingAccounts.length})` },
    { key: 'resets', label: `Password Resets (${pendingResets.length})` },
    { key: 'history', label: 'History' },
  ];

  if (isAdmin === null) return <div className="p-8 text-slate-500">Loading...</div>;

  if (isAdmin === false) {
    return (
      <div className="p-8">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-700">Access Denied</h2>
          <p className="text-sm text-red-600 mt-1">Only Rebecca Lau or hr.admin@nextan.com.sg can access this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-7 flex items-start justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Welcome back, {displayName}</h1>
          <p className="mt-2 text-sm text-slate-500">Approve accounts and password resets, or review past decisions.</p>
        </div>
        <div className="hidden md:block">
          {!logoMissing ? (
            <Image src="/nextan-logo.png" alt="Nextan" width={110} height={34} className="object-contain opacity-80" onError={() => setLogoMissing(true)} />
          ) : (
            <span className="text-lg font-bold tracking-tight text-blue-900">nextan</span>
          )}
        </div>
      </div>

      {/* Stat cards — Pending Accounts / Password Resets act as filters into the tabs below */}
      <div className="mb-7 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <button type="button" onClick={() => setTab('accounts')}
          className={`text-left rounded-2xl border bg-white px-6 py-5 shadow-sm transition ${
            tab === 'accounts' ? 'border-[#1a3a8f] ring-2 ring-[#1a3a8f]/30' : 'border-gray-100 hover:border-slate-300'
          }`}>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Pending Accounts</p>
          <p className="mt-3 text-4xl font-semibold text-slate-900">{pendingAccounts.length}</p>
        </button>
        <button type="button" onClick={() => setTab('resets')}
          className={`text-left rounded-2xl border bg-white px-6 py-5 shadow-sm transition ${
            tab === 'resets' ? 'border-[#1a3a8f] ring-2 ring-[#1a3a8f]/30' : 'border-gray-100 hover:border-slate-300'
          }`}>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Password Resets</p>
          <p className="mt-3 text-4xl font-semibold text-slate-900">{pendingResets.length}</p>
        </button>
        <div className="rounded-2xl border border-gray-100 bg-white px-6 py-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Approved Accounts</p>
          <p className="mt-3 text-4xl font-semibold text-slate-900">{historyAccounts.filter((a) => a.account_status === 'active').length}</p>
        </div>
      </div>

      {feedback && (
        <div className={`mb-5 rounded-2xl px-4 py-3 text-sm font-medium border ${feedback.toLowerCase().includes('fail') || feedback.toLowerCase().includes('denied') ? 'border-red-200 bg-red-50 text-red-700' : 'border-green-200 bg-green-50 text-green-700'}`}>
          {feedback}
        </div>
      )}

      {/* Tabs */}
      <div className="rounded-2xl border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="flex gap-1 border-b border-gray-100 px-4 pt-4">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${tab === t.key ? 'bg-[#e8edf8] text-[#1a3a8f]' : 'text-slate-500 hover:text-slate-700'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-400">Loading...</p>
        ) : tab === 'accounts' ? (
          pendingAccounts.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-400 text-center">No pending account registrations.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="px-6 py-4">Name</th><th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Role</th><th className="px-6 py-4">Requested</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(() => {
                  const totalPages = Math.max(1, Math.ceil(pendingAccounts.length / 10));
                  const safePage = Math.min(accountsPage, totalPages);
                  const page = pendingAccounts.slice((safePage - 1) * 10, safePage * 10);
                  return (
                    <>
                      {page.map((u) => (
                        <tr key={u.user_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-semibold text-slate-900">{u.full_name}</td>
                          <td className="px-6 py-4 text-slate-600">{u.email}</td>
                          <td className="px-6 py-4"><RoleBadge role={u.user_role} /></td>
                          <td className="px-6 py-4 text-xs text-slate-400">{new Date(u.created_at).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <button onClick={() => handleAccount(u.user_id, 'approve')}
                                className="rounded-xl bg-[#1a3a8f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#12307a]">Approve</button>
                              <button onClick={() => handleAccount(u.user_id, 'reject')}
                                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-gray-100">Reject</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {totalPages > 1 && (
                        <tr><td colSpan={5} className="px-6 py-3 bg-slate-50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Page {safePage} of {totalPages}</span>
                            <div className="flex gap-2">
                              <button onClick={() => setAccountsPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                                className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">Prev</button>
                              <button onClick={() => setAccountsPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                                className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">Next</button>
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          )
        ) : tab === 'resets' ? (
          pendingResets.length === 0 ? (
            <p className="px-6 py-8 text-sm text-slate-400 text-center">No pending password reset requests.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                <tr>
                  <th className="px-6 py-4">Name</th><th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4">Role</th><th className="px-6 py-4">Requested</th>
                  <th className="px-6 py-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {(() => {
                  const totalPages = Math.max(1, Math.ceil(pendingResets.length / 10));
                  const safePage = Math.min(resetsPage, totalPages);
                  const page = pendingResets.slice((safePage - 1) * 10, safePage * 10);
                  return (
                    <>
                      {page.map((r) => (
                        <tr key={r.request_id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 font-semibold text-slate-900">{r.full_name}</td>
                          <td className="px-6 py-4 text-slate-600">{r.email}</td>
                          <td className="px-6 py-4"><RoleBadge role={r.user_role} /></td>
                          <td className="px-6 py-4 text-xs text-slate-400">{new Date(r.requested_at).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' })}</td>
                          <td className="px-6 py-4">
                            <div className="flex gap-2">
                              <button onClick={() => handleReset(r.request_id, 'approve')}
                                className="rounded-xl bg-[#1a3a8f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#12307a]">Approve</button>
                              <button onClick={() => handleReset(r.request_id, 'reject')}
                                className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-gray-100">Reject</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {totalPages > 1 && (
                        <tr><td colSpan={5} className="px-6 py-3 bg-slate-50">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">Page {safePage} of {totalPages}</span>
                            <div className="flex gap-2">
                              <button onClick={() => setResetsPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                                className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">Prev</button>
                              <button onClick={() => setResetsPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                                className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">Next</button>
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </>
                  );
                })()}
              </tbody>
            </table>
          )
        ) : tab === 'history' ? (
          <div>
            {/* Sub-filter */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
              <div className="flex gap-1.5">
                {['Pending Accounts', 'Reset History'].map((sf) => (
                  <button key={sf} onClick={() => { setHistorySubFilter(sf); setHistorySearch(''); }}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      historySubFilter === sf ? 'bg-[#1540A8] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {sf}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                placeholder="Search by name or email..."
                className="ml-auto rounded-2xl border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
              />
            </div>
            {historySubFilter === 'Pending Accounts' ? (
              historyAccounts.length === 0 ? (
                <p className="px-6 py-8 text-sm text-slate-400 text-center">No account history yet.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Name</th><th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Roles</th><th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(() => {
                      const filteredHA = historyAccounts.filter((u) => {
                        const q = historySearch.trim().toLowerCase();
                        return !q || (u.full_name + ' ' + u.email).toLowerCase().includes(q);
                      });
                      const totalPages = Math.max(1, Math.ceil(filteredHA.length / 10));
                      const safePage = Math.min(histAccPage, totalPages);
                      const page = filteredHA.slice((safePage - 1) * 10, safePage * 10);
                      return (
                        <>
                          {page.map((u) => {
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
                              <td className="px-6 py-4"><StatusBadge status={u.account_status} /></td>
                              <td className="px-6 py-4">
                                <div className="flex gap-2">
                                  <button onClick={() => openRoleModal(u)}
                                    className="rounded-xl border border-[#1a3a8f] px-3 py-1.5 text-xs font-semibold text-[#1a3a8f] hover:bg-[#e8edf8]">
                                    Manage Roles
                                  </button>
                                  {u.account_status === 'active' ? (
                                    <button onClick={() => handleAccount(u.user_id, 'reject')}
                                      className="rounded-xl border border-gray-200 px-4 py-2 text-xs font-semibold text-red-600 hover:bg-red-50">Revoke</button>
                                  ) : (
                                    <button onClick={() => handleAccount(u.user_id, 'approve')}
                                      className="rounded-xl bg-[#1a3a8f] px-4 py-2 text-xs font-semibold text-white hover:bg-[#12307a]">Reactivate</button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            );
                          })}
                          {totalPages > 1 && (
                            <tr><td colSpan={5} className="px-6 py-3 bg-slate-50">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500">Page {safePage} of {totalPages}</span>
                                <div className="flex gap-2">
                                  <button onClick={() => setHistAccPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                                    className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">Prev</button>
                                  <button onClick={() => setHistAccPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                                    className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">Next</button>
                                </div>
                              </div>
                            </td></tr>
                          )}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              )
            ) : (
              historyResets.length === 0 ? (
                <p className="px-6 py-8 text-sm text-slate-400 text-center">No password reset history yet.</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Name</th><th className="px-6 py-4">Email</th>
                      <th className="px-6 py-4">Role</th><th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Requested</th><th className="px-6 py-4">Reviewed</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {(() => {
                      const filteredHR = historyResets.filter((r) => {
                        const q = historySearch.trim().toLowerCase();
                        return !q || (r.full_name + ' ' + r.email).toLowerCase().includes(q);
                      });
                      const totalPages = Math.max(1, Math.ceil(filteredHR.length / 10));
                      const safePage = Math.min(histResPage, totalPages);
                      const page = filteredHR.slice((safePage - 1) * 10, safePage * 10);
                      return (
                        <>
                          {page.map((r) => (
                            <tr key={r.request_id} className="hover:bg-gray-50">
                              <td className="px-6 py-4 font-semibold text-slate-900">{r.full_name}</td>
                              <td className="px-6 py-4 text-slate-600">{r.email}</td>
                              <td className="px-6 py-4"><RoleBadge role={r.user_role} /></td>
                              <td className="px-6 py-4"><StatusBadge status={r.status} /></td>
                              <td className="px-6 py-4 text-xs text-slate-400">{new Date(r.requested_at).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' })}</td>
                              <td className="px-6 py-4 text-xs text-slate-400">{r.reviewed_at ? new Date(r.reviewed_at).toLocaleString('en-SG', { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                            </tr>
                          ))}
                          {totalPages > 1 && (
                            <tr><td colSpan={6} className="px-6 py-3 bg-slate-50">
                              <div className="flex items-center justify-between">
                                <span className="text-xs text-slate-500">Page {safePage} of {totalPages}</span>
                                <div className="flex gap-2">
                                  <button onClick={() => setHistResPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                                    className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">Prev</button>
                                  <button onClick={() => setHistResPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                                    className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">Next</button>
                                </div>
                              </div>
                            </td></tr>
                          )}
                        </>
                      );
                    })()}
                  </tbody>
                </table>
              )
            )}
          </div>
        ) : null}
      </div>

      {/* Role Management Modal */}
      {roleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Manage Roles</h2>
                <p className="text-sm text-slate-500 mt-0.5">{roleModal.full_name} — {roleModal.email}</p>
              </div>
              <button onClick={() => setRoleModal(null)}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 text-xl leading-none">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400 mb-3">
                Select all applicable roles. You must select at least one role.
              </p>
              {ALL_ROLES.map(({ key, label }) => (
                <label key={key}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition ${
                    selectedRoles.includes(key) ? 'border-[#1a3a8f] bg-[#e8edf8]' : 'border-slate-200 hover:bg-slate-50'
                  }`}>
                  <input type="checkbox" checked={selectedRoles.includes(key)} onChange={() => toggleRole(key)}
                    className="rounded border-slate-300 text-[#1a3a8f]" />
                  <span className={`text-sm font-semibold ${selectedRoles.includes(key) ? 'text-[#1a3a8f]' : 'text-slate-700'}`}>
                    {label}
                  </span>
                </label>
              ))}
              {roleFeedback && (
                <p className={`rounded-xl px-4 py-2.5 text-sm font-medium ${
                  roleFeedback.includes('success') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                }`}>{roleFeedback}</p>
              )}
            </div>
            <div className="flex gap-3 justify-end px-6 pb-6">
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
    </div>
  );
}