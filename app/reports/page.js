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

// The anchor date one period forward — powers the ">" step button next to the range label.
function getNextAnchor(periodType, anchorDateStr) {
  const anchor = parseDateStr(anchorDateStr || toDateStr(new Date()));
  if (periodType === 'daily') return toDateStr(addDays(anchor, 1));
  if (periodType === 'weekly') return toDateStr(addDays(anchor, 7));
  const nextMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 1, 12));
  return toDateStr(nextMonth);
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

function fmtHours(n) {
  return `${(Number(n) || 0).toFixed(2)}h`;
}

function niceMax(value) {
  if (value <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const rounded = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return rounded * pow;
}

const CHART_W = 800, CHART_H = 340, PLOT_L = 70, PLOT_R = 780, PLOT_T = 36, PLOT_B = 296;

// Same palette as the staff dashboard's Weekly/Monthly Project Log, so a project reads the
// same color whether a shareholder sees it here or a staffer sees it on their own dashboard.
const TIMELINE_PROJECT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'];
const TIMELINE_GENERAL_COLOR = '#898781';
const TIMELINE_HOUR_TICKS = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24];

function timelineHourLabel(h) {
  const wrapped = ((h % 24) + 24) % 24;
  const period = wrapped < 12 ? 'AM' : 'PM';
  const display = wrapped % 12 === 0 ? 12 : wrapped % 12;
  return `${display} ${period}`;
}

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

