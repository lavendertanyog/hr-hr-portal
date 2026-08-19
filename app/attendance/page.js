"use client";

import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';

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

function formatDt(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  const datePart = d.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' });
  const timePart = d.toLocaleTimeString('en-SG', { hour: '2-digit', minute: '2-digit', hour12: true });
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

function isOvernightShift(row) {
  if (!row.clock_in_time) return false;
  const inHour = new Date(row.clock_in_time).getHours();
  const isLateNightStart = inHour >= 22 || inHour < 6;
  if (isLateNightStart) return true;
  if (row.clock_out_time) {
    const inDate = new Date(row.clock_in_time);
    const outDate = new Date(row.clock_out_time);
    const crossesMidnight = outDate.getDate() !== inDate.getDate() || outDate.getMonth() !== inDate.getMonth();
    if (crossesMidnight) return true;
  }
  return false;
}

export default function AttendancePage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [nameSearch, setNameSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [locationSearch, setLocationSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [requesterId, setRequesterId] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setRequesterId(u.user_id);
    } catch {}
  }, []);

  const loadData = async (rid) => {
    if (!rid) return;
    try {
      setLoading(true);
      const res = await axios.get(`${backendBaseUrl}/api/v1/hr/attendance-logs?requesterId=${rid}`);
      setRows(res.data.data || []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!requesterId) return;
    loadData(requesterId);
    const timer = setInterval(() => loadData(requesterId), 15000);
    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requesterId, backendBaseUrl]);

  const filteredRows = useMemo(() => {
    const nameQ = nameSearch.trim().toLowerCase();
    const locQ = locationSearch.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'ALL' && derivedStatus(row) !== statusFilter) return false;
      if (nameQ && !String(row.full_name || '').toLowerCase().includes(nameQ)) return false;
      if (locQ && !String(row.location_name || '').toLowerCase().includes(locQ)) return false;
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
  }, [rows, nameSearch, statusFilter, locationSearch, dateFrom, dateTo]);

  const handleExport = () => {
    const csv = toCsv(filteredRows.map((row) => ({
      attendance_id: row.attendance_id,
      full_name: row.full_name,
      project_code: row.project_code,
      project_allocations: Array.isArray(row.allocations) && row.allocations.length > 0
        ? row.allocations.map((a) => `${allocationLabel(a)} (${Number(a.allocated_hours).toFixed(2)}h, ${a.status})`).join('; ')
        : '',
      clock_in: row.clock_in_time,
      clock_out: row.clock_out_time,
      location: row.location_name,
      country: row.country_code,
      hours: row.daily_worktime_hours,
      ot_hours: row.ot_hours_accrued,
      status: derivedStatus(row),
      entry_type: row.entry_type,
      remark: row.remark,
    })));
    if (csv) downloadCsv(`attendance-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  };

  const resetFilters = () => {
    setNameSearch('');
    setStatusFilter('ALL');
    setLocationSearch('');
    setDateFrom('');
    setDateTo('');
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-900">Attendance Logs</h1>
          <p className="mt-2 text-sm text-slate-500">Monitor attendance across all employees.</p>
        </div>
        <button onClick={handleExport} className="rounded-3xl bg-[#1540A8] px-5 py-3 text-sm font-semibold text-white">
          Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="mb-5 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {/* Employee name search */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Employee Name</label>
            <input
              value={nameSearch}
              onChange={(e) => setNameSearch(e.target.value)}
              placeholder="Search employee name…"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
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

          {/* Location */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Location</label>
            <input
              value={locationSearch}
              onChange={(e) => setLocationSearch(e.target.value)}
              placeholder="Search location…"
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Date from */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900"
            />
          </div>

          {/* Date to */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900"
            />
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
                            <div className="min-w-[220px] max-w-full">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Location</p>
                              <p className="text-slate-700 mt-1 text-sm">{row.location_name ? `${row.location_name}${row.country_code ? ` (${row.country_code})` : ''}` : '—'}</p>
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
