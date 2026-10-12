"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { RangeCalendarPopover, toDateStr, parseDateStr } from '../RangeCalendarPopover';

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}

function downloadCsv(fileName, csvContent) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function formatCsvDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Singapore' });
}

function formatCsvTime(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' });
}

function formatDt(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  // timeZone is pinned explicitly — 'en-SG' alone only controls formatting style (date order,
  // AM/PM), NOT which timezone is used. Without this, the displayed hour depends on whatever
  // timezone the VIEWER's own computer happens to be set to, which can silently show a
  // completely wrong hour (e.g. an 8am SGT clock-in appearing as 4pm) if that device isn't
  // correctly configured to Singapore/Malaysia time.
  const datePart = d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short', timeZone: 'Asia/Singapore' });
  const timePart = d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' });
  return `${datePart}, ${timePart}`;
}

function formatHoursDuration(hours) {
  if (hours == null || isNaN(Number(hours))) return '—';
  const totalMinutes = Math.round(Number(hours) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const clock = `${h}h ${m}m`;
  return `${clock} (${Number(hours).toFixed(2)})`;
}

function allocationLabel(a) {
  return a.project_code || 'General';
}

function allocationsSummary(row) {
  const allocations = Array.isArray(row.allocations) ? row.allocations : [];
  if (allocations.length === 0) return row.project_code || (row.entry_type === 'GENERAL' ? 'General' : '—');
  if (allocations.length === 1) return allocationLabel(allocations[0]);
  return `${allocations.length} projects`;
}

// Currently clocked out but historic rows may still carry a stale ACTIVE status
function derivedStatus(row) {
  const raw = String(row.status || '').toUpperCase();
  if (raw === 'VOIDED') return 'VOIDED';
  return row.clock_out_time ? 'COMPLETED' : 'ACTIVE';
}

// Computed via UTC getters on a manually SGT-shifted instant rather than the local getHours()/
// getDate(), which only give the right answer if the VIEWER's own device happens to be set to
// Singapore/Malaysia time — the same class of bug that made clock-in times display up to 8
// hours off depending on which computer was looking at them.
function toSGT(dateInput) {
  return new Date(new Date(dateInput).getTime() + 8 * 60 * 60 * 1000);
}
function isOvernightShift(row) {
  if (!row.clock_in_time) return false;
  const inHour = toSGT(row.clock_in_time).getUTCHours();
  const isLateNightStart = inHour >= 22 || inHour < 6;
  if (isLateNightStart) return true;
  if (row.clock_out_time) {
    const inDate = toSGT(row.clock_in_time);
    const outDate = toSGT(row.clock_out_time);
    const crossesMidnight = outDate.getUTCDate() !== inDate.getUTCDate() || outDate.getUTCMonth() !== inDate.getUTCMonth();
    if (crossesMidnight) return true;
  }
  return false;
}

export default function AttendancePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nameSearch, setNameSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [requesterId, setRequesterId] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef(null);

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

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

  // Same short "07 Sept – 13 Sept 2026" style label as the Reports page's Date field.
  const dateRangeLabel = useMemo(() => {
    const fmt = (s) => parseDateStr(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
    if (dateFrom && dateTo) return dateFrom === dateTo ? fmt(dateFrom) : `${fmt(dateFrom)} – ${fmt(dateTo)}`;
    if (dateFrom) return `From ${fmt(dateFrom)}`;
    if (dateTo) return `Until ${fmt(dateTo)}`;
    return 'All dates';
  }, [dateFrom, dateTo]);

  // `silent` skips the loading placeholder — used for the periodic background refresh, so it
  // doesn't blank the table out from under someone scrolled down reading it. Only the very first
  // load (nothing on screen yet) needs the placeholder.
  const loadData = async (rid, { silent } = {}) => {
    if (!rid) return;
    try {
      if (!silent) setLoading(true);
      const res = await axios.get(`${backendBaseUrl}/api/v1/hr/attendance-logs?requesterId=${rid}`);
      setRows(res.data.data || []);
    } catch {
      if (!silent) setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!requesterId) return;
    loadData(requesterId);
    const timer = setInterval(() => loadData(requesterId, { silent: true }), 15000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requesterId, backendBaseUrl]);

  const filteredRows = useMemo(() => {
    const nameQ = nameSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && derivedStatus(row) !== statusFilter) return false;
      if (nameQ && !String(row.full_name || '').toLowerCase().includes(nameQ)) return false;
      if (dateFrom) {
        const d = row.clock_in_time ? new Date(row.clock_in_time) : null;
        if (!d || d < new Date(dateFrom)) return false;
      }
      if (dateTo) {
        const d = row.clock_in_time ? new Date(row.clock_in_time) : null;
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        if (!d || d > end) return false;
      }
      return true;
    });
  }, [rows, nameSearch, statusFilter, dateFrom, dateTo]);

  const handleExport = () => {
    const csv = toCsv(filteredRows.map((row) => {
      const allocations = Array.isArray(row.allocations) ? row.allocations : [];
      const projectAllocs = allocations.filter((a) => a.project_code);
      const generalAlloc = allocations.find((a) => !a.project_code);
      const projectCodes = projectAllocs.length > 0
        ? projectAllocs.map((a) => a.project_code).join(', ')
        : (row.project_code || (generalAlloc ? 'General' : ''));
      const projectDescription = projectAllocs
        .map((a) => `${a.project_code}: ${a.description || '—'}`)
        .join('; ');
      return {
        full_name: row.full_name,
        project_codes: projectCodes,
        clock_in_date: formatCsvDate(row.clock_in_time),
        clock_in_time: formatCsvTime(row.clock_in_time),
        clock_out_date: formatCsvDate(row.clock_out_time),
        clock_out_time: formatCsvTime(row.clock_out_time),
        hours: row.daily_worktime_hours,
        ot_hours: row.ot_hours_accrued,
        general_description: generalAlloc?.description || '',
        project_description: projectDescription,
        remark: row.remark,
      };
    }));
    if (csv) downloadCsv(`attendance-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const resetFilters = () => {
    setNameSearch('');
    setStatusFilter('ALL');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="p-8">
      <div className="mb-10 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-900">Attendance Logs</h1>
        <p className="mt-2 text-sm text-slate-500">Monitor attendance across all employees.</p>
      </div>

      {/* Filters */}
      <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          {/* Employee name search */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Employee Name</label>
            <div className="relative">
              <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={nameSearch}
                onChange={(e) => setNameSearch(e.target.value)}
                placeholder="Search employee name…"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900"
            >
              <option value="ALL">All Status</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="COMPLETED">COMPLETED</option>
              <option value="VOIDED">VOIDED</option>
            </select>
          </div>

          {/* Date — same calendar-popover control as the Reports page's Date field, replacing
              the old separate Date From / Date To inputs with one field you click to pick either
              a single day or a range. */}
          <div ref={calendarRef} className="relative">
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Date</label>
            <button type="button" onClick={() => setCalendarOpen((o) => !o)}
              className="w-full flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-900 hover:bg-slate-100 transition">
              <svg className="flex-shrink-0 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span className="truncate">{dateRangeLabel}</span>
            </button>
            {calendarOpen && (
              <RangeCalendarPopover
                initialStart={dateFrom || dateTo || toDateStr(new Date())}
                initialEnd={dateTo || dateFrom || toDateStr(new Date())}
                onApply={(start, end) => { setDateFrom(start); setDateTo(end); setCalendarOpen(false); }}
                onClose={() => setCalendarOpen(false)}
              />
            )}
          </div>

          {/* Reset */}
          <div className="flex items-end">
            <button
              onClick={resetFilters}
              className="w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Reset Filters
            </button>
          </div>
        </div>

        <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
          <button onClick={handleExport} className="rounded-3xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white">
            Export CSV
          </button>
        </div>
      </div>

      {/* Table — simplified summary, click a row for full detail */}
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-[0.22em] text-[0.65rem]">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Project(s)</th>
              <th className="px-4 py-3">Clock In → Out</th>
              <th className="px-4 py-3">Hours</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Loading attendance logs…</td></tr>
            ) : filteredRows.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">No records match the selected filters.</td></tr>
            ) : filteredRows.map((row) => {
              const isOpen = expandedId === row.attendance_id;
              const status = derivedStatus(row);
              const overnight = isOvernightShift(row);
              const allocations = Array.isArray(row.allocations) ? row.allocations : [];
              const isMultiProject = allocations.length > 1;
              return (
                <React.Fragment key={row.attendance_id}>
                  <tr
                    className="cursor-pointer hover:bg-slate-50/50"
                    onClick={() => setExpandedId(isOpen ? null : row.attendance_id)}
                  >
                    <td className="px-4 py-3 font-medium text-slate-800">{row.full_name}</td>
                    <td className="px-4 py-3">
                      {isMultiProject ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E8EEFF] px-2.5 py-1 text-xs font-semibold text-[#163EAF]">
                          {allocations.length} projects
                        </span>
                      ) : (
                        <span className="text-sm text-slate-600">{allocationsSummary(row)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span>{formatDt(row.clock_in_time)} → {row.clock_out_time ? formatDt(row.clock_out_time) : <span className="text-green-600 font-semibold text-xs">Ongoing</span>}</span>
                        {overnight && (
                          <span title="Overnight / unusual shift timing" className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                            ⚠ Overnight
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatHoursDuration(row.daily_worktime_hours)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                        status === 'ACTIVE' ? 'bg-green-100 text-green-700'
                        : status === 'COMPLETED' ? 'bg-slate-100 text-slate-600'
                        : 'bg-red-100 text-red-600'
                      }`}>
                        {status === 'ACTIVE' && <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />}
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{isOpen ? '▲' : '▼'}</td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={6} className="p-0">
                        <div className="border-l-4 border-[#1540A8] bg-[#F5F8FF] px-6 py-5">
                          <div className="flex flex-wrap gap-x-10 gap-y-4">
                            <div className="min-w-[180px]">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                {isMultiProject ? 'Project Allocation' : 'Project'}
                              </p>
                              {isMultiProject ? (
                                <div className="mt-1.5 flex flex-col gap-1.5">
                                  {allocations.map((a, i) => (
                                    <div key={i} className="flex items-center gap-2 flex-wrap">
                                      <span className="inline-block rounded-full bg-[#E8EEFF] px-2.5 py-1 text-xs font-semibold text-[#163EAF]">
                                        {allocationLabel(a)}
                                      </span>
                                      <span className="text-xs text-slate-500">{Number(a.allocated_hours).toFixed(2)}h planned</span>
                                      <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
                                        a.status === 'COMPLETED' ? 'bg-slate-200 text-slate-500'
                                        : a.status === 'ACTIVE' ? 'bg-green-100 text-green-700'
                                        : 'bg-amber-100 text-amber-700'
                                      }`}>{a.status}</span>
                                      {a.edited_after_completion && (
                                        <span title={a.last_edited_at ? `Last edited ${formatDt(a.last_edited_at)}` : undefined}
                                          className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                          ⚠ Edited after completion
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div className="mt-1 flex items-center gap-2 flex-wrap">
                                  <span className="inline-block rounded-full bg-[#E8EEFF] px-3 py-1 text-xs font-semibold text-[#163EAF]">
                                    {allocationsSummary(row)}
                                  </span>
                                  {allocations[0]?.edited_after_completion && (
                                    <span title={allocations[0]?.last_edited_at ? `Last edited ${formatDt(allocations[0].last_edited_at)}` : undefined}
                                      className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                      ⚠ Edited after completion
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="min-w-[100px]">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">OT Hours</p>
                              <span className="mt-1 inline-block rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">
                                {row.ot_hours_accrued ?? '0.00'}h
                              </span>
                            </div>
                            <div className="min-w-[240px] flex-1">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Remark</p>
                              <p className="mt-1 text-sm">
                                {row.remark
                                  ? <span className="text-slate-700">{row.remark}{row.is_manual_entry ? ' (manual entry)' : ''}</span>
                                  : <span className="text-slate-400 italic">No remarks provided for this session.</span>}
                              </p>
                            </div>
                          </div>
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
    </div>
  );
}
