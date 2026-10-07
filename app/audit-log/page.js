"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { RangeCalendarPopover, toDateStr, parseDateStr } from '../RangeCalendarPopover';

const PAGE_SIZE = 20;

const RECORD_TYPES = [
  { value: 'attendance_logs', label: 'Attendance entry' },
  { value: 'attendance_allocations', label: 'Project block' },
  { value: 'leave_applications', label: 'Leave request' },
  { value: 'budget_requests', label: 'Budget request' },
  { value: 'project_progress_logs', label: 'Progress log' },
  { value: 'projects', label: 'Project' },
  { value: 'users', label: 'Employee' },
];
const RECORD_LABEL = Object.fromEntries(RECORD_TYPES.map((t) => [t.value, t.label]));

const FIELD_LABELS = {
  user_id: 'Employee',
  clock_in_time: 'Clock in',
  clock_out_time: 'Clock out',
  daily_worktime_hours: 'Hours worked',
  ot_hours_accrued: 'Overtime hours',
  workflow_status: 'Status',
  status: 'Status',
  reviewer_remarks: 'Reviewer remarks',
  reviewed_by: 'Reviewed by',
  category: 'Leave type',
  start_date: 'Start date',
  end_date: 'End date',
  reason: 'Reason',
  mc_file_url: 'MC document',
  leave_entitlement_days: 'Leave entitlement (days)',
  project_code: 'Project',
  description: 'Description',
  allocated_hours: 'Planned hours',
  corrected_hours: 'Corrected hours',
  accumulated_hours: 'Logged hours',
  completion_percentage: 'Completion %',
  progress_summary: 'Summary',
  requested_hours: 'Requested hours',
  justification: 'Justification',
  budget_hours: 'Budget hours',
  allocations: 'Project blocks',
};

function fieldLabel(key) {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// Dates and times in snapshots are stored as UTC ISO strings; show them in SGT like the rest
// of the portal. Plain YYYY-MM-DD values (leave dates) have no time and are shown as-is.
function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' });
    }
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return parseDateStr(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
  return s;
}

// Snapshot fields that hold a user ID; shown as the person's name when they are a known employee.
const USER_ID_FIELDS = new Set(['reviewed_by', 'user_id', 'reporter_id', 'supervisor_id', 'approved_by', 'assigned_by', 'updated_by']);

function displayValue(key, value, nameById) {
  if (USER_ID_FIELDS.has(key) && value && nameById[value]) return nameById[value];
  // A deleted attendance entry carries the project blocks that were deleted with it.
  if (key === 'allocations' && Array.isArray(value)) {
    if (value.length === 0) return 'None';
    return value.map((a) => `${a.project_code || 'General'} (${Number(a.allocated_hours || 0)}h)`).join(', ');
  }
  return formatValue(value);
}

