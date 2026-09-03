"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';

function formatCsvDate(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Singapore' });
}

function formatCsvTime(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Singapore' });
}

// Same SGT-shift trick used on the Attendance page — never read local getDate()/getHours(),
// which only give the right answer if the VIEWER's device happens to be set to SGT.
function toSGT(dateInput) {
  return new Date(new Date(dateInput).getTime() + 8 * 60 * 60 * 1000);
}
function sgtDateStr(dt) {
  const d = toSGT(dt);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function sgtMinutes(dt) {
  const d = toSGT(dt);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}
function minutesToLabel(mins) {
  const wrapped = ((Math.round(mins) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function isOvernightShift(row) {
  if (!row.clock_in_time) return false;
  const inHour = toSGT(row.clock_in_time).getUTCHours();
  if (inHour >= 22 || inHour < 6) return true;
  if (row.clock_out_time) {
    const inDate = toSGT(row.clock_in_time);
    const outDate = toSGT(row.clock_out_time);
    return outDate.getUTCDate() !== inDate.getUTCDate() || outDate.getUTCMonth() !== inDate.getUTCMonth();
  }
  return false;
}

// yyyy-mm-dd math done on UTC-noon anchors so DST-less SGT date arithmetic never rolls
// over to the wrong calendar day.
function parseDateStr(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}
function toDateStr(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

function getPeriodRange(periodType, anchorDateStr) {
  const anchor = parseDateStr(anchorDateStr || toDateStr(new Date()));
  if (periodType === 'daily') {
    return { startStr: toDateStr(anchor), endStr: toDateStr(anchor), label: anchor.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) };
  }
  if (periodType === 'monthly') {
    const start = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1, 12));
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0, 12));
    return { startStr: toDateStr(start), endStr: toDateStr(end), label: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  }
  // weekly — Monday to Sunday
  const dow = anchor.getUTCDay() === 0 ? 7 : anchor.getUTCDay();
  const start = addDays(anchor, 1 - dow);
  const end = addDays(start, 6);
  const label = `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })} – ${end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
  return { startStr: toDateStr(start), endStr: toDateStr(end), label };
}

// The anchor date one period back — feeds getPeriodRange again to get a real
// "vs. prior period" comparison instead of a made-up delta.
function getPreviousAnchor(periodType, anchorDateStr) {
  const anchor = parseDateStr(anchorDateStr || toDateStr(new Date()));
  if (periodType === 'daily') return toDateStr(addDays(anchor, -1));
  if (periodType === 'weekly') return toDateStr(addDays(anchor, -7));
  const prevMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - 1, 1, 12));
  return toDateStr(prevMonth);
}

// Real, approved leave overlapping the period — used to explain a low-hours reading
// instead of leaving a shareholder to guess whether it means low productivity.
function getLeaveNote(leaveRequests, userId, startStr, endStr) {
  const overlapping = leaveRequests.filter((l) => {
    if (l.user_id !== userId || String(l.workflow_status).toUpperCase() !== 'APPROVED') return false;
    const lStart = String(l.start_date).slice(0, 10), lEnd = String(l.end_date).slice(0, 10);
    return lStart <= endStr && lEnd >= startStr;
  });
  if (overlapping.length === 0) return null;
  const totalDays = overlapping.reduce((sum, l) => {
    const s = parseDateStr(String(l.start_date).slice(0, 10)), e = parseDateStr(String(l.end_date).slice(0, 10));
    return sum + Math.round((e - s) / 86400000) + 1;
  }, 0);
  const category = (overlapping[0].category || 'leave').toLowerCase();
  return `${totalDays} day${totalDays === 1 ? '' : 's'} of approved ${category} leave overlaps this period`;
}

function niceMax(value) {
  if (value <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const rounded = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return rounded * pow;
}

const CHART_W = 800, CHART_H = 340, PLOT_L = 70, PLOT_R = 780, PLOT_T = 36, PLOT_B = 296;

function ClockInChart({ sessions }) {
  const points = sessions
    .filter((s) => s.clock_in_time)
    .sort((a, b) => new Date(a.clock_in_time) - new Date(b.clock_in_time))
    .map((s) => ({ minutes: sgtMinutes(s.clock_in_time), dateLabel: formatCsvDate(s.clock_in_time).slice(0, 5) }));

  if (points.length === 0) {
    return <p className="text-sm text-slate-400 italic">No clock-in times in this period.</p>;
  }

  const allMinutes = points.map((p) => p.minutes);
  const rawMin = Math.min(...allMinutes), rawMax = Math.max(...allMinutes);
  const span = Math.max(rawMax - rawMin, 60);
  const axisMin = Math.max(0, rawMin - span * 0.2);
  const axisMax = Math.min(1440, rawMax + span * 0.2);
  const y = (m) => PLOT_T + ((m - axisMin) / (axisMax - axisMin || 1)) * (PLOT_B - PLOT_T);
  const x = (i) => points.length <= 1 ? (PLOT_L + PLOT_R) / 2 : PLOT_L + (i * (PLOT_R - PLOT_L)) / (points.length - 1);

  const ticks = Array.from({ length: 4 }, (_, i) => axisMin + ((axisMax - axisMin) * i) / 3);
  const coords = points.map((p, i) => ({ cx: x(i), cy: y(p.minutes), ...p }));

  const areaPath = `M${coords[0].cx},${PLOT_B} ${coords.map((c) => `L${c.cx},${c.cy}`).join(' ')} L${coords[coords.length - 1].cx},${PLOT_B} Z`;

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto">
      <defs>
        <linearGradient id="clockInFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1540A8" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#1540A8" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PLOT_L} y1={y(t)} x2={PLOT_R} y2={y(t)} stroke="#E2E6EF" strokeWidth="1" />
          <text x="0" y={y(t) + 4} fontSize="11" fontWeight="500" fill="#5B6478" fontFamily="ui-monospace, monospace">{minutesToLabel(t)}</text>
        </g>
      ))}
      <path d={areaPath} fill="url(#clockInFill)" />
      <polyline
        fill="none" stroke="#1540A8" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"
        points={coords.map((c) => `${c.cx},${c.cy}`).join(' ')}
      />
      {coords.map((c, i) => (
        <g key={i}>
          <circle cx={c.cx} cy={c.cy} r="5" fill="#fff" stroke="#1540A8" strokeWidth="2.5" />
          <text x={c.cx} y={PLOT_B + 22} fontSize="10.5" fontWeight="500" fill="#5B6478" textAnchor="middle" fontFamily="ui-monospace, monospace">{c.dateLabel}</text>
        </g>
      ))}
    </svg>
  );
}

function HoursBarChart({ sessions }) {
  const byDate = new Map();
  for (const s of sessions) {
    if (!s.clock_in_time) continue;
    const d = sgtDateStr(s.clock_in_time);
    const h = Number(s.daily_worktime_hours) || 0;
    byDate.set(d, (byDate.get(d) || 0) + h);
  }
  const dates = Array.from(byDate.keys()).sort();
  if (dates.length === 0) {
    return <p className="text-sm text-slate-400 italic">No completed hours in this period.</p>;
  }
  const max = niceMax(Math.max(...dates.map((d) => byDate.get(d))));
  const slot = (PLOT_R - PLOT_L) / dates.length;
  const barWidth = Math.max(8, Math.min(48, slot * 0.55));
  const yFor = (v) => PLOT_B - (v / max) * (PLOT_B - PLOT_T);
  const ticks = 4;

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto">
      <defs>
        <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2E5FCB" />
          <stop offset="100%" stopColor="#1540A8" />
        </linearGradient>
      </defs>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (max * i) / ticks;
        return (
          <g key={i}>
            <line x1={PLOT_L} y1={yFor(v)} x2={PLOT_R} y2={yFor(v)} stroke="#E2E6EF" strokeWidth="1" />
            <text x="0" y={yFor(v) + 4} fontSize="11" fontWeight="500" fill="#5B6478" fontFamily="ui-monospace, monospace">{v.toFixed(0)}h</text>
          </g>
        );
      })}
      {dates.map((d, i) => {
        const val = byDate.get(d);
        const cx = PLOT_L + slot * i + slot / 2;
        const barH = PLOT_B - yFor(val);
        const labelY = Math.max(yFor(val) - 8, PLOT_T - 14);
        return (
          <g key={d}>
            <rect x={cx - barWidth / 2} y={yFor(val)} width={barWidth} height={Math.max(barH, 1)} rx="5" fill="url(#barFill)" />
            <text x={cx} y={labelY} fontSize="10.5" fontWeight="600" fill="#10172A" textAnchor="middle" fontFamily="ui-monospace, monospace">{val.toFixed(1)}h</text>
            <text x={cx} y={PLOT_B + 22} fontSize="10.5" fontWeight="500" fill="#5B6478" textAnchor="middle" fontFamily="ui-monospace, monospace">{d.slice(5)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function computeReportStats(sessions) {
  const totalHours = sessions.reduce((sum, s) => sum + (Number(s.daily_worktime_hours) || 0), 0);
  const otHours = sessions.reduce((sum, s) => sum + (Number(s.ot_hours_accrued) || 0), 0);
  const daysWorked = new Set(sessions.filter((s) => s.clock_in_time).map((s) => sgtDateStr(s.clock_in_time))).size;
  const clockInMinutes = sessions.filter((s) => s.clock_in_time).map((s) => sgtMinutes(s.clock_in_time));
  const avgClockInMinutes = clockInMinutes.length > 0 ? clockInMinutes.reduce((a, b) => a + b, 0) / clockInMinutes.length : null;
  const avgClockIn = avgClockInMinutes != null ? minutesToLabel(avgClockInMinutes) : '—';
  const projectCodes = new Set();
  sessions.forEach((s) => (Array.isArray(s.allocations) ? s.allocations : []).forEach((a) => a.project_code && projectCodes.add(a.project_code)));
  const generalSessionsCount = sessions.filter((s) => (Array.isArray(s.allocations) ? s.allocations : []).some((a) => !a.project_code)).length;
  const flagged = sessions.filter(isOvernightShift);
  const sorted = [...sessions].sort((a, b) => new Date(a.clock_in_time) - new Date(b.clock_in_time));

  // Billable = time actually allocated to a project code; non-billable = General/admin work.
  // Falls back to the session-level project_code when a session has no per-allocation
  // breakdown (older entries), since that's still real recorded data either way.
  // Classified per session, not per allocation — `accumulated_hours` on an allocation is a
  // running lifetime total for that project code, not scoped to this period, so summing it
  // across sessions double-counts and can exceed the session's own daily_worktime_hours.
  // A session counts as billable if any of its allocations name a project code; a mixed
  // session's hours split evenly across the codes it touched for the project breakdown below.
  let billableHours = 0, nonBillableHours = 0;
  const projectHoursMap = new Map();
  sessions.forEach((s) => {
    const allocations = Array.isArray(s.allocations) ? s.allocations : [];
    const sessionHours = Number(s.daily_worktime_hours) || 0;
    const codes = allocations.filter((a) => a.project_code).map((a) => a.project_code);
    const codesList = codes.length > 0 ? codes : (s.project_code ? [s.project_code] : []);
    if (codesList.length > 0) {
      billableHours += sessionHours;
      const share = sessionHours / codesList.length;
      codesList.forEach((code) => projectHoursMap.set(code, (projectHoursMap.get(code) || 0) + share));
    } else {
      nonBillableHours += sessionHours;
    }
  });
  const projectHours = Array.from(projectHoursMap.entries())
    .map(([code, hours]) => ({ code, hours }))
    .sort((a, b) => b.hours - a.hours);

  return {
    totalHours, otHours, daysWorked, avgClockIn, avgClockInMinutes, projectCodes, generalSessionsCount,
    flagged, sorted, billableHours, nonBillableHours, projectHours,
  };
}

const MICRO_SESSION_HOURS = 0.1; // ~6 minutes

// For the shareholder-facing PDF only: same-day General/admin sessions under six minutes
// each (a quick check-in, a one-line status update) get folded into one "Admin check-ins"
// row per day instead of listing every tiny entry, which otherwise reads as fragmented
// focus rather than what it actually is — routine admin overhead.
function consolidateMicroSessions(sorted) {
  const kept = [];
  const microByDate = new Map();

  for (const s of sorted) {
    const allocations = Array.isArray(s.allocations) ? s.allocations : [];
    const isGeneralOnly = allocations.length > 0 ? allocations.every((a) => !a.project_code) : !s.project_code;
    const hours = Number(s.daily_worktime_hours) || 0;
    if (isGeneralOnly && s.clock_out_time && hours > 0 && hours < MICRO_SESSION_HOURS) {
      const dateKey = sgtDateStr(s.clock_in_time);
      if (!microByDate.has(dateKey)) {
        microByDate.set(dateKey, { dateKey, firstClockIn: s.clock_in_time, hours: 0, count: 0, descriptions: [], remarks: [] });
      }
      const bucket = microByDate.get(dateKey);
      bucket.hours += hours;
      bucket.count += 1;
      const desc = allocations.find((a) => !a.project_code)?.description;
      if (desc) bucket.descriptions.push(desc);
      if (s.remark) bucket.remarks.push(s.remark);
    } else {
      kept.push(s);
    }
  }

  for (const bucket of microByDate.values()) {
    kept.push({
      attendance_id: `consolidated-${bucket.dateKey}`,
      __consolidatedCount: bucket.count,
      clock_in_time: bucket.firstClockIn,
      clock_out_time: bucket.firstClockIn,
      daily_worktime_hours: bucket.hours,
      ot_hours_accrued: 0,
      allocations: [{ description: bucket.descriptions.join('; ') || null }],
      remark: bucket.remarks.join('; ') || null,
      project_code: null,
    });
  }

  return kept.sort((a, b) => new Date(a.clock_in_time) - new Date(b.clock_in_time));
}

function ActivityLogTable({ sorted }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-[#EAF0FF] text-[#33415C] font-semibold uppercase tracking-wider text-xs">
          <tr>
            <th className="px-4 py-2.5 text-left sticky left-0 bg-[#EAF0FF] z-10">Project Code(s)</th>
            <th className="px-4 py-2.5 text-left">Clock In</th>
            <th className="px-4 py-2.5 text-left">Clock Out</th>
            <th className="px-4 py-2.5 text-left">Hours</th>
            <th className="px-4 py-2.5 text-left">Description</th>
            <th className="px-4 py-2.5 text-left">Remark</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((s) => {
            const allocations = Array.isArray(s.allocations) ? s.allocations : [];
            const projectAllocs = allocations.filter((a) => a.project_code);
            const generalAlloc = allocations.find((a) => !a.project_code);
            const codes = projectAllocs.length > 0 ? projectAllocs.map((a) => a.project_code) : (s.project_code ? [s.project_code] : (generalAlloc ? ['General'] : []));
            const overnight = isOvernightShift(s);
            const consolidatedCount = s.__consolidatedCount;
            const rowBg = overnight ? 'bg-amber-50' : consolidatedCount ? 'bg-slate-50' : 'bg-white';
            const descriptionLines = [
              ...(generalAlloc?.description ? [{ key: 'general', label: 'General', text: generalAlloc.description }] : []),
              ...projectAllocs.filter((a) => a.description).map((a) => ({ key: a.project_code, label: a.project_code, text: a.description })),
            ];
            return (
              <tr key={s.attendance_id} className={overnight ? 'border-l-4 border-amber-400' : undefined}>
                <td className={`px-4 py-2.5 whitespace-nowrap sticky left-0 z-10 ${rowBg}`}>
                  {overnight && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-800 bg-amber-200 rounded-full px-2 py-0.5 mr-1.5 align-middle">
                      ⚠ Flagged
                    </span>
                  )}
                  {consolidatedCount ? (
                    <span className="inline-block font-mono text-xs bg-slate-100 border border-slate-200 text-slate-600 rounded px-2 py-0.5">General (admin)</span>
                  ) : codes.map((c) => (
                    <span key={c} className="inline-block font-mono text-xs bg-[#EAF0FF] border border-[#C9D9FB] text-[#0E2E7A] rounded px-2 py-0.5 mr-1 mb-1">{c}</span>
                  ))}
                </td>
                {consolidatedCount ? (
                  <td className={`px-4 py-2.5 text-slate-500 italic ${rowBg}`} colSpan={2}>
                    {formatCsvDate(s.clock_in_time)} — {consolidatedCount} admin check-ins, consolidated
                  </td>
                ) : (
                  <>
                    <td className={`px-4 py-2.5 whitespace-nowrap ${rowBg}`}>
                      <div>{formatCsvDate(s.clock_in_time)}</div>
                      <div className="font-mono text-xs text-slate-500">{formatCsvTime(s.clock_in_time)}</div>
                    </td>
                    {s.clock_out_time ? (
                      <td className={`px-4 py-2.5 whitespace-nowrap ${rowBg}`}>
                        <div>{formatCsvDate(s.clock_out_time)}</div>
                        <div className="font-mono text-xs text-slate-500">{formatCsvTime(s.clock_out_time)}</div>
                      </td>
                    ) : (
                      <td className={`px-4 py-2.5 font-semibold text-green-600 ${rowBg}`}>Ongoing</td>
                    )}
                  </>
                )}
                <td className={`px-4 py-2.5 font-mono whitespace-nowrap ${rowBg}`}>
                  <div>{s.daily_worktime_hours != null ? `${Number(s.daily_worktime_hours).toFixed(2)}h` : '—'}</div>
                  {Number(s.ot_hours_accrued) > 0 && (
                    <div className="text-xs font-semibold text-amber-700">+{Number(s.ot_hours_accrued).toFixed(2)}h OT</div>
                  )}
                </td>
                <td className={`px-4 py-2.5 max-w-[260px] ${rowBg}`}>
                  {consolidatedCount ? (
                    <span className="text-slate-500 italic">Admin check-ins consolidated</span>
                  ) : descriptionLines.length > 0 ? (
                    descriptionLines.map((d) => (
                      <div key={d.key}>{descriptionLines.length > 1 && <span className="font-semibold">{d.label}: </span>}{d.text}</div>
                    ))
                  ) : (
                    <span className="text-slate-400 italic">—</span>
                  )}
                </td>
                <td className={`px-4 py-2.5 max-w-[180px] ${rowBg}`}>{s.remark || <span className="text-slate-400 italic">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Collapsible wrapper for a section of the on-screen report — lets HR scan the high-level
// totals first, then open a section for the line-by-line detail. Print/PDF is unaffected;
// this only wraps EmployeeReport's on-screen sections.
function CollapsibleSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left mb-2"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-slate-700">{title}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          className={`flex-shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && children}
    </div>
  );
}

