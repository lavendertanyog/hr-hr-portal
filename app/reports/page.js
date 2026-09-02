"use client";

import React, { useEffect, useMemo, useState } from 'react';
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

function niceMax(value) {
  if (value <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const rounded = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return rounded * pow;
}

const CHART_W = 800, CHART_H = 340, PLOT_L = 60, PLOT_R = 780, PLOT_T = 24, PLOT_B = 296;

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

  return (
    <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="w-full h-auto">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={PLOT_L} y1={y(t)} x2={PLOT_R} y2={y(t)} stroke="#E2E6EF" strokeWidth="1" />
          <text x="6" y={y(t) + 4} fontSize="10" fill="#8890A3" fontFamily="ui-monospace, monospace">{minutesToLabel(t)}</text>
        </g>
      ))}
      <polyline
        fill="none" stroke="#1540A8" strokeWidth="2"
        points={coords.map((c) => `${c.cx},${c.cy}`).join(' ')}
      />
      {coords.map((c, i) => (
        <g key={i}>
          <circle cx={c.cx} cy={c.cy} r="4.5" fill="#fff" stroke="#1540A8" strokeWidth="2.4" />
          <text x={c.cx} y={PLOT_B + 18} fontSize="9.5" fill="#8890A3" textAnchor="middle" fontFamily="ui-monospace, monospace">{c.dateLabel}</text>
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
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const v = (max * i) / ticks;
        return (
          <g key={i}>
            <line x1={PLOT_L} y1={yFor(v)} x2={PLOT_R} y2={yFor(v)} stroke="#E2E6EF" strokeWidth="1" />
            <text x="6" y={yFor(v) + 4} fontSize="10" fill="#8890A3" fontFamily="ui-monospace, monospace">{v.toFixed(0)}h</text>
          </g>
        );
      })}
      {dates.map((d, i) => {
        const val = byDate.get(d);
        const cx = PLOT_L + slot * i + slot / 2;
        const barH = PLOT_B - yFor(val);
        return (
          <g key={d}>
            <rect x={cx - barWidth / 2} y={yFor(val)} width={barWidth} height={Math.max(barH, 1)} rx="3" fill="#1540A8" />
            <text x={cx} y={yFor(val) - 6} fontSize="9.5" fill="#5B6478" textAnchor="middle" fontFamily="ui-monospace, monospace">{val.toFixed(1)}h</text>
            <text x={cx} y={PLOT_B + 18} fontSize="9.5" fill="#8890A3" textAnchor="middle" fontFamily="ui-monospace, monospace">{d.slice(5)}</text>
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
  return { totalHours, otHours, daysWorked, avgClockIn, avgClockInMinutes, projectCodes, generalSessionsCount, flagged, sorted };
}

function ActivityLogTable({ sorted }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200">
      <table className="min-w-full text-xs">
        <thead className="bg-[#EAF0FF] text-[#5B6478] uppercase tracking-wider text-[10px]">
          <tr>
            <th className="px-3 py-2 text-left">Project Code(s)</th>
            <th className="px-3 py-2 text-left">Clock In Date</th>
            <th className="px-3 py-2 text-left">Clock In Time</th>
            <th className="px-3 py-2 text-left">Clock Out Date</th>
            <th className="px-3 py-2 text-left">Clock Out Time</th>
            <th className="px-3 py-2 text-left">Hours</th>
            <th className="px-3 py-2 text-left">OT Hrs</th>
            <th className="px-3 py-2 text-left">General Description</th>
            <th className="px-3 py-2 text-left">Project Description</th>
            <th className="px-3 py-2 text-left">Remark</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {sorted.map((s) => {
            const allocations = Array.isArray(s.allocations) ? s.allocations : [];
            const projectAllocs = allocations.filter((a) => a.project_code);
            const generalAlloc = allocations.find((a) => !a.project_code);
            const codes = projectAllocs.length > 0 ? projectAllocs.map((a) => a.project_code) : (s.project_code ? [s.project_code] : (generalAlloc ? ['General'] : []));
            const overnight = isOvernightShift(s);
            return (
              <tr key={s.attendance_id} className={overnight ? 'bg-amber-50/60' : undefined}>
                <td className="px-3 py-2 whitespace-nowrap">
                  {codes.map((c) => (
                    <span key={c} className="inline-block font-mono text-[10px] bg-[#EAF0FF] border border-[#C9D9FB] text-[#0E2E7A] rounded px-1.5 py-0.5 mr-1 mb-1">{c}</span>
                  ))}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{formatCsvDate(s.clock_in_time)}</td>
                <td className="px-3 py-2 whitespace-nowrap font-mono">{formatCsvTime(s.clock_in_time)}</td>
                {s.clock_out_time ? (
                  <>
                    <td className="px-3 py-2 whitespace-nowrap">{formatCsvDate(s.clock_out_time)}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-mono">{formatCsvTime(s.clock_out_time)}</td>
                  </>
                ) : (
                  <td className="px-3 py-2 font-semibold text-green-600" colSpan={2}>Ongoing</td>
                )}
                <td className="px-3 py-2 font-mono whitespace-nowrap">{s.daily_worktime_hours != null ? Number(s.daily_worktime_hours).toFixed(2) : '—'}</td>
                <td className={`px-3 py-2 font-mono whitespace-nowrap ${Number(s.ot_hours_accrued) > 0 ? 'text-amber-700 font-semibold' : ''}`}>{s.ot_hours_accrued != null ? Number(s.ot_hours_accrued).toFixed(2) : '—'}</td>
                <td className="px-3 py-2 max-w-[180px]">
                  {generalAlloc
                    ? (generalAlloc.description || <span className="text-slate-400 italic">— none —</span>)
                    : <span className="text-slate-400 italic">— n/a —</span>}
                </td>
                <td className="px-3 py-2 max-w-[220px]">
                  {projectAllocs.length > 0
                    ? projectAllocs.map((a) => <div key={a.project_code}>{a.project_code}: {a.description || <span className="text-slate-400 italic">—</span>}</div>)
                    : <span className="text-slate-400 italic">— n/a —</span>}
                </td>
                <td className="px-3 py-2 max-w-[160px]">{s.remark || <span className="text-slate-400 italic">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
        <p className="text-xs font-mono font-semibold uppercase tracking-[0.16em] text-[#1540A8] mb-1.5">{periodLabel}</p>
        <h3 className="text-2xl font-bold text-slate-900 mb-5">Activity summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-9">
          {[
            ['Hours logged', `${totalHours.toFixed(2)}h`],
            ['Days worked', String(daysWorked)],
            ['Overtime', `${otHours.toFixed(2)}h`],
            ['Avg. clock-in', avgClockIn],
            ['Project codes', String(projectCodes.size)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-2xl border border-slate-200 px-5 py-4">
              <div className="font-mono text-3xl font-bold text-slate-900">{value}</div>
              <div className="text-sm text-slate-500 mt-1.5">{label}</div>
            </div>
          ))}
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-slate-400 italic mb-2">No attendance sessions logged in this period.</p>
        ) : (
          <>
            <div className="grid md:grid-cols-2 gap-8 mb-9">
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
              <div className="mb-9 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold">!</span>
                <p className="text-sm text-amber-800">
                  {flagged.length} session{flagged.length > 1 ? 's' : ''} auto-flagged as overnight / unusual-hours shifts — see the highlighted rows below.
                </p>
              </div>
            )}

            <p className="text-sm font-semibold text-slate-700 mb-2">Full activity log</p>
            <ActivityLogTable sorted={sorted} />
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
function EmployeeReportPrint({ employee, sessions, periodLabel, priorHours = 0, daysInPeriod = 7 }) {
  const { totalHours, otHours, daysWorked, avgClockIn, avgClockInMinutes, projectCodes, generalSessionsCount, flagged, sorted } = computeReportStats(sessions);

  const hoursDeltaPct = priorHours > 0 ? ((totalHours - priorHours) / priorHours) * 100 : null;
  const hoursCaption = hoursDeltaPct == null
    ? 'No prior period to compare'
    : `${hoursDeltaPct >= 0 ? '▲' : '▼'} ${Math.abs(hoursDeltaPct).toFixed(0)}% vs. prior period`;
  const hoursCaptionColor = hoursDeltaPct == null ? '#5B6478' : hoursDeltaPct >= 0 ? '#157F52' : '#B4650C';

  const otCaption = flagged.length > 0 ? `${flagged.length} flagged shift${flagged.length > 1 ? 's' : ''}` : 'No flagged shifts';
  const otCaptionColor = flagged.length > 0 ? '#B4650C' : '#157F52';

  const clockInCaption = avgClockInMinutes == null ? '—' : avgClockInMinutes <= 555 ? 'Within policy' : 'After 9:15 am policy line';
  const clockInCaptionColor = avgClockInMinutes == null ? '#5B6478' : avgClockInMinutes <= 555 ? '#157F52' : '#B4650C';

  const codesCaption = generalSessionsCount > 0 ? '+ General work' : 'No general work logged';

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,700&family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap" rel="stylesheet" />

      <div className="flex items-start justify-between gap-6 px-12 py-9 border-b border-slate-200">
        <div>
          <p className="text-sm font-semibold text-[#1540A8]" style={PLEX_MONO}>nextan <span className="text-slate-400 font-normal">/ HR Portal</span></p>
          <h2 className="mt-3 text-4xl font-semibold text-[#10172A]" style={FRAUNCES}>Staff Activity Report</h2>
          <p className="mt-2 text-base text-[#5B6478] max-w-md">Attendance, project allocation and punctuality summary, prepared for the shareholder review pack.</p>
        </div>
        <div className="text-right text-sm text-[#5B6478] leading-relaxed whitespace-nowrap">
          <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400" style={PLEX_MONO}>Reporting period</p>
          <p className="font-semibold text-[#10172A] text-base">{periodLabel}</p>
          <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-slate-400" style={PLEX_MONO}>Generated</p>
          <p className="font-semibold text-[#10172A] text-base">{new Date().toLocaleString('en-SG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Singapore' })}</p>
        </div>
      </div>

      <div className="flex items-center gap-5 px-12 py-6 border-b border-[#C9D9FB] bg-[#EAF0FF]">
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

      <div className="px-12 py-10">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>At a glance</p>
        <h3 className="text-2xl font-semibold text-[#10172A] mb-6" style={FRAUNCES}>Activity summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          {[
            ['Hours logged', `${totalHours.toFixed(2)}h`, hoursCaption, hoursCaptionColor],
            ['Days worked', String(daysWorked), `of ${daysInPeriod} day${daysInPeriod === 1 ? '' : 's'}`, '#5B6478'],
            ['Overtime', `${otHours.toFixed(2)}h`, otCaption, otCaptionColor],
            ['Avg. clock-in', avgClockIn, clockInCaption, clockInCaptionColor],
            ['Project codes', String(projectCodes.size), codesCaption, '#5B6478'],
          ].map(([label, value, caption, captionColor]) => (
            <div key={label} className="rounded-2xl border border-slate-200 px-5 py-4">
              <div className="text-3xl font-semibold text-[#10172A]" style={PLEX_MONO}>{value}</div>
              <div className="text-sm text-[#5B6478] mt-1.5">{label}</div>
              <div className="text-xs font-semibold mt-2" style={{ color: captionColor }}>{caption}</div>
            </div>
          ))}
        </div>

        {sessions.length === 0 ? (
          <p className="text-base text-slate-400 italic mb-2">No attendance sessions logged in this period.</p>
        ) : (
          <>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>Visual summary</p>
            <h3 className="text-2xl font-semibold text-[#10172A] mb-6" style={FRAUNCES}>When {(employee.full_name || 'they').split(' ')[0]} clocks in, and how the hours land</h3>
            <div className="grid md:grid-cols-2 gap-10 mb-10">
              <div>
                <p className="text-base font-semibold text-[#10172A] mb-2">Clock-in time by session</p>
                <ClockInChart sessions={sessions} />
              </div>
              <div>
                <p className="text-base font-semibold text-[#10172A] mb-2">Hours logged per day</p>
                <HoursBarChart sessions={sessions} />
              </div>
            </div>

            {flagged.length > 0 && (
              <div className="mb-10 flex items-start gap-4 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-amber-500 text-white flex items-center justify-center text-sm font-bold">!</span>
                <p className="text-sm text-amber-800">
                  {flagged.length} session{flagged.length > 1 ? 's' : ''} auto-flagged as overnight / unusual-hours shifts — see the highlighted rows below.
                </p>
              </div>
            )}

            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>Supporting detail</p>
            <h3 className="text-2xl font-semibold text-[#10172A] mb-6" style={FRAUNCES}>Full activity log</h3>
            <ActivityLogTable sorted={sorted} />
          </>
        )}
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requesterId, setRequesterId] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [periodType, setPeriodType] = useState('weekly');
  const [anchorDate, setAnchorDate] = useState(() => toDateStr(new Date()));
  const [history, setHistory] = useState([]);

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
    ])
      .then(([logsRes, usersRes]) => {
        setRows(logsRes.data.data || []);
        setEmployees(usersRes.data.data || []);
      })
      .catch(() => { setRows([]); setEmployees([]); })
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

      const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 24;
      const imgWidth = pageWidth - margin * 2;
      const maxSliceHeight = pageHeight - margin * 2;
      let anyPageAdded = false;

      for (const section of sections) {
        const canvas = await html2canvas(section, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        const pxPerPt = canvas.width / imgWidth;
        const sliceHeightPx = Math.floor(maxSliceHeight * pxPerPt);
        let yOffsetPx = 0;

        while (yOffsetPx < canvas.height) {
          const thisSliceHeightPx = Math.min(sliceHeightPx, canvas.height - yOffsetPx);
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = thisSliceHeightPx;
          sliceCanvas.getContext('2d').drawImage(
            canvas, 0, yOffsetPx, canvas.width, thisSliceHeightPx, 0, 0, canvas.width, thisSliceHeightPx
          );

          if (anyPageAdded) pdf.addPage();
          pdf.addImage(sliceCanvas.toDataURL('image/png'), 'PNG', margin, margin, imgWidth, thisSliceHeightPx / pxPerPt);
          anyPageAdded = true;
          yOffsetPx += thisSliceHeightPx;
        }
      }

      const employeeLabel = employeeFilter === 'all' ? 'All employees' : (employees.find((e) => e.user_id === employeeFilter)?.full_name || 'Employee');
      const slug = (employeeFilter === 'all' ? 'all-employees' : employeeLabel).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      pdf.save(`attendance-report-${slug}-${periodType}-${periodRange.startStr}.pdf`);

      const entry = { employeeLabel, periodType, rangeLabel: periodRange.label, generatedAt: new Date().toISOString() };
      const next = [entry, ...history].slice(0, 8);
      setHistory(next);
      try { localStorage.setItem('hr_reports_history', JSON.stringify(next)); } catch {}
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-900">Reports</h1>
          <p className="mt-2 text-sm text-slate-500">Generate a shareholder-ready PDF activity report for one employee or all staff.</p>
        </div>
        <button onClick={handleDownload} disabled={loading || generating} className="rounded-3xl bg-[#1540A8] px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {generating ? 'Generating PDF…' : 'Download PDF'}
        </button>
      </div>

      <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
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
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {employeeFilter === 'all' ? 'All employees' : employees.find((e) => e.user_id === employeeFilter)?.full_name || ''} &middot; {periodRange.label} &middot; {employeesInScope.length} employee{employeesInScope.length === 1 ? '' : 's'} with data
        </p>
      </div>

      {history.length > 0 && (
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">Recently generated (this browser)</p>
          <div className="rounded-3xl border border-slate-200 bg-white divide-y divide-slate-100 shadow-sm">
            {history.map((h, i) => (
              <div key={i} className="flex items-center justify-between px-5 py-3 text-sm">
                <span className="text-slate-700">{h.employeeLabel} &middot; {h.periodType} &middot; {h.rangeLabel}</span>
                <span className="text-xs text-slate-400">{new Date(h.generatedAt).toLocaleString('en-SG', { timeZone: 'Asia/Singapore' })}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div id="reports-print-area" className="space-y-6">
        {loading ? (
          <p className="text-sm text-slate-500">Loading attendance data…</p>
        ) : employeesInScope.length === 0 ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No attendance records match the selected employee and period.
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
          />
        ))}
      </div>
    </div>
  );
}