function formatWhen(dt) {
  return new Date(dt).toLocaleString('en-SG', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' });
}

// Fields whose value differs between the before and after snapshots. A snapshot can be null
// (record created or deleted), in which case every field on the other side counts as changed.
// Internal identifiers and raw location data mean nothing to a reader of the log.
const HIDDEN_FIELDS = new Set(['attendance_id', 'allocation_id', 'leave_id', 'log_id', 'request_id', 'raw_coordinates', 'push_token', 'password_hash']);
const FIELD_ORDER = Object.keys(FIELD_LABELS);

function changedFields(pre, post) {
  const before = pre || {};
  const after = post || {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  const rank = (k) => (FIELD_ORDER.includes(k) ? FIELD_ORDER.indexOf(k) : FIELD_ORDER.length);
  return keys
    .filter((k) => !HIDDEN_FIELDS.has(k))
    .filter((k) => JSON.stringify(before[k] ?? null) !== JSON.stringify(after[k] ?? null))
    .sort((a, b) => rank(a) - rank(b))
    .map((k) => ({ key: k, before: before[k], after: after[k] }));
}

function summarise(row) {
  if (row.pre_value && !row.post_value) return 'Deleted';
  if (!row.pre_value && row.post_value) return 'Created';
  const changes = changedFields(row.pre_value, row.post_value);
  const statusChange = changes.find((c) => c.key === 'workflow_status' || c.key === 'status');
  if (statusChange) return `Status ${formatValue(statusChange.before)} → ${formatValue(statusChange.after)}`;
  const visible = changes.filter((c) => !['updated_at', 'last_edited_at'].includes(c.key));
  if (visible.length === 0) return 'No field values changed';
  const names = visible.slice(0, 3).map((c) => fieldLabel(c.key));
  return `Changed ${names.join(', ')}${visible.length > 3 ? ` and ${visible.length - 3} more` : ''}`;
}

export default function AuditLogPage() {
  const [requesterId, setRequesterId] = useState('');
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [people, setPeople] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [recordType, setRecordType] = useState('');
  const [changedBy, setChangedBy] = useState('');
  const [affected, setAffected] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef(null);
  const [toast, setToast] = useState(null);
  const toastTimeoutRef = useRef(null);

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

  const showToast = (text, type) => {
    setToast({ text, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setRequesterId(u.user_id);
    } catch {}
  }, []);

  useEffect(() => {
    const handler = (e) => { if (calendarRef.current && !calendarRef.current.contains(e.target)) setCalendarOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (!requesterId) return;
    axios.get(`${backendBaseUrl}/api/v1/hr/active-users?requesterId=${requesterId}`)
      .then((res) => setPeople(res.data?.data || []))
      .catch(() => setPeople([]));
  }, [requesterId, backendBaseUrl]);

  useEffect(() => {
    if (!requesterId) return;
    const params = new URLSearchParams({ requesterId, page: String(page), pageSize: String(PAGE_SIZE) });
    if (dateFrom) params.set('from', dateFrom);
    if (dateTo) params.set('to', dateTo);
    if (recordType) params.set('tableName', recordType);
    if (changedBy) params.set('alteredBy', changedBy);
    if (affected) params.set('subjectUserId', affected);
    setLoading(true);
    axios.get(`${backendBaseUrl}/api/v1/hr/audit-logs?${params.toString()}`)
      .then((res) => {
        setRows(res.data?.data || []);
        setTotal(res.data?.pagination?.total || 0);
      })
      .catch((err) => {
        setRows([]);
        setTotal(0);
        showToast(err.response?.data?.error || 'Failed to load the audit log.', 'error');
      })
      .finally(() => setLoading(false));
  }, [requesterId, page, dateFrom, dateTo, recordType, changedBy, affected, backendBaseUrl]);

  // Any filter change starts again from the first page.
  const applyFilter = (setter) => (value) => { setter(value); setPage(1); setExpandedId(null); };

  const resetFilters = () => {
    setDateFrom(''); setDateTo(''); setRecordType(''); setChangedBy(''); setAffected('');
    setPage(1); setExpandedId(null);
  };

  const dateRangeLabel = useMemo(() => {
    const fmt = (s) => parseDateStr(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    if (dateFrom && dateTo) return dateFrom === dateTo ? fmt(dateFrom) : `${fmt(dateFrom)} – ${fmt(dateTo)}`;
    return 'All dates';
  }, [dateFrom, dateTo]);

  const nameById = useMemo(() => Object.fromEntries(people.map((p) => [p.user_id, p.full_name])), [people]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstShown = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastShown = Math.min(page * PAGE_SIZE, total);

  const filterLabel = 'block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5';
  const filterSelect = 'w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="p-8">
      <div className="mb-10 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-900">Audit Log</h1>
        <p className="mt-2 text-sm text-slate-500">A read-only record of changes to timesheets, leave, budgets, projects and employee settings.</p>
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
          <div className={`rounded-full px-4 py-2.5 text-sm font-medium shadow-lg border ${
            toast.type === 'error' ? 'bg-red-600 border-red-700 text-white' : 'bg-slate-900 border-slate-950 text-white'
          }`}>{toast.text}</div>
        </div>
      )}

      {/* Filters */}
      <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
          <div ref={calendarRef} className="relative">
            <label className={filterLabel}>Date</label>
            <button type="button" onClick={() => setCalendarOpen((o) => !o)}
              className="w-full flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 hover:bg-slate-100 transition">
              <svg className="flex-shrink-0 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className="truncate">{dateRangeLabel}</span>
            </button>
            {calendarOpen && (
              <RangeCalendarPopover
                initialStart={dateFrom || toDateStr(new Date())}
                initialEnd={dateTo || dateFrom || toDateStr(new Date())}
                onApply={(start, end) => { setDateFrom(start); setDateTo(end); setPage(1); setExpandedId(null); setCalendarOpen(false); }}
                onClose={() => setCalendarOpen(false)}
              />
            )}
          </div>

          <div>
            <label className={filterLabel}>Record type</label>
            <select value={recordType} onChange={(e) => applyFilter(setRecordType)(e.target.value)} className={filterSelect}>
              <option value="">All record types</option>
              {RECORD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label className={filterLabel}>Changed by</label>
            <select value={changedBy} onChange={(e) => applyFilter(setChangedBy)(e.target.value)} className={filterSelect}>
              <option value="">Anyone</option>
              {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
            </select>
          </div>

          <div>
            <label className={filterLabel}>Affected employee</label>
            <select value={affected} onChange={(e) => applyFilter(setAffected)(e.target.value)} className={filterSelect}>
              <option value="">Anyone</option>
              {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.full_name}</option>)}
            </select>
          </div>

          <div className="flex items-end">
            <button type="button" onClick={resetFilters}
              className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-[0.22em] text-[0.65rem]">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Change</th>
                <th className="px-4 py-3">Changed by</th>
                <th className="px-4 py-3">Affected</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-sm text-slate-400 text-center">Loading audit log…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-sm text-slate-400 text-center">No changes match these filters.</td></tr>
              ) : rows.map((row) => {
                const isOpen = expandedId === row.audit_id;
                const changes = changedFields(row.pre_value, row.post_value);
                const isDeleted = Boolean(row.pre_value && !row.post_value);
                return (
                  <React.Fragment key={row.audit_id}>
                    <tr className="cursor-pointer hover:bg-slate-50/50" onClick={() => setExpandedId(isOpen ? null : row.audit_id)}>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatWhen(row.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded-full bg-[#E8EEFF] px-2.5 py-1 text-xs font-semibold text-[#163EAF] whitespace-nowrap">
                          {RECORD_LABEL[row.table_name] || row.table_name}
                        </span>
                        {row.table_name === 'projects' && <span className="ml-2 text-xs text-slate-500">{row.record_id}</span>}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{summarise(row)}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.altered_by_name || <span className="text-slate-400 italic">System</span>}</td>
                      <td className="px-4 py-3 text-slate-700 whitespace-nowrap">{row.subject_name || <span className="text-slate-400">—</span>}</td>
                      <td className="px-4 py-3 text-right text-slate-400">{isOpen ? '▲' : '▼'}</td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6} className="p-0">
                          <div className="border-l-4 border-[#1540A8] bg-[#F5F8FF] px-6 py-5">
                            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 mb-3">
                              {isDeleted ? 'Record as it was before it was deleted' : 'Before and after'}
                            </p>
                            {changes.length === 0 ? (
                              <p className="text-sm text-slate-400 italic">No field values changed in this record.</p>
                            ) : (
                              <table className="w-full max-w-3xl table-fixed text-sm">
                                <thead>
                                  <tr className="text-xs text-slate-500">
                                    <th className="w-1/4 py-1.5 pr-4 font-semibold">Field</th>
                                    <th className="py-1.5 pr-4 font-semibold">{isDeleted ? 'Value' : 'Before'}</th>
                                    {!isDeleted && <th className="py-1.5 font-semibold">After</th>}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200/60">
                                  {changes.map((c) => (
                                    <tr key={c.key} className="align-top">
                                      <td className="py-2 pr-4 font-medium text-slate-700 whitespace-nowrap">{fieldLabel(c.key)}</td>
                                      <td className={`py-2 pr-4 break-words ${isDeleted ? 'text-slate-900' : 'text-slate-500'}`}>{displayValue(c.key, c.before, nameById)}</td>
                                      {!isDeleted && <td className="py-2 text-slate-900 break-words">{displayValue(c.key, c.after, nameById)}</td>}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-500">
            {total === 0 ? 'No records' : `Showing ${firstShown}–${lastShown} of ${total}`}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={page <= 1 || loading} onClick={() => { setPage((p) => p - 1); setExpandedId(null); }}
              className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">
              Previous
            </button>
            <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
            <button type="button" disabled={page >= totalPages || loading} onClick={() => { setPage((p) => p + 1); setExpandedId(null); }}
              className="rounded-xl border border-gray-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-gray-100">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
