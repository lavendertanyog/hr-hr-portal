"use client";

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const CATEGORIES = ['ANNUAL', 'EMERGENCY', 'SICK'];

function formatDt(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  const datePart = d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short', year: 'numeric' });
  const timePart = d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true });
  return `${datePart}, ${timePart}`;
}

function StatusPill({ status }) {
  const s = String(status || '').toUpperCase();
  const map = {
    APPROVED: 'bg-green-50 text-green-700', REJECTED: 'bg-red-50 text-red-600',
    PENDING: 'bg-yellow-50 text-yellow-700', CANCELLED: 'bg-slate-100 text-slate-500',
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${map[s] || 'bg-gray-100 text-gray-600'}`}>{s}</span>;
}

export default function HrLeavePage() {
  const [requesterId, setRequesterId] = useState('');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nameSearch, setNameSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  const [editingLeave, setEditingLeave] = useState(null);
  const [editCategory, setEditCategory] = useState('ANNUAL');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editReason, setEditReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setRequesterId(u.user_id);
    } catch {}
  }, []);

  const loadData = useCallback(async (rid) => {
    if (!rid) return;
    try {
      setLoading(true);
      const res = await axios.get(`${API_BASE}/api/v1/hr/leave-requests?requesterId=${rid}`);
      setRequests(res.data?.data || []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (requesterId) loadData(requesterId); }, [requesterId, loadData]);

  const filteredRequests = useMemo(() => {
    const q = nameSearch.trim().toLowerCase();
    return requests.filter((r) => {
      if (statusFilter !== 'ALL' && String(r.workflow_status).toUpperCase() !== statusFilter) return false;
      if (q && !String(r.full_name || '').toLowerCase().includes(q) && !String(r.email || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [requests, nameSearch, statusFilter]);

  const openEdit = (r) => {
    setEditingLeave(r);
    setEditCategory(String(r.category || 'ANNUAL').toUpperCase());
    setEditStartDate(String(r.start_date).slice(0, 10));
    setEditEndDate(String(r.end_date).slice(0, 10));
    setEditReason(r.reason || '');
    setMessage('');
  };

  const closeEdit = () => setEditingLeave(null);

  const handleSaveEdit = async () => {
    if (!editingLeave || !requesterId) return;
    if (!editStartDate || !editEndDate) { setMessage('Please provide both a start and end date.'); setMessageType('error'); return; }
    setSaving(true); setMessage('');
    try {
      await axios.patch(`${API_BASE}/api/v1/leave/${editingLeave.leave_id}`, {
        userId: editingLeave.user_id,
        requesterId,
        category: editCategory,
        startDate: editStartDate,
        endDate: editEndDate,
        reason: editReason.trim() || undefined,
      });
      setMessage('Leave request updated successfully.'); setMessageType('success');
      setEditingLeave(null);
      await loadData(requesterId);
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to update leave request.'); setMessageType('error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-900">Employee Leave</h1>
        <p className="mt-2 text-sm text-slate-500">Review and, when needed, correct any employee's leave request.</p>
      </div>

      {message && !editingLeave && (
        <div className={`mb-6 rounded-2xl px-5 py-3.5 text-sm font-medium border ${
          messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
        }`}>{message}</div>
      )}

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Leave Requests</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <div className="flex flex-wrap gap-1.5">
            {['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'].map((s) => (
              <button key={s} type="button" onClick={() => setStatusFilter(s)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  statusFilter === s ? 'bg-[#1a3a8f] text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}>
                {s.charAt(0) + s.slice(1).toLowerCase()}
              </button>
            ))}
          </div>
          <input type="text" value={nameSearch} onChange={(e) => setNameSearch(e.target.value)}
            placeholder="Search employee name or email…"
            className="rounded-2xl border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64" />
        </div>

        {loading ? (
          <p className="px-6 py-8 text-sm text-slate-400 text-center">Loading…</p>
        ) : filteredRequests.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-400 text-center">
            {requests.length === 0 ? 'No leave requests exist yet.' : 'No leave requests match this filter.'}
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
                {filteredRequests.map((r) => (
                  <tr key={r.leave_id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="font-semibold text-slate-800">{r.full_name}</p>
                      <p className="text-xs text-slate-400">{r.email}</p>
                    </td>
                    <td className="px-6 py-4 font-semibold text-slate-700 whitespace-nowrap">{r.category}</td>
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{String(r.start_date).slice(0, 10)}</td>
                    <td className="px-6 py-4 text-slate-600 whitespace-nowrap">{String(r.end_date).slice(0, 10)}</td>
                    <td className="px-6 py-4 whitespace-nowrap"><StatusPill status={r.workflow_status} /></td>
                    <td className="px-6 py-4 text-slate-500 max-w-[220px] truncate">{r.reviewer_remarks || '—'}</td>
                    <td className="px-6 py-4 text-xs text-slate-400 whitespace-nowrap">{formatDt(r.created_at)}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <button type="button" onClick={() => openEdit(r)}
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

      {editingLeave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) closeEdit(); }}>
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Edit Leave Request</p>
                <p className="mt-1 text-sm font-semibold text-slate-800">{editingLeave.full_name}</p>
              </div>
              <button type="button" onClick={closeEdit} className="text-xs font-semibold text-slate-400 hover:text-slate-600">Cancel</button>
            </div>

            {message && (
              <div className={`mb-5 rounded-2xl px-4 py-3 text-sm font-medium border ${
                messageType === 'success' ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'
              }`}>{message}</div>
            )}

            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Category</label>
                <select value={editCategory} onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
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
              <button type="button" onClick={handleSaveEdit} disabled={saving}
                className="w-full rounded-2xl py-3.5 text-sm font-bold text-white disabled:opacity-60 transition" style={{ background: '#0c3b8f' }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
