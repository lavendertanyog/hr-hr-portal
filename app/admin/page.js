"use client";

import React, { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import axios from 'axios';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const LEAVE_CATEGORIES = ['ANNUAL', 'EMERGENCY', 'SICK'];

function LeaveStatusPill({ status }) {
  const s = String(status || '').toUpperCase();
  const map = {
    APPROVED: 'bg-green-50 text-green-700', REJECTED: 'bg-red-50 text-red-600',
    PENDING: 'bg-yellow-50 text-yellow-700',
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${map[s] || 'bg-gray-100 text-gray-600'}`}>{s}</span>;
}

function formatDt(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  const datePart = d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${datePart}, ${timePart}`;
}

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
  const [tab, setTab] = useState('accounts'); // 'accounts' | 'resets' | 'leave' | 'history'
  const [historySubFilter, setHistorySubFilter] = useState('Pending Accounts'); // 'Pending Accounts' | 'Reset History'
  const [historySearch, setHistorySearch] = useState('');
  const [pendingAccounts, setPendingAccounts] = useState([]);
  const [pendingResets, setPendingResets] = useState([]);
  const [historyAccounts, setHistoryAccounts] = useState([]);
  const [historyResets, setHistoryResets] = useState([]);

  // Leave requests
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveStatusFilter, setLeaveStatusFilter] = useState('ALL');
  const [leaveCategoryFilter, setLeaveCategoryFilter] = useState('ALL');
  const [leaveSearch, setLeaveSearch] = useState('');
  const [leaveMessage, setLeaveMessage] = useState('');
  const [leaveMessageType, setLeaveMessageType] = useState('');
  const [editingLeave, setEditingLeave] = useState(null);
  const [editCategory, setEditCategory] = useState('ANNUAL');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [leaveSaving, setLeaveSaving] = useState(false);
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
      const [accsRes, resetsRes, histAccRes, histResRes, leaveRes] = await Promise.all([
        // HR-scoped: only fetches pending Manager & Account Manager registrations
        axios.get(`${BACKEND}/api/v1/hr/pending-registrations?requesterId=${aid}`).catch((e) => e.response || null),
        axios.get(`${BACKEND}/api/v1/admin/pending-resets?adminId=${aid}`).catch(() => null),
        axios.get(`${BACKEND}/api/v1/admin/account-history?adminId=${aid}`).catch(() => null),
        axios.get(`${BACKEND}/api/v1/admin/reset-history?adminId=${aid}`).catch(() => null),
        axios.get(`${BACKEND}/api/v1/hr/leave-requests?requesterId=${aid}`).catch(() => null),
      ]);
      if (accsRes?.data?.success) { setPendingAccounts(accsRes.data.data || []); setIsAdmin(true); }
      else if (accsRes?.status === 403 || accsRes?.data?.status === 403) { setIsAdmin(false); }
      else { setIsAdmin(true); }
      if (resetsRes?.data?.success) setPendingResets(resetsRes.data.data || []);
      if (histAccRes?.data?.success) setHistoryAccounts(histAccRes.data.data || []);
      if (histResRes?.data?.success) setHistoryResets(histResRes.data.data || []);
      if (leaveRes?.data?.success) setLeaveRequests(leaveRes.data.data || []);
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

  const pendingLeaveCount = leaveRequests.filter((r) => String(r.workflow_status).toUpperCase() === 'PENDING').length;

  const filteredLeaveRequests = leaveRequests.filter((r) => {
    if (leaveStatusFilter !== 'ALL' && String(r.workflow_status).toUpperCase() !== leaveStatusFilter) return false;
    if (leaveCategoryFilter !== 'ALL' && String(r.category).toUpperCase() !== leaveCategoryFilter) return false;
    const q = leaveSearch.trim().toLowerCase();
    if (q && !String(r.full_name || '').toLowerCase().includes(q) && !String(r.email || '').toLowerCase().includes(q)) return false;
    return true;
  });

  const openEditLeave = (r) => {
    setEditingLeave(r);
    setEditCategory(String(r.category || 'ANNUAL').toUpperCase());
    setEditStartDate(String(r.start_date).slice(0, 10));
    setEditEndDate(String(r.end_date).slice(0, 10));
    setEditReason(r.reason || '');
    setLeaveMessage('');
  };

  const closeEditLeave = () => setEditingLeave(null);

  const handleSaveLeaveEdit = async () => {
    if (!editingLeave || !adminId) return;
    if (!editStartDate || !editEndDate) { setLeaveMessage('Please provide both a start and end date.'); setLeaveMessageType('error'); return; }
    setLeaveSaving(true); setLeaveMessage('');
    try {
      await axios.patch(`${BACKEND}/api/v1/leave/${editingLeave.leave_id}`, {
        userId: editingLeave.user_id,
        requesterId: adminId,
        category: editCategory,
        startDate: editStartDate,
        endDate: editEndDate,
        reason: editReason.trim() || undefined,
      });
      setLeaveMessage('Leave request updated successfully.'); setLeaveMessageType('success');
      setEditingLeave(null);
      await fetchAll(adminId);
    } catch (err) {
      setLeaveMessage(err.response?.data?.error || 'Failed to update leave request.'); setLeaveMessageType('error');
    } finally {
      setLeaveSaving(false);
    }
  };

  const displayName = user?.full_name || (user?.email ? user.email.split('@')[0].split('.').map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') : 'HR Admin');

  const TABS = [
    { key: 'accounts', label: `Pending Accounts (${pendingAccounts.length})` },
    { key: 'resets', label: `Password Resets (${pendingResets.length})` },
    { key: 'leave', label: `Leave Requests (${pendingLeaveCount})` },
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
            <Image src="/nextan-logo.png" alt="Nextan" width={140} height={44} className="object-contain opacity-80" onError={() => setLogoMissing(true)} />
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
        <button type="button" onClick={() => setTab('leave')}
          className={`text-left rounded-2xl border bg-white px-6 py-5 shadow-sm transition ${
            tab === 'leave' ? 'border-[#1a3a8f] ring-2 ring-[#1a3a8f]/30' : 'border-gray-100 hover:border-slate-300'
          }`}>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Leave Requests</p>
          <p className="mt-3 text-4xl font-semibold text-slate-900">{pendingLeaveCount}</p>
        </button>
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
        ) : tab === 'leave' ? (
          <div>
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex flex-wrap gap-1.5">
                {['ALL', 'PENDING', 'APPROVED', 'REJECTED'].map((s) => (
                  <button key={s} type="button" onClick={() => setLeaveStatusFilter(s)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      leaveStatusFilter === s ? 'bg-[#1540A8] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {s.charAt(0) + s.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['ALL', ...LEAVE_CATEGORIES].map((c) => (
                  <button key={c} type="button" onClick={() => setLeaveCategoryFilter(c)}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      leaveCategoryFilter === c ? 'bg-[#1540A8] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {c.charAt(0) + c.slice(1).toLowerCase()}
                  </button>
                ))}
              </div>
              <input type="text" value={leaveSearch} onChange={(e) => setLeaveSearch(e.target.value)}
                placeholder="Search employee name or email…"
                className="ml-auto rounded-2xl border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" />
            </div>

            {leaveMessage && (
              <div className={`mx-6 mt-4 rounded-2xl px-5 py-3.5 text-sm font-medium border ${
                leaveMessageType === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
              }`}>{leaveMessage}</div>
            )}

            {filteredLeaveRequests.length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-400 text-center">
                {leaveRequests.length === 0 ? 'No leave requests exist yet.' : 'No leave requests match this filter.'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    <tr>
                      <th className="px-6 py-4 whitespace-nowrap">Employee</th>
                      <th className="px-6 py-4 whitespace-nowrap">Category</th>
                      <th className="px-6 py-4 whitespace-nowrap">Start</th>
                      <th className="px-6 py-4 whitespace-nowrap">End</th>
                      <th className="px-6 py-4 whitespace-nowrap">Status</th>
                      <th className="px-6 py-4">Reviewer Remarks</th>
                      <th className="px-6 py-4 whitespace-nowrap">Submitted</th>
                      <th className="px-6 py-4 whitespace-nowrap">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredLeaveRequests.map((r) => (
                      <tr key={r.leave_id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <p className="font-semibold text-slate-800">{r.full_name}</p>
                          <p className="text-xs text-slate-400">{r.email}</p>
                        </td>
                        <td className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">{r.category}</td>
                        <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{String(r.start_date).slice(0, 10)}</td>
                        <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{String(r.end_date).slice(0, 10)}</td>
                        <td className="px-6 py-4 whitespace-nowrap"><LeaveStatusPill status={r.workflow_status} /></td>
                        <td className="px-6 py-4 text-slate-500 max-w-[220px] truncate">{r.reviewer_remarks || '—'}</td>
                        <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">{formatDt(r.created_at)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <button type="button" onClick={() => openEditLeave(r)}
                            className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600 hover:bg-blue-100">
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : tab === 'history' ? (
          <div>
            {/* Sub-filter */}
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-gray-100">
              <div className="flex gap-1.5">
                {[{ id: 'Pending Accounts', label: 'Pending Accounts' }, { id: 'Reset History', label: 'Password Reset' }].map((sf) => (
                  <button key={sf.id} onClick={() => { setHistorySubFilter(sf.id); setHistorySearch(''); }}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      historySubFilter === sf.id ? 'bg-[#1540A8] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}>
                    {sf.label}
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

      {/* Edit Leave Request Modal */}
      {editingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeEditLeave(); }}>
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Edit Leave Request</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{editingLeave.full_name}</p>
              </div>
              <button type="button" onClick={closeEditLeave} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Cancel</button>
            </div>

            {leaveMessage && (
              <div className={`mb-5 rounded-2xl px-4 py-3 text-sm font-medium border ${
                leaveMessageType === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
              }`}>{leaveMessage}</div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {LEAVE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Start Date</label>
                  <input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
                  <input type="date" value={editEndDate} min={editStartDate || undefined} onChange={(e) => setEditEndDate(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Reason <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea rows={3} value={editReason} onChange={(e) => setEditReason(e.target.value)}
                  placeholder="Brief reason for leave…"
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <p className="text-xs text-slate-400">
                Editing as HR overrides the normal "pending only" restriction — this can be applied to a request in any status.
              </p>
              <button type="button" onClick={handleSaveLeaveEdit} disabled={leaveSaving}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition" style={{ background: '#0c3b8f' }}>
                {leaveSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}