// On-screen report card — the original compact layout, unchanged since before the
// shareholder-template redesign. The fancier template lives only in EmployeeReportPrint,
// captured off-screen for the PDF, so this stays whatever the portal itself should look like.
function EmployeeReport({ employee, sessions, periodLabel }) {
  const { totalHours, otHours, daysWorked, avgClockIn, projectCodes, flagged, sorted } = computeReportStats(sessions);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center gap-4 px-8 py-5 border-b border-slate-200 bg-[#EAF0FF]">
        <div className="w-11 h-11 rounded-full bg-[#1540A8] text-white flex items-center justify-center font-semibold text-lg flex-shrink-0">
          {(employee.full_name || '?').trim().charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 truncate">{employee.full_name}</p>
          <p className="text-xs text-slate-500">{employee.email || '—'}</p>
        </div>
        <div className="flex flex-wrap gap-1.5 justify-end">
          {projectCodes.size > 0 ? Array.from(projectCodes).map((c) => (
            <span key={c} className="text-[11px] font-mono font-medium rounded-full bg-white border border-[#C9D9FB] text-[#0E2E7A] px-2.5 py-0.5">{c}</span>
          )) : <span className="text-[11px] text-slate-400">No project codes</span>}
        </div>
      </div>

      <div className="px-9 py-7">
        <p className="text-xs font-mono font-semibold uppercase tracking-[0.16em] text-[#1540A8] mb-3">{periodLabel}</p>

        <div className="mb-6">
          <CollapsibleSection title="Activity summary" defaultOpen>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                ['Hours logged', `${totalHours.toFixed(2)}h`],
                ['Days worked', String(daysWorked)],
                ['Overtime', `${otHours.toFixed(2)}h`],
                ['Avg. clock-in', avgClockIn],
                ['Project codes', String(projectCodes.size)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="font-mono text-xl font-semibold text-slate-900">{value}</div>
                  <div className="text-xs text-slate-500 mt-1">{label}</div>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-slate-400 italic mb-2">No attendance sessions logged in this period.</p>
        ) : (
          <>
            <div className="mb-6">
              <CollapsibleSection title="Visual charts" defaultOpen>
                <div className="grid md:grid-cols-2 gap-8">
                  <div>
                    <p className="text-base font-semibold text-slate-900 mb-2">Clock-in time by session</p>
                    <ClockInChart sessions={sessions} />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-slate-900 mb-2">Hours logged per day</p>
                    <HoursBarChart sessions={sessions} />
                  </div>
                </div>

                {flagged.length > 0 && (
                  <div className="mt-6 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold">!</span>
                    <p className="text-sm text-amber-800">
                      {flagged.length} session{flagged.length > 1 ? 's' : ''} auto-flagged as overnight / unusual-hours shifts — see the highlighted rows below.
                    </p>
                  </div>
                )}
              </CollapsibleSection>
            </div>

            <CollapsibleSection title="Full activity log" defaultOpen>
              <ActivityLogTable sorted={sorted} />
            </CollapsibleSection>
          </>
        )}
      </div>
    </div>
  );
}