// One row per calendar day worked, with a horizontal bar spanning each session's real clock-in
// → clock-out time on a 24-hour axis — a Gantt-style timeline instead of two separate charts,
// matching the staff dashboard's Weekly/Monthly Project Log at a glance. A session's bar is
// segmented by project in the order its allocations were worked, with any untracked leftover
// time (staff extended past what was allocated) rendered as General.
function SessionTimelineChart({ sessions, startStr, endStr }) {
  const withClockIn = sessions.filter((s) => s.clock_in_time);
  if (withClockIn.length === 0) {
    return <p className="text-sm text-slate-400 italic">No attendance sessions in this period.</p>;
  }

  const colorIndex = new Map();
  withClockIn.forEach((s) => {
    (Array.isArray(s.allocations) ? s.allocations : []).forEach((a) => {
      if (a.project_code && !colorIndex.has(a.project_code)) colorIndex.set(a.project_code, colorIndex.size);
    });
  });
  const colorForProject = (code) => {
    if (!code) return TIMELINE_GENERAL_COLOR;
    const idx = colorIndex.get(code);
    return TIMELINE_PROJECT_COLORS[(idx ?? 0) % TIMELINE_PROJECT_COLORS.length];
  };
  const hasGeneral = withClockIn.some((s) => {
    const allocations = Array.isArray(s.allocations) ? s.allocations : [];
    return allocations.length === 0 || allocations.some((a) => !a.project_code);
  });
  const legendItems = Array.from(colorIndex.keys()).map((code) => ({ code, color: colorForProject(code) }));
  if (hasGeneral) legendItems.push({ code: 'General', color: TIMELINE_GENERAL_COLOR });

  const byDay = new Map();
  withClockIn.forEach((s) => {
    const day = sgtDateStr(s.clock_in_time);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(s);
  });

  // Show every calendar day in the reporting period (not just the ones with data) so a week or
  // month reads as a consistent grid, same as the staff dashboard's own Project Log. Falls back
  // to worked-days-only if no range was given, or if it's implausibly long to render as rows.
  let dayKeys;
  if (startStr && endStr) {
    dayKeys = [];
    let cursor = parseDateStr(startStr);
    const end = parseDateStr(endStr);
    while (cursor <= end && dayKeys.length < 31) {
      dayKeys.push(toDateStr(cursor));
      cursor = addDays(cursor, 1);
    }
    dayKeys.forEach((k) => { if (!byDay.has(k)) byDay.set(k, []); });
  } else {
    dayKeys = Array.from(byDay.keys()).sort();
  }
  dayKeys.forEach((k) => byDay.get(k).sort((a, b) => new Date(a.clock_in_time) - new Date(b.clock_in_time)));

  const rowH = Math.max(18, Math.min(34, 320 / dayKeys.length));
  const plotT = 34, plotL = 70, plotR = 780;
  const plotB = plotT + rowH * dayKeys.length;
  const chartH = plotB + 32;
  const xForMinutes = (m) => plotL + (m / 1440) * (plotR - plotL);

  return (
    <svg viewBox={`0 0 ${CHART_W} ${chartH}`} className="w-full h-auto">
      <g>
        {legendItems.map((item, i) => (
          <g key={item.code} transform={`translate(${plotL + i * 130}, 12)`}>
            <circle cx="0" cy="0" r="5" fill={item.color} />
            <text x="12" y="4" fontSize="11.5" fontWeight="600" fill="#33415C">{item.code}</text>
          </g>
        ))}
      </g>
      {TIMELINE_HOUR_TICKS.map((h) => (
        <g key={h}>
          <line x1={xForMinutes(h * 60)} y1={plotT} x2={xForMinutes(h * 60)} y2={plotB} stroke="#E2E6EF" strokeWidth="1" />
          <text x={xForMinutes(h * 60)} y={plotB + 20} fontSize="10.5" fontWeight="500" fill="#5B6478" textAnchor="middle" fontFamily="ui-monospace, monospace">{timelineHourLabel(h)}</text>
        </g>
      ))}
      {dayKeys.map((day, i) => {
        const y = plotT + i * rowH;
        const label = dayKeys.length <= 7
          ? new Date(day + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short', timeZone: 'UTC' })
          : formatCsvDate(day).slice(0, 5);
        return (
          <g key={day}>
            <line x1={plotL} y1={y + rowH} x2={plotR} y2={y + rowH} stroke="#F1F3F8" strokeWidth="1" />
            <text x={plotL - 10} y={y + rowH / 2 + 4} fontSize="11" fontWeight="500" fill="#5B6478" textAnchor="end">{label}</text>
            {byDay.get(day).map((s) => {
              const startMin = sgtMinutes(s.clock_in_time);
              const rawEndMin = s.clock_out_time ? sgtMinutes(s.clock_out_time) : null;
              const endMin = rawEndMin != null && sgtDateStr(s.clock_out_time) === day && rawEndMin > startMin ? rawEndMin : 1440;
              const span = endMin - startMin;
              const allocations = Array.isArray(s.allocations) ? s.allocations : [];
              const segs = allocations.map((a) => ({ code: a.project_code || null, minutes: Number(a.accumulated_hours || 0) * 60 }));
              const allocated = segs.reduce((sum, seg) => sum + seg.minutes, 0);
              const leftover = Math.max(0, span - allocated);
              if (leftover > 0.5 || segs.length === 0) segs.push({ code: null, minutes: leftover || span });
              let cursor = startMin;
              return segs.map((seg, si) => {
                const x1 = xForMinutes(cursor);
                cursor += seg.minutes;
                const x2 = xForMinutes(cursor);
                return (
                  <rect key={`${s.attendance_id}-${si}`} x={x1} y={y + rowH * 0.22} width={Math.max(x2 - x1, 1.5)} height={rowH * 0.56} rx="3" fill={colorForProject(seg.code)} />
                );
              });
            })}
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
function EmployeeReport({ employee, sessions, periodLabel, startStr, endStr }) {
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
                <div>
                  <p className="text-base font-semibold text-slate-900 mb-2">Daily activity timeline</p>
                  <SessionTimelineChart sessions={sessions} startStr={startStr} endStr={endStr} />
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

// Per-employee budget utilisation table — mirrors the "Project activity breakdown" block's
// header style, sourced from GET /api/v1/reports/budget-usage/:userId (same allocation/
// tracked-hours/extension computation as the Account Manager portal's staff-usage report,
// just scoped to one employee across all of their projects instead of one AM's ownership).
function BudgetUtilisationSection({ budgetRows }) {
  if (!budgetRows || budgetRows.length === 0) return null;
  return (
    <div data-pdf-block className="px-12 pb-8">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>Budget utilisation</p>
      <h3 className="text-2xl font-semibold text-[#10172A] mb-1" style={FRAUNCES}>Allocated hours vs. hours tracked</h3>
      <p className="text-xs text-[#5B6478] mb-5">Approved weekly allocation compared against hours actually logged against each project, including any approved hour extensions.</p>
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="min-w-full text-sm">
          <thead className="bg-[#EAF0FF] text-[#33415C] font-semibold uppercase tracking-wider text-xs">
            <tr>
              <th className="px-4 py-2.5 text-left">Project</th>
              <th className="px-4 py-2.5 text-right">Allocated</th>
              <th className="px-4 py-2.5 text-right">Used</th>
              <th className="px-4 py-2.5 text-left w-40">% Used</th>
              <th className="px-4 py-2.5 text-right">Extension</th>
              <th className="px-4 py-2.5 text-left">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {budgetRows.map((row) => {
              const pct = Number(row.percent_used) || 0;
              const barColor = row.over_budget ? '#DC2626' : pct >= 85 ? '#B4650C' : '#157F52';
              return (
                <tr key={row.project_code}>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className="inline-block font-mono text-xs bg-[#EAF0FF] border border-[#C9D9FB] text-[#0E2E7A] rounded px-2 py-0.5">{row.project_code}</span>
                    <div className="text-xs text-[#5B6478] mt-1">{row.project_name}</div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap" style={PLEX_MONO}>{fmtHours(row.allocated_hours)}</td>
                  <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap" style={PLEX_MONO}>{fmtHours(row.used_hours)}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden min-w-[64px]">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(pct, 2), 100)}%`, backgroundColor: barColor }} />
                      </div>
                      <span className="text-xs font-semibold text-[#10172A] w-12 flex-shrink-0 text-right" style={PLEX_MONO}>{pct.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap" style={PLEX_MONO}>{row.extension_hours > 0 ? fmtHours(row.extension_hours) : '—'}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    <span className={`text-[11px] font-bold uppercase tracking-wide rounded-full px-2.5 py-1 ${
                      row.over_budget ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {row.over_budget ? 'Over budget' : 'On track'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Print-only report card — the fuller shareholder-report template (masthead, subject strip,
// serif headings, real "vs. prior period" deltas). Rendered off-screen purely so the PDF can
// capture it; the visible portal page always shows EmployeeReport above instead.
function EmployeeReportPrint({ employee, sessions, periodLabel, startStr, endStr, priorHours = 0, daysInPeriod = 7, leaveNote = null, budgetRows = [] }) {
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

      <div data-pdf-block className="px-12 pt-7 pb-7 border-b border-slate-200 bg-slate-50">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>Executive summary</p>
        <p className="text-base text-[#10172A] leading-relaxed max-w-3xl">{execSummary}</p>
      </div>

      {/* Activity summary and Visual summary are separate blocks — a merged block risked the
          PDF packer's page-boundary slicing (used for any block taller than the space left on
          the page) landing mid-chart, cutting the axis labels away from the plotted bars.
          Keeping the chart in its own block means only a whole block ever gets sliced, never
          the inside of the chart image itself. */}
      <div data-pdf-block className={sessions.length === 0 ? 'px-12 pt-8 pb-8' : 'px-12 pt-8 pb-6'}>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>At a glance</p>
        <h3 className="text-2xl font-semibold text-[#10172A] mb-4" style={FRAUNCES}>Activity summary</h3>
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
            <div key={label} className="rounded-2xl border border-slate-200 px-5 py-3.5">
              <div className="text-xl font-semibold text-[#10172A] whitespace-nowrap" style={PLEX_MONO}>{value}</div>
              <div className="text-sm text-[#5B6478] mt-1.5">{label}</div>
              <div className="text-xs font-semibold mt-2" style={{ color: captionColor }}>{caption}</div>
            </div>
          ))}
        </div>
        {sessions.length === 0 && (
          <p className="text-base text-slate-400 italic mt-6">No attendance sessions logged in this period.</p>
        )}
      </div>

      {sessions.length > 0 && (
        <div data-pdf-block data-pdf-atomic className="px-12 pt-2 pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#1540A8] mb-2" style={PLEX_MONO}>Visual summary</p>
          <h3 className="text-2xl font-semibold text-[#10172A] mb-4" style={FRAUNCES}>When {(employee.full_name || 'they').split(' ')[0]} clocks in, and how the hours land</h3>
          <p className="text-base font-semibold text-[#10172A] mb-2">Daily activity timeline</p>
          <SessionTimelineChart sessions={sessions} startStr={startStr} endStr={endStr} />
        </div>
      )}

      {sessions.length > 0 && (
        <>
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

          <BudgetUtilisationSection budgetRows={budgetRows} />

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

// Searchable employee picker — type to filter, or pick from the list — replacing the plain
// <select>, which got unwieldy to scan once headcount grows past a handful of names.
function EmployeeSearchSelect({ value, onChange, employees }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const options = useMemo(() => [{ user_id: 'all', full_name: 'All employees' }, ...employees], [employees]);
  const selected = options.find((o) => o.user_id === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => (o.full_name || '').toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={ref} className="relative">
      <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
      <input
        type="text"
        value={open ? query : (selected?.full_name || '')}
        onFocus={() => { setOpen(true); setQuery(''); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        placeholder="Search employee…"
        className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {open && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-400">No matching employees</p>
          ) : filtered.map((o) => (
            <button key={o.user_id} type="button"
              onClick={() => { onChange(o.user_id); setOpen(false); setQuery(''); }}
              className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 ${
                value === o.user_id ? 'bg-[#EEF4FF] text-[#0c3b8f] font-semibold' : 'text-slate-700'
              }`}>
              {o.full_name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 6 full weeks (Mon-first, matching the rest of the app) covering `viewMonth`, including the
// trailing/leading days from adjacent months needed to fill the grid.
function monthMatrix(viewMonth) {
  const firstOfMonth = new Date(Date.UTC(viewMonth.getUTCFullYear(), viewMonth.getUTCMonth(), 1, 12));
  const startDow = (firstOfMonth.getUTCDay() + 6) % 7;
  const gridStart = addDays(firstOfMonth, -startDow);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

// Calendar popover for the Period/range field — click one date to jump there (same as the old
// native date input), or click a second, later date to select a genuinely custom multi-day
// range. Selection is kept in local draft state until "Apply", so browsing other months while
// picking doesn't half-commit a range.
const CALENDAR_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function RangeCalendarPopover({ initialStart, initialEnd, onApply, onClose }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseDateStr(initialStart || toDateStr(new Date()));
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
  });
  const [draftStart, setDraftStart] = useState(initialStart || null);
  const [draftEnd, setDraftEnd] = useState(initialEnd && initialEnd !== initialStart ? initialEnd : null);
  const [hoverDate, setHoverDate] = useState(null);

  const days = useMemo(() => monthMatrix(viewMonth), [viewMonth]);
  const todayStr = toDateStr(new Date());
  // A fixed 21-year span around the real current year (not the viewed month) so the year list
  // doesn't recenter itself and jump around as you browse.
  const yearOptions = useMemo(() => {
    const base = new Date().getFullYear();
    return Array.from({ length: 21 }, (_, i) => base - 10 + i);
  }, []);

  const handleDayClick = (dateStr) => {
    if (!draftStart || draftEnd) { setDraftStart(dateStr); setDraftEnd(null); return; }
    if (dateStr < draftStart) { setDraftStart(dateStr); setDraftEnd(null); return; }
    setDraftEnd(dateStr);
  };

  const previewEnd = draftEnd || (draftStart && hoverDate && hoverDate > draftStart ? hoverDate : null);

  return (
    <div className="absolute z-50 mt-1 w-full min-w-[260px] rounded-2xl border border-slate-200 bg-white shadow-xl p-3" onMouseLeave={() => setHoverDate(null)}>
      <div className="flex items-center justify-between mb-2 gap-1">
        <button type="button" onClick={() => setViewMonth(new Date(Date.UTC(viewMonth.getUTCFullYear(), viewMonth.getUTCMonth() - 1, 1, 12)))}
          aria-label="Previous month" className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
        {/* Month and year as selects (rather than plain text) so you can jump straight to a
            distant month or year instead of only stepping one month at a time. */}
        <div className="flex items-center gap-1 min-w-0">
          <select value={viewMonth.getUTCMonth()}
            onChange={(e) => setViewMonth(new Date(Date.UTC(viewMonth.getUTCFullYear(), Number(e.target.value), 1, 12)))}
            aria-label="Month"
            className="rounded-lg bg-transparent text-sm font-semibold text-slate-900 py-1 pl-1.5 pr-0.5 cursor-pointer hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {CALENDAR_MONTH_NAMES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={viewMonth.getUTCFullYear()}
            onChange={(e) => setViewMonth(new Date(Date.UTC(Number(e.target.value), viewMonth.getUTCMonth(), 1, 12)))}
            aria-label="Year"
            className="rounded-lg bg-transparent text-sm font-semibold text-slate-900 py-1 pl-0.5 pr-1.5 cursor-pointer hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500">
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button type="button" onClick={() => setViewMonth(new Date(Date.UTC(viewMonth.getUTCFullYear(), viewMonth.getUTCMonth() + 1, 1, 12)))}
          aria-label="Next month" className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg text-slate-500 hover:bg-slate-100">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-semibold text-slate-400 mb-1">
        {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((d) => <span key={d}>{d}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d) => {
          const dateStr = toDateStr(d);
          const inMonth = d.getUTCMonth() === viewMonth.getUTCMonth();
          const isStart = dateStr === draftStart;
          const isEnd = dateStr === draftEnd;
          const within = draftStart && previewEnd && dateStr > draftStart && dateStr < previewEnd;
          return (
            <button key={dateStr} type="button"
              onMouseEnter={() => setHoverDate(dateStr)}
              onClick={() => handleDayClick(dateStr)}
              className={`h-7 text-xs transition ${!inMonth ? 'text-slate-300' : 'text-slate-700'} ${
                isStart || isEnd ? 'rounded-lg bg-[#1540A8] text-white font-semibold'
                  : within ? 'rounded-lg bg-[#EEF4FF] text-[#0c3b8f]'
                  : dateStr === todayStr ? 'rounded-full bg-amber-100 text-amber-700 font-semibold hover:bg-amber-200'
                  : 'rounded-lg hover:bg-slate-100'
              }`}>
              {d.getUTCDate()}
            </button>
          );
        })}
      </div>
      <div className="mt-3 border-t border-slate-100 pt-3">
        <p className="text-xs text-slate-500 truncate mb-2.5">
          {!draftStart ? 'Pick a start date' : !draftEnd ? 'Pick an end date, or apply for one day' : `${draftStart} → ${draftEnd}`}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition">
            Cancel
          </button>
          <button type="button" disabled={!draftStart}
            onClick={() => onApply(draftStart, draftEnd || draftStart)}
            className="flex-1 rounded-xl bg-[#1540A8] px-4 py-2.5 text-xs font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed transition">
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [budgetByUser, setBudgetByUser] = useState({}); // user_id -> budget-usage rows, fetched lazily per employee in scope
  const [loading, setLoading] = useState(true);
  const [requesterId, setRequesterId] = useState('');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [periodType, setPeriodType] = useState('weekly');
  const [anchorDate, setAnchorDate] = useState(() => toDateStr(new Date()));
  const [history, setHistory] = useState([]);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [quickSelectOpen, setQuickSelectOpen] = useState(false);
  const quickSelectRef = useRef(null);
  // A custom range picked from the calendar popover — active only while periodType is 'custom';
  // switching to a preset or a quick-select option clears it and falls back to the normal
  // anchor-date-driven range.
  const [customRange, setCustomRange] = useState(null); // { start, end } as 'YYYY-MM-DD'
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (quickSelectRef.current && !quickSelectRef.current.contains(e.target)) setQuickSelectOpen(false);
      if (calendarRef.current && !calendarRef.current.contains(e.target)) setCalendarOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const periodRange = useMemo(() => {
    if (periodType === 'custom' && customRange) {
      const start = parseDateStr(customRange.start), end = parseDateStr(customRange.end);
      const label = customRange.start === customRange.end
        ? start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })
        : `${start.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' })} – ${end.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
      return { startStr: customRange.start, endStr: customRange.end, label };
    }
    return getPeriodRange(periodType, anchorDate);
  }, [periodType, anchorDate, customRange]);
  const daysInPeriod = useMemo(() => {
    const start = parseDateStr(periodRange.startStr), end = parseDateStr(periodRange.endStr);
    return Math.round((end - start) / 86400000) + 1;
  }, [periodRange]);

  // The ranges HR actually asks for most, one click away instead of stepping or picking a date.
  const todayStr = toDateStr(new Date());
  const quickRanges = useMemo(() => [
    { key: 'this-week', label: 'This week', periodType: 'weekly', anchorDate: todayStr },
    { key: 'last-week', label: 'Last week', periodType: 'weekly', anchorDate: getPreviousAnchor('weekly', todayStr) },
    { key: 'this-month', label: 'This month', periodType: 'monthly', anchorDate: todayStr },
    { key: 'last-month', label: 'Last month', periodType: 'monthly', anchorDate: getPreviousAnchor('monthly', todayStr) },
  ], [todayStr]);
  const activeQuickRangeKey = useMemo(() => {
    const match = quickRanges.find((q) => q.periodType === periodType && getPeriodRange(q.periodType, q.anchorDate).startStr === periodRange.startStr);
    return match?.key || null;
  }, [quickRanges, periodType, periodRange]);

  // A period already at or past today has nothing beyond it worth stepping into — grey out
  // "next" rather than let someone arrow their way into a stretch of guaranteed-empty future.
  const nextDisabled = periodRange.endStr >= todayStr;

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

  // Budget/project usage data for the "Budget utilisation" PDF section — fetched per employee
  // currently in scope, in parallel, and cached by user_id so switching filters back and forth
  // doesn't re-fetch employees already loaded.
  useEffect(() => {
    const missing = employeesInScope.map((e) => e.user_id).filter((id) => !(id in budgetByUser));
    if (missing.length === 0) return;
    Promise.all(missing.map((id) =>
      axios.get(`${backendBaseUrl}/api/v1/reports/budget-usage/${id}`)
        .then((res) => [id, res.data.data || []])
        .catch(() => [id, []])
    )).then((results) => {
      setBudgetByUser((prev) => {
        const next = { ...prev };
        results.forEach(([id, data]) => { next[id] = data; });
        return next;
      });
    });
  }, [employeesInScope, backendBaseUrl, budgetByUser]);

  // True once every employee currently in scope has its budget-usage data cached — gates the
  // Download button so a click right after switching employees/filters can't capture the print
  // template before that fetch resolves, which would silently omit the Budget Utilisation section
  // with no indication anything was missing.
  const budgetDataReady = employeesInScope.every((e) => e.user_id in budgetByUser);

  // Prior-period hours per employee, purely so the PDF can show a real "vs. prior period"
  // delta instead of a made-up one.
  const priorHoursByUser = useMemo(() => {
    const totals = new Map();
    if (periodType === 'custom') return totals; // no well-defined "prior period" for an arbitrary range
    const priorRange = getPeriodRange(periodType, getPreviousAnchor(periodType, anchorDate));
    for (const r of rows) {
      if (!r.clock_in_time) continue;
      const d = sgtDateStr(r.clock_in_time);
      if (d < priorRange.startStr || d > priorRange.endStr) continue;
      totals.set(r.user_id, (totals.get(r.user_id) || 0) + (Number(r.daily_worktime_hours) || 0));
    }
    return totals;
  }, [rows, periodType, anchorDate]);

  const [generating, setGenerating] = useState(false);
  const [toast, setToast] = useState(null); // { text, type }
  const toastTimeoutRef = useRef(null);
  const showToast = (text, type) => {
    setToast({ text, type });
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 4000);
  };
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
    showToast('Generating your report…', 'info');
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
      let cursorY = margin;

      // Places one already-captured block. A block that doesn't fit in whatever space is
      // left on the current page is sliced across the page boundary and continues filling
      // the next page, rather than being bumped whole to a fresh page — bumping whole wastes
      // the leftover space above it, which is what produced the recurring "blank space, content
      // pushed to page 2" look. A tiny sliver of leftover space (<60pt) isn't worth slicing into,
      // so that case just page-breaks first. Slicing degrades gracefully for most content (the
      // same mechanism already handled blocks taller than a full page, e.g. a long activity log)
      // — but a block marked `atomic` (a chart, where a mid-image cut would separate the plotted
      // bars from their own axis labels) is never sliced: it's bumped whole to a fresh page
      // instead, even if that wastes some space, since a cut chart is worse than a blank gap.
      const placeCanvas = (canvas, atomic) => {
        const pxPerPt = canvas.width / imgWidth;
        const imgHeightPt = canvas.height / pxPerPt;
        const remaining = pageHeight - margin - cursorY;

        if (imgHeightPt <= remaining) {
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', margin, cursorY, imgWidth, imgHeightPt);
          cursorY += imgHeightPt;
          return;
        }

        if (atomic && imgHeightPt <= pageHeight - margin * 2) {
          pdf.addPage();
          cursorY = margin;
          pdf.addImage(canvas.toDataURL('image/jpeg', 0.88), 'JPEG', margin, cursorY, imgWidth, imgHeightPt);
          cursorY += imgHeightPt;
          return;
        }

        if (remaining < 60 && cursorY > margin) {
          pdf.addPage();
          cursorY = margin;
        }

        let yOffsetPx = 0;
        while (yOffsetPx < canvas.height) {
          const spaceLeftPt = pageHeight - margin - cursorY;
          const sliceHeightPx = Math.min(Math.floor(spaceLeftPt * pxPerPt), canvas.height - yOffsetPx);
          if (sliceHeightPx <= 0) { pdf.addPage(); cursorY = margin; continue; }
          const sliceCanvas = document.createElement('canvas');
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = sliceHeightPx;
          sliceCanvas.getContext('2d').drawImage(
            canvas, 0, yOffsetPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx
          );
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.88), 'JPEG', margin, cursorY, imgWidth, sliceHeightPx / pxPerPt);
          cursorY += sliceHeightPx / pxPerPt;
          yOffsetPx += sliceHeightPx;
          if (yOffsetPx < canvas.height) { pdf.addPage(); cursorY = margin; }
        }
      };

      let isFirstEmployee = true;
      for (const employeeWrapper of sections) {
        if (!isFirstEmployee) { pdf.addPage(); cursorY = margin; }
        isFirstEmployee = false;

        const blocks = Array.from(employeeWrapper.querySelectorAll(':scope > [data-pdf-block]'));
        for (const block of blocks.length > 0 ? blocks : [employeeWrapper]) {
          const canvas = await html2canvas(block, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
          placeCanvas(canvas, block.hasAttribute('data-pdf-atomic'));
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
      showToast('Your report is ready — check your downloads.', 'success');
    } catch (err) {
      showToast('Something went wrong generating the report. Please try again.', 'error');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
          <div className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium shadow-lg border ${
            toast.type === 'error' ? 'bg-red-600 border-red-700 text-white'
              : toast.type === 'success' ? 'bg-emerald-600 border-emerald-700 text-white'
              : 'bg-slate-900 border-slate-950 text-white'
          }`}>
            {toast.type === 'info' && (
              <svg className="animate-spin flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {toast.type === 'success' && (
              <svg className="flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            )}
            {toast.text}
          </div>
        </div>
      )}

      <div className="mb-10 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-900">Reports</h1>
        <p className="mt-2 text-sm text-slate-500">Generate a shareholder-ready PDF activity report for one employee or all staff.</p>
      </div>

      <div className="sticky top-0 z-20 mb-8 rounded-3xl border border-slate-200 bg-white p-4 shadow-md">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 basis-0 min-w-[200px]">
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Employee</label>
            <EmployeeSearchSelect value={employeeFilter} onChange={setEmployeeFilter} employees={employees} />
          </div>
          {/* The range is the thing that actually drives the report, so it's the visually
              loudest control here — a calendar icon and the resolved range as one bold label,
              flanked by step arrows (jump exactly one period at a time, same pattern as the
              staff dashboard's own Weekly Project Log). Clicking the label itself opens a native
              date picker for jumping straight to a distant period. The old Daily/Weekly/Monthly
              toggle is gone — Quick select (below) is now what sets the period type, alongside
              the resolved range. */}
          <div ref={calendarRef} className="relative flex-1 basis-0 min-w-[240px]">
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Date</label>
            <div className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 px-1.5 py-1.5">
              <button type="button" onClick={() => setAnchorDate(getPreviousAnchor(periodType, anchorDate))}
                disabled={periodType === 'custom'}
                aria-label={`Previous ${periodType === 'daily' ? 'day' : periodType === 'monthly' ? 'month' : 'week'}`}
                className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              {/* Opens a calendar popover instead of jumping straight to a native date input —
                  lets you either click one date (jump there, same as before) or click a second,
                  later date to pick a genuinely custom range spanning multiple periods. */}
              <button type="button" onClick={() => setCalendarOpen((o) => !o)}
                className="flex-1 min-w-0 flex items-center justify-center gap-1.5 rounded-xl py-1 hover:bg-slate-100 transition">
                <svg className="flex-shrink-0 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="text-sm font-normal text-slate-900 truncate">{periodRange.label}</span>
              </button>
              <button type="button" onClick={() => setAnchorDate(getNextAnchor(periodType, anchorDate))}
                disabled={nextDisabled || periodType === 'custom'}
                aria-label={`Next ${periodType === 'daily' ? 'day' : periodType === 'monthly' ? 'month' : 'week'}`}
                title={nextDisabled ? "Already at today — nothing beyond this to show yet" : undefined}
                className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:text-slate-500">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
            {calendarOpen && (
              <RangeCalendarPopover
                initialStart={periodType === 'custom' && customRange ? customRange.start : periodRange.startStr}
                initialEnd={periodType === 'custom' && customRange ? customRange.end : periodRange.startStr}
                onApply={(start, end) => {
                  setCustomRange({ start, end });
                  setPeriodType('custom');
                  setCalendarOpen(false);
                }}
                onClose={() => setCalendarOpen(false)}
              />
            )}
          </div>

          {/* One named-range dropdown instead of a row of separate preset chips — matches the
              "quick select" affordance next to Employee and Period/range. "Today" resets just
              the anchor date, keeping whatever period type is already active; the rest also set
              the period type (weekly/monthly). */}
          <div ref={quickSelectRef} className="relative flex-1 basis-0 min-w-[150px]">
            <label className="block text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Period</label>
            <button type="button" onClick={() => setQuickSelectOpen((o) => !o)}
              className="w-full flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm font-normal text-slate-900 hover:bg-slate-100 transition">
              <span className="truncate">
                {periodType === 'custom' && customRange?.start === todayStr && customRange?.end === todayStr
                  ? 'Today'
                  : quickRanges.find((q) => q.key === activeQuickRangeKey)?.label || 'Custom'}
              </span>
              <svg className="flex-shrink-0 text-slate-400" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {quickSelectOpen && (
              <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
                <button type="button" onClick={() => {
                    setAnchorDate(todayStr);
                    setCustomRange({ start: todayStr, end: todayStr });
                    setPeriodType('custom');
                    setQuickSelectOpen(false);
                  }}
                  className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 border-b border-slate-100 ${
                    periodType === 'custom' && customRange?.start === todayStr && customRange?.end === todayStr
                      ? 'bg-[#EEF4FF] text-[#0c3b8f] font-semibold' : 'text-slate-700'
                  }`}>
                  Today
                </button>
                {quickRanges.map((q) => (
                  <button key={q.key} type="button"
                    onClick={() => { setPeriodType(q.periodType); setAnchorDate(q.anchorDate); setQuickSelectOpen(false); }}
                    className={`block w-full text-left px-4 py-2.5 text-sm hover:bg-slate-50 ${
                      activeQuickRangeKey === q.key ? 'bg-[#EEF4FF] text-[#0c3b8f] font-semibold' : 'text-slate-700'
                    }`}>
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
          {history.length > 0 && (
            <button type="button" onClick={() => setShowHistoryPanel((v) => !v)}
              className="flex items-center gap-2 rounded-3xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" />
              </svg>
              {showHistoryPanel ? 'Hide history' : 'View history'}
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={loading || generating || employeesInScope.length === 0 || !budgetDataReady}
            title={
              !loading && employeesInScope.length === 0 ? 'No attendance records to include in a report'
              : !budgetDataReady ? 'Loading budget data…'
              : undefined
            }
            className="flex items-center gap-2 rounded-3xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {(generating || (!budgetDataReady && employeesInScope.length > 0)) && (
              <svg className="animate-spin flex-shrink-0" width="14" height="14" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.3" />
                <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {generating ? 'Generating PDF…' : !budgetDataReady && employeesInScope.length > 0 ? 'Loading…' : 'Download PDF'}
          </button>
        </div>
      </div>

      {showHistoryPanel && history.length > 0 && (
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
        ) : employeesInScope.length === 0 ? (() => {
          const fmtFull = (dateStr) => parseDateStr(dateStr).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
          const dateRangeText = periodRange.startStr === periodRange.endStr
            ? `on ${fmtFull(periodRange.startStr)}`
            : `between ${fmtFull(periodRange.startStr)} - ${fmtFull(periodRange.endStr)}`;
          return (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-8 py-14 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#EAF0FF]">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#1540A8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-700">No attendance logged for this period</p>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">
              {employeeFilter === 'all' ? 'No employee has' : `${employees.find((e) => e.user_id === employeeFilter)?.full_name || 'This employee'} has no`} clock-in records {dateRangeText} — either no shifts fell in this range, or logs haven&apos;t synced yet.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button onClick={() => { setAnchorDate(toDateStr(new Date())); if (periodType === 'custom') setPeriodType('weekly'); }}
                className="rounded-2xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Jump to today
              </button>
              {employeeFilter !== 'all' && (
                <button onClick={() => setEmployeeFilter('all')} className="rounded-2xl bg-[#1540A8] px-4 py-2 text-sm font-semibold text-white">
                  Check all employees instead
                </button>
              )}
            </div>
          </div>
          );
        })() : (
          employeesInScope.map((emp) => (
            <EmployeeReport
              key={emp.user_id}
              employee={emp}
              sessions={emp.sessions}
              periodLabel={periodRange.label}
              startStr={periodRange.startStr}
              endStr={periodRange.endStr}
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
            startStr={periodRange.startStr}
            endStr={periodRange.endStr}
            priorHours={priorHoursByUser.get(emp.user_id) || 0}
            daysInPeriod={daysInPeriod}
            leaveNote={getLeaveNote(leaveRequests, emp.user_id, periodRange.startStr, periodRange.endStr)}
            budgetRows={budgetByUser[emp.user_id] || []}
          />
        ))}
      </div>
    </div>
  );
}
