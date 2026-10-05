"use client";

import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-SG', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
}

function toISODateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthLabel(dateStr) {
  const [y, m] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-SG', { month: 'long', year: 'numeric' });
}

// Accent colors cycled per row in the list view — purely visual, holidays have no real category.
const LIST_ACCENTS = ['#F97316', '#7C3AED', '#EF4444', '#2563EB', '#10B981', '#EAB308'];

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export default function CalendarPage() {
  const [requesterId, setRequesterId] = useState(null);
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const [addDate, setAddDate] = useState('');
  const [addName, setAddName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  // Month/year jump picker — opened from the "September 2026" / "2026 holidays" label itself,
  // replacing the old standalone year filter chip.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => new Date().getFullYear());

  // "Fetch official holidays" — pulls Singapore's public holiday list for a year from
  // data.gov.sg, shown as a preview (nothing saved yet) before HR confirms the bulk write.
  const [fetchModalOpen, setFetchModalOpen] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [fetchResults, setFetchResults] = useState([]);
  const [fetchSource, setFetchSource] = useState('');
  const [fetchSaving, setFetchSaving] = useState(false);

  // Top-bar controls — tab filter (all/upcoming) and name search — both narrow which holidays
  // show as pills on the grid below.
  const [listTab, setListTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Toggles the card's body between the month grid and a flat, month-grouped list of the same
  // (filtered) holidays — same data, two ways to scan it.
  const [viewMode, setViewMode] = useState('month');

  // The month-grid view's own month cursor, kept in sync with `year` (below) so the same
  // fetched holiday set always covers it.
  const [gridMonth, setGridMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const shiftGridMonth = (delta) => {
    setGridMonth((m) => {
      const next = new Date(m.getFullYear(), m.getMonth() + delta, 1);
      if (next.getFullYear() !== year) setYear(next.getFullYear());
      return next;
    });
  };


  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setRequesterId(u.user_id);
    } catch {}
  }, []);

  const showToast = (text, type) => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const openPicker = () => { setPickerYear(year); setPickerOpen(true); };
  const pickMonthYear = (monthIdx) => {
    setGridMonth(new Date(pickerYear, monthIdx, 1));
    setYear(pickerYear);
    setPickerOpen(false);
  };
  const jumpToToday = () => {
    const today = new Date();
    today.setDate(1);
    setGridMonth(today);
    setYear(today.getFullYear());
    setPickerOpen(false);
  };

  const fetchHolidays = useCallback(async (y) => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/public-holidays`, { params: { year: y } });
      setHolidays(res.data?.data || []);
    } catch {
      setHolidays([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchHolidays(year); }, [year, fetchHolidays]);

  const openAddModal = (prefillDate, prefillName) => {
    setAddDate(prefillDate || '');
    setAddName(prefillName || '');
    setShowModal(true);
  };

  // Upserts by date — also used to edit an existing holiday, since re-saving the same
  // holidayDate with a new name just overwrites it (no separate create/edit endpoint).
  const handleAdd = async (e) => {
    e.preventDefault();
    if (!addDate || !addName.trim() || !requesterId) return;
    setSaving(true);
    try {
      await axios.post(`${API_BASE}/api/v1/hr/public-holidays`, { requesterId, holidayDate: addDate, name: addName.trim() });
      setShowModal(false);
      setAddDate(''); setAddName('');
      await fetchHolidays(year);
      showToast('Holiday saved.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to save holiday.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const openFetchModal = async () => {
    setFetchModalOpen(true);
    setFetchLoading(true);
    setFetchError('');
    setFetchResults([]);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/hr/public-holidays/fetch-official`, {
        params: { requesterId, year },
      });
      setFetchResults(res.data?.data || []);
      setFetchSource(res.data?.source || '');
    } catch (err) {
      setFetchError(err.response?.data?.error || 'Failed to fetch official holidays.');
    } finally {
      setFetchLoading(false);
    }
  };

  const confirmFetchImport = async () => {
    const toAdd = fetchResults.filter((h) => !h.alreadyExists);
    if (toAdd.length === 0 || !requesterId) return;
    setFetchSaving(true);
    try {
      await axios.post(`${API_BASE}/api/v1/hr/public-holidays/bulk`, { requesterId, holidays: toAdd });
      setFetchModalOpen(false);
      await fetchHolidays(year);
      showToast(`Added ${toAdd.length} holiday${toAdd.length > 1 ? 's' : ''}.`, 'success');
    } catch (err) {
      setFetchError(err.response?.data?.error || 'Failed to save fetched holidays.');
    } finally {
      setFetchSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteConfirm || !requesterId) return;
    setSaving(true);
    try {
      await axios.delete(`${API_BASE}/api/v1/hr/public-holidays/${deleteConfirm.holiday_date}`, { data: { requesterId } });
      setDeleteConfirm(null);
      await fetchHolidays(year);
      showToast('Holiday removed.', 'success');
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to remove holiday.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Full lookup (unfiltered) — used by the add/edit modal so clicking any date on the grid
  // always correctly detects an existing holiday, even one hidden by the top-bar filters.
  const holidayByDateAll = {};
  holidays.forEach((h) => { holidayByDateAll[h.holiday_date] = h; });

  // Filtered lookup — used for which holiday pills actually render on the grid, respecting the
  // top-bar tab (all/upcoming) and search query.
  const todayISO = toISODateStr(new Date());
  const query = searchQuery.trim().toLowerCase();
  const holidayByDate = {};
  holidays.forEach((h) => {
    if (listTab === 'upcoming' && h.holiday_date < todayISO) return;
    if (query && !h.name.toLowerCase().includes(query)) return;
    holidayByDate[h.holiday_date] = h;
  });

  // Same filtered set, grouped by month, for the list view — covers the whole fetched year,
  // not just whichever month the grid happens to be on.
  const holidaysByMonth = [];
  for (const h of holidays) {
    if (listTab === 'upcoming' && h.holiday_date < todayISO) continue;
    if (query && !h.name.toLowerCase().includes(query)) continue;
    const label = monthLabel(h.holiday_date);
    const group = holidaysByMonth[holidaysByMonth.length - 1];
    if (group && group.label === label) group.items.push(h);
    else holidaysByMonth.push({ label, items: [h] });
  }

  // Mon-first grid cells for gridMonth, padded with leading/trailing blanks so the grid always
  // starts on a Monday column — same approach as the Attendance page's own calendar popover.
  const gridYear = gridMonth.getFullYear();
  const gridMonthIdx = gridMonth.getMonth();
  const firstOfMonth = new Date(gridYear, gridMonthIdx, 1);
  const leadingBlanks = (firstOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(gridYear, gridMonthIdx + 1, 0).getDate();
  const gridCells = [];
  for (let i = 0; i < leadingBlanks; i++) gridCells.push(null);
  for (let d = 1; d <= daysInMonth; d++) gridCells.push(new Date(gridYear, gridMonthIdx, d));
  while (gridCells.length % 7 !== 0) gridCells.push(null);

  return (
    <div className="p-8">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <div className={`rounded-full px-4 py-2.5 text-sm font-medium shadow-lg text-white ${toast.type === 'error' ? 'bg-red-600' : 'bg-emerald-600'}`}>
            {toast.text}
          </div>
        </div>
      )}

      <div className="mb-10 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-900">Calendar</h1>
        <p className="mt-2 text-sm text-slate-500">
          Manage Singapore public holidays — shown on attendance calendars and factored into reports across all portals.
        </p>
      </div>

      {/* Calendar card — an icon-tabs + search/filter row (integrated as the card's own header,
          matching the reference bar) sits above the existing month-nav + Add New row and the
          grid itself. */}
      <div className={`rounded-3xl border border-slate-200 bg-white ${pickerOpen ? 'overflow-visible' : 'overflow-hidden'}`}>
        <div className="flex flex-wrap items-center justify-between gap-4 px-6 border-b border-slate-100">
          <div className="flex items-center gap-6">
            {[
              ['all', 'All Holidays', <path key="p" d="M8 2v4M16 2v4M3.5 9h17M4 5h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />],
              ['upcoming', 'Upcoming', <path key="p" d="M12 2l2.6 6.6L22 9l-5.4 4.8L18 21l-6-3.6L6 21l1.4-7.2L2 9l7.4-.4Z" />],
            ].map(([key, label, icon]) => (
              <button key={key} type="button" onClick={() => setListTab(key)}
                className={`flex items-center gap-1.5 text-sm py-3.5 border-b-2 transition ${
                  listTab === key ? 'font-bold text-slate-900 border-[#1540A8]' : 'font-medium text-slate-400 border-transparent hover:text-slate-600'
                }`}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 py-2.5">
            <div className="relative">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search…"
                className="rounded-full border border-slate-200 pl-8 pr-3 py-1.5 text-sm w-32 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:w-44 transition-all" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 py-5 border-b border-slate-100">
          {/* The Month/List toggle only applies to All Holidays — Upcoming is its own
              independent page (always the agenda list), so the toggle doesn't apply there and
              is hidden rather than shown-but-inert. */}
          {listTab === 'all' ? (
            <div className="flex items-center gap-1 rounded-full bg-slate-50 p-1 justify-self-start">
              {[
                ['month', 'Month', <path key="p" d="M3 4h18l-7 8v6l-4 2v-8Z" />],
                ['list', 'List', <><line key="l1" x1="8" y1="6" x2="21" y2="6" /><line key="l2" x1="8" y1="12" x2="21" y2="12" /><line key="l3" x1="8" y1="18" x2="21" y2="18" /><line key="l4" x1="3" y1="6" x2="3.01" y2="6" /><line key="l5" x1="3" y1="12" x2="3.01" y2="12" /><line key="l6" x1="3" y1="18" x2="3.01" y2="18" /></>],
              ].map(([key, label, icon]) => (
                <button key={key} type="button" onClick={() => setViewMode(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full transition ${
                    viewMode === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'
                  }`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{icon}</svg>
                  {label}
                </button>
              ))}
            </div>
          ) : <div />}
          <div className="relative justify-self-center">
            {listTab === 'all' && viewMode === 'month' ? (
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => shiftGridMonth(-1)}
                  className="w-8 h-8 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                </button>
                <button type="button" onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
                  className="flex items-center gap-1.5 rounded-full px-3 py-1.5 -mx-1 text-base font-bold text-slate-900 whitespace-nowrap hover:bg-slate-50 transition">
                  {gridMonth.toLocaleDateString('en-SG', { month: 'long', year: 'numeric' })}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>
                <button type="button" onClick={() => shiftGridMonth(1)}
                  className="w-8 h-8 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => (pickerOpen ? setPickerOpen(false) : openPicker())}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 -mx-1 text-base font-bold text-slate-900 whitespace-nowrap hover:bg-slate-50 transition">
                {year} holidays
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
              </button>
            )}

            {pickerOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setPickerOpen(false)} />
                <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-72 rounded-2xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <button type="button" onClick={() => setPickerYear((y) => y - 1)}
                      className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <p className="text-sm font-bold text-slate-900">{pickerYear}</p>
                    <button type="button" onClick={() => setPickerYear((y) => y + 1)}
                      className="w-7 h-7 rounded-full hover:bg-slate-100 flex items-center justify-center text-slate-500">
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                  </div>
                  <div className="grid grid-cols-3">
                    {MONTH_NAMES.map((m, i) => {
                      const isCurrent = listTab === 'all' && viewMode === 'month' && pickerYear === gridMonth.getFullYear() && i === gridMonth.getMonth();
                      const col = i % 3;
                      const row = Math.floor(i / 3);
                      return (
                        <button key={m} type="button" onClick={() => pickMonthYear(i)}
                          className={`py-3 text-xs font-semibold transition border-slate-100 ${col !== 2 ? 'border-r' : ''} ${row !== 3 ? 'border-b' : ''} ${isCurrent ? 'bg-[#1540A8] text-white' : 'text-slate-600 hover:bg-slate-50'}`}>
                          {m}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" onClick={jumpToToday}
                    className="w-full border-t border-slate-100 py-3 text-xs font-semibold text-[#1540A8] hover:bg-slate-50 transition">
                    Today
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="relative justify-self-end">
            <button type="button" onClick={() => setAddMenuOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-full bg-[#1540A8] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#12378F]">
              Add New
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
            </button>
            {addMenuOpen && (
              <>
                {/* Click-outside backdrop — sits below the menu itself, above everything else. */}
                <div className="fixed inset-0 z-40" onClick={() => setAddMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 w-60 rounded-2xl border border-slate-200 bg-white shadow-lg z-50 overflow-hidden">
                  <button type="button" onClick={() => { setAddMenuOpen(false); openAddModal(); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1540A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Add manually</span>
                      <span className="block text-xs text-slate-400">Enter a date and name yourself</span>
                    </span>
                  </button>
                  <button type="button" onClick={() => { setAddMenuOpen(false); openFetchModal(); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50 transition border-t border-slate-100">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1540A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">Fetch official holidays</span>
                      <span className="block text-xs text-slate-400">Auto-import from data.gov.sg</span>
                    </span>
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {listTab === 'all' && viewMode === 'month' ? (
          <>
            <div className="grid grid-cols-7 border-b border-slate-100">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <span key={d} className="py-3 text-center text-xs font-semibold text-slate-400 border-r border-slate-100 last:border-r-0">{d}</span>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {gridCells.map((d, i) => {
                const isLastCol = (i + 1) % 7 === 0;
                if (!d) return <div key={i} className={`min-h-[110px] border-b border-slate-100 bg-slate-50/40 ${isLastCol ? '' : 'border-r'}`} />;
                const iso = toISODateStr(d);
                const holiday = holidayByDate[iso];
                const isToday = iso === toISODateStr(new Date());
                return (
                  <button key={i} type="button" onClick={() => openAddModal(iso, holidayByDateAll[iso]?.name)}
                    className={`min-h-[110px] p-2 flex flex-col items-end text-left transition hover:bg-slate-50 border-b border-slate-100 ${isLastCol ? '' : 'border-r'}`}>
                    <span className={`inline-flex items-center justify-center text-xs font-semibold w-6 h-6 rounded-full ${isToday ? 'bg-[#1540A8] text-white' : 'text-slate-700'}`}>
                      {d.getDate()}
                    </span>
                    {holiday && (
                      <p className="mt-1.5 w-full rounded-md bg-red-500 px-2 py-1 text-[10px] font-semibold text-white leading-tight line-clamp-2 text-left">{holiday.name}</p>
                    )}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <div className="p-6">
            {loading ? (
              <p className="text-sm text-slate-400 py-8 text-center">Loading…</p>
            ) : holidaysByMonth.length === 0 ? (
              <p className="text-sm text-slate-400 py-8 text-center">No holidays match {year}.</p>
            ) : (
              holidaysByMonth.map((group, gi) => {
                let colorCursor = holidaysByMonth.slice(0, gi).reduce((n, g) => n + g.items.length, 0);
                return (
                  <div key={group.label} className={gi > 0 ? 'mt-6' : ''}>
                    <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">{group.label}</p>
                    <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                      {group.items.map((h) => {
                        const weekday = new Date(h.holiday_date + 'T00:00:00').toLocaleDateString('en-SG', { weekday: 'short' });
                        const [, , dNum] = h.holiday_date.split('-');
                        const color = LIST_ACCENTS[colorCursor % LIST_ACCENTS.length];
                        colorCursor += 1;
                        return (
                          <button key={h.holiday_date} type="button" onClick={() => openAddModal(h.holiday_date, h.name)}
                            className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-slate-50 transition">
                            <div className="w-10 flex-shrink-0 text-center">
                              <p className="text-base font-bold text-[#1540A8] leading-tight">{dNum}</p>
                              <p className="text-[10px] text-slate-400 leading-tight">{weekday}</p>
                            </div>
                            <div className="w-[3px] self-stretch rounded-full flex-shrink-0" style={{ background: color }} />
                            <div className="min-w-0 flex-1">
                              <p className="text-[11px] font-medium text-slate-400 leading-tight">Public holiday</p>
                              <p className="text-sm font-semibold text-slate-800 leading-snug truncate">{h.name}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <form onSubmit={handleAdd} className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <p className="text-sm font-semibold text-slate-900 mb-4">{holidayByDateAll[addDate] ? 'Edit holiday' : 'Add a public holiday'}</p>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">Date</label>
            <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} autoFocus
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <label className="block text-xs font-semibold text-slate-500 mb-1.5 mt-4">Holiday name</label>
            <input type="text" value={addName} onChange={(e) => setAddName(e.target.value)} placeholder="e.g. National Day"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setShowModal(false)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              {holidayByDateAll[addDate] && (
                <button type="button" onClick={() => { setShowModal(false); setDeleteConfirm(holidayByDateAll[addDate]); }}
                  className="flex-1 rounded-xl border border-red-200 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50">Delete</button>
              )}
              <button type="submit" disabled={saving || !addDate || !addName.trim()}
                className="flex-1 rounded-xl bg-[#1540A8] py-2.5 text-sm font-bold text-white disabled:opacity-40 hover:bg-[#12378F]">
                {holidayByDateAll[addDate] ? 'Save' : 'Add'}
              </button>
            </div>
          </form>
        </div>
      )}

      {fetchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setFetchModalOpen(false); }}>
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1540A8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></svg>
              <p className="text-sm font-semibold text-slate-900">{year} public holidays</p>
            </div>

            {fetchLoading ? (
              <p className="text-sm text-slate-400 py-10 text-center">Fetching from data.gov.sg…</p>
            ) : fetchError ? (
              <p className="text-sm text-red-600 py-6">{fetchError}</p>
            ) : (
              <>
                <p className="text-xs text-slate-400 mb-4">
                  Source: {fetchSource || 'data.gov.sg'}. {fetchResults.length} holiday{fetchResults.length === 1 ? '' : 's'} found.
                </p>
                <div className="rounded-2xl border border-slate-200 divide-y divide-slate-100 max-h-72 overflow-y-auto">
                  {fetchResults.map((h) => (
                    <div key={h.holiday_date} className="flex items-center justify-between px-4 py-2.5">
                      <div className="flex items-center gap-2 min-w-0">
                        {h.alreadyExists ? (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M5 13l4 4L19 7" /></svg>
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0"><path d="M5 13l4 4L19 7" /></svg>
                        )}
                        <span className={`text-sm truncate ${h.alreadyExists ? 'text-slate-400' : 'text-slate-800 font-medium'}`}>{h.name}</span>
                      </div>
                      <span className="text-xs text-slate-400 flex-shrink-0 ml-3">{formatDate(h.holiday_date).replace(/^\w+, /, '')}</span>
                    </div>
                  ))}
                </div>
                {fetchResults.some((h) => h.alreadyExists) && (
                  <p className="mt-3 text-xs text-amber-600">
                    {fetchResults.filter((h) => h.alreadyExists).length} of these already exist in your calendar and will be left as-is.
                  </p>
                )}
              </>
            )}

            <div className="flex gap-3 mt-6">
              <button type="button" onClick={() => setFetchModalOpen(false)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={confirmFetchImport}
                disabled={fetchLoading || fetchSaving || fetchResults.filter((h) => !h.alreadyExists).length === 0}
                className="flex-1 rounded-xl bg-[#1540A8] py-2.5 text-sm font-bold text-white disabled:opacity-40 hover:bg-[#12378F]">
                {fetchSaving ? 'Adding…' : `Add ${fetchResults.filter((h) => !h.alreadyExists).length} new holiday${fetchResults.filter((h) => !h.alreadyExists).length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteConfirm(null); }}>
          <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
            <p className="text-sm font-semibold text-slate-900 mb-2">Remove this holiday?</p>
            <p className="text-sm text-slate-500 mb-5">{formatDate(deleteConfirm.holiday_date)} — {deleteConfirm.name}</p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setDeleteConfirm(null)}
                className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button type="button" onClick={confirmDelete} disabled={saving}
                className="flex-1 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-60">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