const FRAUNCES = { fontFamily: "'Fraunces', Georgia, serif" };
const PLEX_MONO = { fontFamily: "'IBM Plex Mono', ui-monospace, monospace" };

// Print-only report card — the fuller shareholder-report template (masthead, subject strip,
// serif headings, real "vs. prior period" deltas). Rendered off-screen purely so the PDF can
// capture it; the visible portal page always shows EmployeeReport above instead.
function EmployeeReportPrint({ employee, sessions, periodLabel, priorHours = 0, daysInPeriod = 7, leaveNote = null }) {
  const {
    totalHours, otHours, daysWorked, avgClockIn, avgClockInMinutes, projectCodes, generalSessionsCount,
    flagged, sorted, billableHours, nonBillableHours, projectHours,
  } = computeReportStats(sessions);

  const billablePct = totalHours > 0 ? (billableHours / totalHours) * 100 : 0;
  const firstName = (employee.full_name || 'They').trim().split(' ')[0];

  const hoursDeltaPct = priorHours > 0 ? ((totalHours - priorHours) / priorHours) * 100 : null;
  let hoursCaption = hoursDeltaPct == null
    ? 'No prior period to compare'
    : `${hoursDeltaPct >= 0 ? '▲' : '▼'} ${Math.abs(hoursDeltaPct).toFixed(0)}% vs. prior period`;
  if (leaveNote) hoursCaption += ` — ${leaveNote}`;
  const hoursCaptionColor = hoursDeltaPct == null ? '#5B6478' : hoursDeltaPct >= 0 ? '#157F52' : '#B4650C';

  const otCaption = flagged.length > 0 ? `${flagged.length} flagged shift${flagged.length > 1 ? 's' : ''}` : 'No flagged shifts';
  const otCaptionColor = flagged.length > 0 ? '#B4650C' : '#157F52';

  const clockInCaption = avgClockInMinutes == null ? '—' : avgClockInMinutes <= 555 ? 'Within policy' : 'After 9:15 am policy line';
  const clockInCaptionColor = avgClockInMinutes == null ? '#5B6478' : avgClockInMinutes <= 555 ? '#157F52' : '#B4650C';

  const codesCaption = generalSessionsCount > 0 ? '+ General work' : 'No general work logged';

  const execSummary = sessions.length === 0
    ? `${firstName} logged no attendance sessions during ${periodLabel}.${leaveNote ? ` ${leaveNote}.` : ''}`
    : `${firstName} logged ${totalHours.toFixed(1)}h across ${daysWorked} of ${daysInPeriod} days this period, `
      + `${billablePct.toFixed(0)}% of it billed to ${projectCodes.size} active project code${projectCodes.size === 1 ? '' : 's'}`
      + `${nonBillableHours > 0 ? ` and ${nonBillableHours.toFixed(1)}h on general/admin work` : ''}. `
      + `${leaveNote ? `${leaveNote}. ` : ''}`
      + `${flagged.length > 0 ? `${flagged.length} session${flagged.length > 1 ? 's were' : ' was'} auto-flagged for unusual hours — see below for context.` : 'No attendance anomalies were flagged this period.'}`;

  return (
    <div className="bg-white">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      {/* Each data-pdf-block is captured and placed on the PDF as its own image, so a page
          break can only ever fall between blocks — never through the middle of a chart,
          the KPI grid, or a table row. */}
      <div data-pdf-block className="flex items-start justify-between gap-6 px-12 pt-10 pb-9 border-b border-slate-200">
        <div>
          <p className="text-sm font-semibold text-[#1540A8]" style={PLEX_MONO}>nextan <span className="text-slate-400 font-normal">/ HR Portal</span></p>
          <h2 className="mt-3 text-4xl font-semibold text-[#10172A]" style={FRAUNCES}>Staff Activity Report</h2>
          <p className="mt-2 text-base text-[#5B6478] max-w-md">Attendance, project allocation and punctuality summary, prepared for the shareholder review pack.</p>
        </div>
        <div className="text-right text-sm text-[#5B6478] leading-relaxed whitespace-nowrap">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5B6478]" style={PLEX_MONO}>Reporting period</p>
          <p className="font-semibold text-[#10172A] text-base">{periodLabel}</p>
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#5B6478]" style={PLEX_MONO}>Generated</p>
          <p className="font-semibold text-[#10172A] text-base">{new Date().toLocaleString('en-SG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' })}</p>
        </div>
      </div>

      <div data-pdf-block className="flex items-center gap-5 px-12 py-6 border-b border-[#C9D9FB] bg-[#EAF0FF]">
        <div className="w-16 h-16 rounded-full bg-[#1540A8] text-white flex items-center justify-center font-semibold text-2xl flex-shrink-0" style={FRAUNCES}>
          {(employee.full_name || '?').trim().charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-[#10172A] text-xl truncate">{employee.full_name}</p>
          <p className="text-sm text-[#5B6478]">{employee.email || '—'}</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          {projectCodes.size > 0 ? Array.from(projectCodes).map((c) => (
            <span key={c} className="text-sm font-medium rounded-full bg-white border border-[#C9D9FB] text-[#0E2E7A] px-3.5 py-1" style={PLEX_MONO}>{c}</span>
          )) : <span className="text-sm text-slate-400">No project codes</span>}
        </div>
      </div>

      <div data-pdf-block className="px-12 pt-9 pb-9 border-b border-slate-200 bg-slate-50">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>Executive summary</p>
        <p className="text-base text-[#10172A] leading-relaxed max-w-3xl">{execSummary}</p>
      </div>

      <div data-pdf-block className={sessions.length === 0 ? 'px-12 pt-10 pb-10' : 'px-12 pt-10 pb-8'}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>At a glance</p>
        <h3 className="text-2xl font-semibold text-[#10172A] mb-6" style={FRAUNCES}>Activity summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            ['Hours logged', `${totalHours.toFixed(2)}h`, hoursCaption, hoursCaptionColor],
            ['Billable hours', `${billableHours.toFixed(2)}h`, `${billablePct.toFixed(0)}% of hours logged`, '#157F52'],
            ['Non-billable', `${nonBillableHours.toFixed(2)}h`, 'General / admin work', '#5B6478'],
            ['Days worked', String(daysWorked), `of ${daysInPeriod} day${daysInPeriod === 1 ? '' : 's'}`, '#5B6478'],
            ['Overtime', `${otHours.toFixed(2)}h`, otCaption, otCaptionColor],
            ['Avg. clock-in', avgClockIn, clockInCaption, clockInCaptionColor],
            ['Project codes', String(projectCodes.size), codesCaption, '#5B6478'],
          ].map(([label, value, caption, captionColor]) => (
            <div key={label} className="rounded-2xl border border-slate-200 px-5 py-4">
              <div className="text-xl font-semibold text-[#10172A] whitespace-nowrap" style={PLEX_MONO}>{value}</div>
              <div className="text-sm text-[#5B6478] mt-1.5">{label}</div>
              <div className="text-xs font-semibold mt-2" style={{ color: captionColor }}>{caption}</div>
            </div>
          ))}
        </div>
        {sessions.length === 0 && (
          <p className="text-base text-slate-400 italic mt-8">No attendance sessions logged in this period.</p>
        )}
      </div>

      {sessions.length > 0 && (
        <>
          {/* Heading and its first chart share one block — a heading alone can fit at the
              bottom of a page while its content spills to the next, orphaning the title. */}
          <div data-pdf-block className="px-12 pb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>Visual summary</p>
            <h3 className="text-2xl font-semibold text-[#10172A] mb-6" style={FRAUNCES}>When {(employee.full_name || 'they').split(' ')[0]} clocks in, and how the hours land</h3>
            <p className="text-base font-semibold text-[#10172A] mb-2">Clock-in time by session</p>
            <ClockInChart sessions={sessions} />
          </div>

          <div data-pdf-block className="px-12 pb-8">
            <p className="text-base font-semibold text-[#10172A] mb-2">Hours logged per day</p>
            <HoursBarChart sessions={sessions} />
          </div>

          {projectHours.length > 0 && (
            <div data-pdf-block className="px-12 pb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>Project activity breakdown</p>
              <h3 className="text-2xl font-semibold text-[#10172A] mb-1" style={FRAUNCES}>Where the billable hours went</h3>
              <p className="text-xs text-[#5B6478] mb-5">Hours per project code — a proxy for activity, not a milestone or completion measure (not tracked in this system).</p>
              <div className="flex flex-col gap-2.5">
                {projectHours.map(({ code, hours }) => {
                  const pct = billableHours > 0 ? (hours / billableHours) * 100 : 0;
                  return (
                    <div key={code} className="flex items-center gap-3">
                      <span className="text-xs font-medium rounded bg-[#EAF0FF] border border-[#C9D9FB] text-[#0E2E7A] px-2 py-1 w-28 flex-shrink-0 text-center" style={PLEX_MONO}>{code}</span>
                      <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full bg-[#1540A8]" style={{ width: `${Math.max(pct, 3)}%` }} />
                      </div>
                      <span className="text-sm font-semibold text-[#10172A] w-20 flex-shrink-0 text-right" style={PLEX_MONO}>{hours.toFixed(2)}h</span>
                      <span className="text-xs text-[#5B6478] w-12 flex-shrink-0 text-right">{pct.toFixed(0)}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {flagged.length > 0 && (
            <div data-pdf-block className="px-12 pb-8">
              <div className="flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold">!</span>
                <div className="flex-1">
                  <p className="text-sm text-amber-800 mb-2">
                    {flagged.length} session{flagged.length > 1 ? 's' : ''} auto-flagged as overnight / unusual-hours shifts — see the highlighted rows below.
                  </p>
                  <div className="flex flex-col gap-1">
                    {flagged.map((s) => (
                      <p key={s.attendance_id} className="text-xs text-amber-900">
                        <span className="font-semibold">{formatCsvDate(s.clock_in_time)}:</span>{' '}
                        {s.remark ? s.remark : <span className="italic">no context on file — recommend a note or manager approval status be added</span>}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div data-pdf-block className="px-12 pb-10">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>Supporting detail</p>
            <h3 className="text-2xl font-semibold text-[#10172A] mb-1" style={FRAUNCES}>Full activity log</h3>
            <p className="text-xs text-[#5B6478] mb-5">Same-day admin check-ins under six minutes are consolidated into one row.</p>
            <ActivityLogTable sorted={consolidateMicroSessions(sorted)} />
          </div>
        </>
      )}
    </div>
  );
}

export default function ReportsPage() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requesterId, setRequesterId] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [periodType, setPeriodType] = useState('weekly');
  const [anchorDate, setAnchorDate] = useState(() => toDateStr(new Date()));
  const [history, setHistory] = useState([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setRequesterId(u.user_id);
    } catch {}
    try {
      setHistory(JSON.parse(localStorage.getItem('hr_reports_history') || '[]'));
    } catch {}
  }, []);

  useEffect(() => {
    if (!requesterId) return;
    setLoading(true);
    Promise.all([
      axios.get(`${backendBaseUrl}/api/v1/hr/attendance-logs?requesterId=${requesterId}`),
      axios.get(`${backendBaseUrl}/api/v1/hr/active-users?requesterId=${requesterId}`),
      axios.get(`${backendBaseUrl}/api/v1/hr/leave-requests?requesterId=${requesterId}`),
    ])
      .then(([logsRes, usersRes, leaveRes]) => {
        setRows(logsRes.data.data || []);
        setEmployees(usersRes.data.data || []);
        setLeaveRequests(leaveRes.data.data || []);
      })
      .catch(() => { setRows([]); setEmployees([]); setLeaveRequests([]); })
      .finally(() => setLoading(false));
  }, [requesterId, backendBaseUrl]);

  const periodRange = useMemo(() => getPeriodRange(periodType, anchorDate), [periodType, anchorDate]);
  const daysInPeriod = useMemo(() => {
    const start = parseDateStr(periodRange.startStr), end = parseDateStr(periodRange.endStr);
    return Math.round((end - start) / 86400000) + 1;
  }, [periodRange]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (!r.clock_in_time) return false;
      const d = sgtDateStr(r.clock_in_time);
      if (d < periodRange.startStr || d > periodRange.endStr) return false;
      if (employeeFilter !== 'all' && r.user_id !== employeeFilter) return false;
      return true;
    });
  }, [rows, periodRange, employeeFilter]);

  const employeesInScope = useMemo(() => {
    if (employeeFilter !== 'all') {
      const emp = employees.find((e) => e.user_id === employeeFilter);
      if (!emp) return [];
      return [{ ...emp, sessions: filteredRows }];
    }
    const byUser = new Map();
    for (const r of filteredRows) {
      if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
      byUser.get(r.user_id).push(r);
    }
    return Array.from(byUser.entries())
      .map(([userId, sessions]) => {
        const emp = employees.find((e) => e.user_id === userId) || { user_id: userId, full_name: sessions[0]?.full_name };
        return { ...emp, sessions };
      })
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [employeeFilter, employees, filteredRows]);

  // Prior-period hours per employee, purely so the PDF can show a real "vs. prior period"
  // delta instead of a made-up one.
  const priorHoursByUser = useMemo(() => {
    const priorRange = getPeriodRange(periodType, getPreviousAnchor(periodType, anchorDate));
    const totals = new Map();
    for (const r of rows) {
      if (!r.clock_in_time) continue;
      const d = sgtDateStr(r.clock_in_time);
      if (d < priorRange.startStr || d > priorRange.endStr) continue;
      totals.set(r.user_id, (totals.get(r.user_id) || 0) + (Number(r.daily_worktime_hours) || 0));
    }
    return totals;
  }, [rows, periodType, anchorDate]);

  const [generating, setGenerating] = useState(false);
  // Keeps the actual generated PDF in memory (keyed by history entry timestamp) for this
  // browser tab's session only, so "Download" on a Recently Generated row is instant instead
  // of re-running the whole capture. Blobs can't survive a page reload or localStorage, so
  // older / reloaded entries fall back to "Load filters" instead.
  const blobCacheRef = useRef(new Map());

  const applyHistoryFilters = (entry) => {
    if (!entry.filters) return;
    setEmployeeFilter(entry.filters.employeeFilter);
    setPeriodType(entry.filters.periodType);
    setAnchorDate(entry.filters.anchorDate);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const redownloadFromCache = (entry) => {
    const cached = blobCacheRef.current.get(entry.generatedAt);
    if (!cached) return;
    const url = URL.createObjectURL(cached.blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = cached.filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDownload = async () => {
    const container = document.getElementById('reports-pdf-source');
    const sections = container ? Array.from(container.children) : [];
    if (sections.length === 0) return;

    setGenerating(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas-pro'),
      ]);
      // Make sure the print template's Google Fonts (Fraunces / IBM Plex) are actually loaded
      // before capture — otherwise html2canvas snapshots the fallback font mid-swap.
      if (document.fonts?.ready) await document.fonts.ready;

      const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const imgWidth = pageWidth - margin * 2;
      const usableHeight = pageHeight - margin * 2;
      let cursorY = margin;

      // Places one already-captured block. A block taller than a full page (e.g. a very
      // long activity log) still gets sliced across pages — everything else is placed
      // whole, so a page break can only ever land in the gap between two blocks.
      const placeCanvas = (canvas) => {
        const pxPerPt = canvas.width / imgWidth;
        const imgHeightPt = canvas.height / pxPerPt;

        if (imgHeightPt > usableHeight) {
          if (cursorY > margin) { pdf.addPage(); cursorY = margin; }
          const sliceHeightPx = Math.floor(usableHeight * pxPerPt);
          let yOffsetPx = 0;
          let first = true;
          while (yOffsetPx < canvas.height) {
            const thisSliceHeightPx = Math.min(sliceHeightPx, canvas.height - yOffsetPx);
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = thisSliceHeightPx;
            sliceCanvas.getContext('2d').drawImage(
              canvas, 0, yOffsetPx, canvas.width, thisSliceHeightPx, 0, 0, canvas.width, thisSliceHeightPx
            );
            if (!first) pdf.addPage();
            pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.88), 'JPEG', margin, margin, imgWidth, thisSliceHeightPx / pxPerPt);
            cursorY = margin + thisSliceHeightPx / pxPerPt;
            yOffsetPx += thisSliceHeightPx;
            first = false;
          }
          return;
        }

        if (cursorY + imgHeightPt > pageHeight - margin) {
          pdf.addPage();
          cursorY = margin;
        }
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', margin, cursorY, imgWidth, imgHeightPt);
        cursorY += imgHeightPt;
      };

      let isFirstEmployee = true;
      for (const employeeWrapper of sections) {
        if (!isFirstEmployee) { pdf.addPage(); cursorY = margin; }
        isFirstEmployee = false;

        const blocks = Array.from(employeeWrapper.querySelectorAll(':scope > [data-pdf-block]'));
        for (const block of blocks.length > 0 ? blocks : [employeeWrapper]) {
          const canvas = await html2canvas(block, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
          placeCanvas(canvas);
        }
      }

      const employeeLabel = employeeFilter === 'all' ? 'All employees' : (employees.find((e) => e.user_id === employeeFilter)?.full_name || 'Employee');
      const slug = (employeeFilter === 'all' ? 'all-employees' : employeeLabel).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const filename = `attendance-report-${slug}-${periodType}-${periodRange.startStr}.pdf`;
      pdf.save(filename);

      const generatedAt = new Date().toISOString();
      blobCacheRef.current.set(generatedAt, { blob: pdf.output('blob'), filename });

      const entry = {
        employeeLabel, periodType, rangeLabel: periodRange.label, generatedAt,
        filters: { employeeFilter, periodType, anchorDate },
      };
      const next = [entry, ...history].slice(0, 8);
      setHistory(next);
      try { localStorage.setItem('hr_reports_history', JSON.stringify(next)); } catch {}
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-900">Reports</h1>
        <p className="mt-2 text-sm text-slate-500">Generate a shareholder-ready PDF activity report for one employee or all staff.</p>
      </div>

      <div className="sticky top-0 z-20 mb-8 rounded-3xl border border-slate-200 bg-white p-4 shadow-md">
        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Employee</label>
            <select value={employeeFilter} onChange={(e) => setEmployeeFilter(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900">
              <option value="all">All employees</option>
              {employees.map((e) => <option key={e.user_id} value={e.user_id}>{e.full_name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Period</label>
            <select value={periodType} onChange={(e) => setPeriodType(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900">
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">
              {periodType === 'daily' ? 'Day' : periodType === 'monthly' ? 'Month' : 'Week containing'}
            </label>
            <input type="date" value={anchorDate} onChange={(e) => setAnchorDate(e.target.value)}
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900" />
            <p className="mt-1.5 text-xs font-medium text-[#1540A8]">→ {periodRange.label}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <p className="text-xs text-slate-500">
            {employeeFilter === 'all' ? 'All employees' : employees.find((e) => e.user_id === employeeFilter)?.full_name || ''} &middot; {periodRange.label} &middot; {loading ? 'loading…' : `${employeesInScope.length} employee${employeesInScope.length === 1 ? '' : 's'} with data`}
          </p>
          <button
            onClick={handleDownload}
            disabled={loading || generating || employeesInScope.length === 0}
            title={!loading && employeesInScope.length === 0 ? 'No attendance records to include in a report' : undefined}
            className="rounded-3xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating PDF…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Recently generated (this browser)</p>
            {history.length > 5 && (
              <button onClick={() => setHistoryExpanded((v) => !v)} className="text-xs font-semibold text-[#1540A8]">
                {historyExpanded ? 'Show less' : `Show all (${history.length})`}
              </button>
            )}
          </div>
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 uppercase tracking-wider text-xs">
                <tr>
                  <th className="px-5 py-3 text-left">Report / Filter</th>
                  <th className="px-5 py-3 text-left">Period</th>
                  <th className="px-5 py-3 text-left">Generated on</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(historyExpanded ? history : history.slice(0, 5)).map((h, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3 text-slate-700 whitespace-nowrap">{h.employeeLabel}</td>
                    <td className="px-5 py-3 text-slate-500 whitespace-nowrap"><span className="capitalize">{h.periodType}</span> &middot; {h.rangeLabel}</td>
                    <td className="px-5 py-3 text-xs text-slate-400 whitespace-nowrap">{new Date(h.generatedAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-end gap-4">
                        <button
                          onClick={() => redownloadFromCache(h)}
                          disabled={!blobCacheRef.current.has(h.generatedAt)}
                          title={blobCacheRef.current.has(h.generatedAt) ? 'Download this exact PDF again' : 'Only available for reports generated earlier this session — use Load filters instead'}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#1540A8] disabled:text-slate-300 disabled:cursor-not-allowed"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
                          </svg>
                          Download
                        </button>
                        <button
                          onClick={() => applyHistoryFilters(h)}
                          disabled={!h.filters}
                          title={h.filters ? 'Set the filters above to match this report' : 'Filters unavailable for this older entry'}
                          className="text-xs font-semibold text-[#1540A8] disabled:text-slate-300 disabled:cursor-not-allowed"
                        >
                          Load filters
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div id="reports-print-area" className="space-y-6">
        {loading ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Loading attendance data…</div>
        ) : employeesInScope.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-8 py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF0FF]">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1540A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M8 3v4M16 3v4M3 10h18" />
                <path d="m9 15 6 6M15 15l-6 6" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-700">No attendance logged for this period</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
              {employeeFilter === 'all' ? 'No employee has' : `${employees.find((e) => e.user_id === employeeFilter)?.full_name || 'This employee'} has no`} clock-in records between <span className="font-medium text-slate-700">{periodRange.label}</span> — either no shifts fell in this range, or logs haven&apos;t synced yet.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => setAnchorDate(toDateStr(new Date()))} className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Jump to this {periodType === 'daily' ? 'day' : periodType === 'monthly' ? 'month' : 'week'}
              </button>
              {employeeFilter !== 'all' && (
                <button onClick={() => setEmployeeFilter('all')} className="rounded-2xl bg-[#1540A8] px-4 py-2 text-sm font-semibold text-white">
                  Check all employees instead
                </button>
              )}
            </div>
          </div>
        ) : (
          employeesInScope.map((emp) => (
            <EmployeeReport
              key={emp.user_id}
              employee={emp}
              sessions={emp.sessions}
              periodLabel={periodRange.label}
            />
          ))
        )}
      </div>

      {/* Off-screen — never shown, exists only so handleDownload can capture the fuller
          shareholder-report template into the PDF without changing what the portal displays. */}
      <div id="reports-pdf-source" style={{ position: 'fixed', top: 0, left: '-99999px', width: '900px' }} aria-hidden="true">
        {employeesInScope.map((emp) => (
          <EmployeeReportPrint
            key={emp.user_id}
            employee={emp}
            sessions={emp.sessions}
            periodLabel={periodRange.label}
            priorHours={priorHoursByUser.get(emp.user_id) || 0}
            daysInPeriod={daysInPeriod}
            leaveNote={getLeaveNote(leaveRequests, emp.user_id, periodRange.startStr, periodRange.endStr)}
          />
        ))}
      </div>
    </div>
  );
}
