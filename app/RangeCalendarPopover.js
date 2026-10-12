"use client";

import { useMemo, useState } from 'react';

// yyyy-mm-dd math done on UTC-noon anchors so DST-less date arithmetic never rolls over to the
// wrong calendar day, matching the same helpers on the Reports page.
export function toDateStr(d) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}
export function parseDateStr(s) {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day, 12));
}
function addDays(d, n) {
  return new Date(d.getTime() + n * 86400000);
}

// 6 full weeks (Mon-first) covering `viewMonth`, including the trailing/leading days from
// adjacent months needed to fill the grid.
function monthMatrix(viewMonth) {
  const firstOfMonth = new Date(Date.UTC(viewMonth.getUTCFullYear(), viewMonth.getUTCMonth(), 1, 12));
  const startDow = (firstOfMonth.getUTCDay() + 6) % 7;
  const gridStart = addDays(firstOfMonth, -startDow);
  return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
}

const CALENDAR_MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Same calendar popover as the Reports page's Date field — click one date to jump there, or a
// second, later date for a genuine range. Month and year are selects so you can jump straight to
// a distant month/year instead of only stepping one month at a time.
export function RangeCalendarPopover({ initialStart, initialEnd, onApply, onClose }) {
  const [viewMonth, setViewMonth] = useState(() => {
    const d = parseDateStr(initialStart || toDateStr(new Date()));
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 12));
  });
  const [draftStart, setDraftStart] = useState(initialStart || null);
  const [draftEnd, setDraftEnd] = useState(initialEnd && initialEnd !== initialStart ? initialEnd : null);
  const [hoverDate, setHoverDate] = useState(null);

  const days = useMemo(() => monthMatrix(viewMonth), [viewMonth]);
  const todayStr = toDateStr(new Date());
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
