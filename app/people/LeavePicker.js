"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import axios from 'axios';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const UNDO_VISIBLE_MS = 6000;

function rolesOf(u) {
  return Array.isArray(u.user_roles) && u.user_roles.length > 0 ? u.user_roles : [u.user_role].filter(Boolean);
}
function initialsOf(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}
const daysOf = (u) => u.leave_entitlement_days ?? 12;

// Quick-select pills: each one ticks everyone shown who belongs to that group.
const GROUPS = [
  { key: 'all', label: 'All', test: () => true },
  { key: 'staff', label: 'Staff', test: (u) => rolesOf(u).includes('staff') },
  { key: 'managers', label: 'Managers', test: (u) => rolesOf(u).includes('manager') || rolesOf(u).includes('account_manager') },
  { key: 'hr', label: 'HR', test: (u) => rolesOf(u).includes('hr') },
];

// Pick people on the left, set their leave days on the right. One panel changes everyone ticked.
export default function LeavePicker() {
  const [requesterId, setRequesterId] = useState('');
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  const [setTo, setSetTo] = useState('12');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);   // { ok, text }
  const [undo, setUndo] = useState(null); // { label, changes: [{ userId, from }] }
  const undoTimer = useRef(null);
  const msgTimer = useRef(null);

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setRequesterId(u.user_id);
    } catch {}
  }, []);

  const load = useCallback(async (rid) => {
    if (!rid) return;
    setLoading(true); setError('');
    try {
      const res = await axios.get(`${BACKEND}/api/v1/hr/active-users?requesterId=${rid}`);
      setUsers(res.data?.data || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load employees.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (requesterId) load(requesterId); }, [requesterId, load]);
  useEffect(() => () => { clearTimeout(undoTimer.current); clearTimeout(msgTimer.current); }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter((u) => !q || (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q))
      .sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
  }, [users, search]);

  const selectedUsers = users.filter((u) => selected.includes(u.user_id));
  const amounts = Array.from(new Set(selectedUsers.map(daysOf))).sort((a, b) => a - b);

  const toggle = (id) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const pickGroup = (g) => setSelected(rows.filter(g.test).map((u) => u.user_id));
  const groupActive = (g) => {
    const ids = rows.filter(g.test).map((u) => u.user_id);
    return ids.length > 0 && ids.length === selected.length && ids.every((id) => selected.includes(id));
  };

  const step = (d) => setSetTo((v) => String(Math.max(0, (Number(v) || 0) + d)));
  const setToValid = setTo !== '' && Number.isInteger(Number(setTo)) && Number(setTo) >= 0;

  const flash = (m) => { setMsg(m); clearTimeout(msgTimer.current); msgTimer.current = setTimeout(() => setMsg(null), 3500); };

  const apply = async (payload, summary) => {
    if (selected.length === 0) return;
    if (selected.length > 1 && !window.confirm(`${summary} for ${selected.length} people?`)) return;
    const before = selectedUsers.map((u) => ({ userId: u.user_id, from: daysOf(u) }));
    setBusy(true);
    try {
      const res = await axios.patch(`${BACKEND}/api/v1/hr/update-leave-entitlement-bulk`, {
        requesterId, userIds: selected, ...payload,
      });
      const newDays = new Map((res.data?.data || []).map((r) => [r.user_id, r.leave_entitlement_days]));
      setUsers((prev) => prev.map((u) => (newDays.has(u.user_id) ? { ...u, leave_entitlement_days: newDays.get(u.user_id) } : u)));
      const n = res.data?.updated ?? selected.length;
      const label = `${summary} · ${n} ${n === 1 ? 'person' : 'people'}`;
      flash({ ok: true, text: label });
      clearTimeout(undoTimer.current);
      setUndo({ label, changes: before });
      undoTimer.current = setTimeout(() => setUndo(null), UNDO_VISIBLE_MS);
      setSelected([]);
    } catch (err) {
      flash({ ok: false, text: err.response?.data?.error || 'Failed to update leave days.' });
    } finally { setBusy(false); }
  };

  const doUndo = async () => {
    if (!undo) return;
    const { changes } = undo;
    clearTimeout(undoTimer.current);
    setUndo(null);
    const byFrom = new Map();
    changes.forEach((c) => { if (!byFrom.has(c.from)) byFrom.set(c.from, []); byFrom.get(c.from).push(c.userId); });
    try {
      for (const [from, ids] of byFrom) {
        await axios.patch(`${BACKEND}/api/v1/hr/update-leave-entitlement-bulk`, { requesterId, userIds: ids, leaveEntitlementDays: from });
      }
      const fromById = new Map(changes.map((c) => [c.userId, c.from]));
      setUsers((prev) => prev.map((u) => (fromById.has(u.user_id) ? { ...u, leave_entitlement_days: fromById.get(u.user_id) } : u)));
      flash({ ok: true, text: 'Change undone.' });
    } catch (err) {
      flash({ ok: false, text: err.response?.data?.error || 'Could not undo.' });
    }
  };

  const plural = (n) => `${n} ${n === 1 ? 'person' : 'people'}`;

  return (
    <div className="flex flex-col lg:flex-row items-start gap-6">
      <div className="flex-1 min-w-0 w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="relative mb-3">
          <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or email"
            className="w-full rounded-full border border-slate-200 bg-white pl-10 pr-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-3">
          {GROUPS.map((g) => (
            <button key={g.key} type="button" onClick={() => pickGroup(g)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${groupActive(g) ? 'bg-[#1a3a8f] text-white' : 'bg-[#f1f4fa] text-slate-600 hover:bg-[#e6ebf5]'}`}>
              {g.label}
            </button>
          ))}
          <button type="button" onClick={() => setSelected([])}
            className="rounded-full bg-[#f1f4fa] px-4 py-1.5 text-sm font-semibold text-slate-600 hover:bg-[#e6ebf5] transition">Select none</button>
        </div>

        {loading ? (
          <p className="py-6 text-sm text-slate-400">Loading employees…</p>
        ) : error ? (
          <p className="py-6 text-sm text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-sm text-slate-400">No employees match your search.</p>
        ) : (
          <div className="space-y-1.5">
            {rows.map((u) => {
              const on = selected.includes(u.user_id);
              return (
                <label key={u.user_id}
                  className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 cursor-pointer transition ${on ? 'bg-[#eef3ff]' : 'bg-[#f7f8fb] hover:bg-[#f1f4fa]'}`}>
                  <input type="checkbox" checked={on} onChange={() => toggle(u.user_id)} className="h-4 w-4 rounded border-slate-300 accent-[#1a3a8f]" />
                  <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-[#e8edf8] text-[#1a3a8f] text-xs font-semibold">{initialsOf(u.full_name)}</span>
                  <span className="flex-1 min-w-0 text-sm font-semibold text-slate-900 truncate">{u.full_name}</span>
                  <span className="flex-shrink-0 text-sm text-slate-500">{daysOf(u)} days</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <aside className="w-full lg:w-[320px] flex-shrink-0 lg:sticky lg:top-2 rounded-2xl border border-[#c8d6f5] bg-[#eef3ff] p-5">
        {selected.length === 0 ? (
          <>
            <p className="text-sm font-semibold text-[#1a3a8f]">No one selected</p>
            <p className="mt-1 text-sm text-slate-500">Tick people on the left, or use the quick-select buttons (All, Staff, Managers), then set their leave days here.</p>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-[#1a3a8f]">{plural(selected.length)} selected</p>
            <p className="text-xs text-slate-500 mt-0.5 mb-3">
              {amounts.length === 1 ? `Currently ${amounts[0]} days` : `Currently ${amounts[0]}–${amounts[amounts.length - 1]} days (different amounts)`}
            </p>

            <div className="flex items-center gap-2 mb-3">
              <button type="button" onClick={() => step(-1)} aria-label="One less day"
                className="w-10 h-10 rounded-xl bg-white text-lg font-semibold text-slate-600 hover:bg-slate-50 transition">−</button>
              <input type="number" min="0" step="1" value={setTo} onChange={(e) => setSetTo(e.target.value)} aria-label="Leave days per year"
                onKeyDown={(e) => { if (e.key === 'Enter' && setToValid && !busy) apply({ leaveEntitlementDays: Number(setTo) }, `Set to ${Number(setTo)} days`); }}
                className="w-16 rounded-xl border border-[#c8d6f5] bg-white px-2 py-2 text-center text-xl font-semibold text-[#1a3a8f] focus:outline-none focus:ring-2 focus:ring-blue-400" />
              <button type="button" onClick={() => step(1)} aria-label="One more day"
                className="w-10 h-10 rounded-xl bg-white text-lg font-semibold text-slate-600 hover:bg-slate-50 transition">+</button>
              <span className="text-sm text-slate-500">days</span>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <button type="button" disabled={busy} onClick={() => apply({ delta: 1 }, 'Added 1 day')}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">+1</button>
              <button type="button" disabled={busy} onClick={() => apply({ delta: 2 }, 'Added 2 days')}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">+2</button>
              <button type="button" disabled={busy} onClick={() => apply({ leaveEntitlementDays: 12 }, 'Set to 12 days')}
                className="rounded-full bg-white px-4 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition">Set to 12</button>
            </div>
            <p className="mb-4 text-xs text-slate-400">The +1 and +2 buttons add to each person's own number and apply straight away.</p>

            <button type="button" disabled={busy || !setToValid}
              onClick={() => apply({ leaveEntitlementDays: Number(setTo) }, `Set to ${Number(setTo)} days`)}
              className="w-full rounded-full border border-[#1a3a8f] bg-white px-4 py-2.5 text-sm font-semibold text-[#1a3a8f] hover:bg-[#1a3a8f] hover:text-white disabled:opacity-50 transition">
              {busy ? 'Saving…' : `Apply to ${plural(selected.length)}`}
            </button>
          </>
        )}

        {msg && (
          <p className={`mt-4 rounded-xl px-3 py-2 text-sm font-medium ${msg.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
            {msg.ok ? <><span className="font-semibold">Saved</span> — {msg.text}</> : msg.text}
          </p>
        )}
      </aside>

      {undo && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 flex items-center gap-4 rounded-full bg-[#1a3a8f] pl-5 pr-2 py-2 text-sm text-white shadow-xl" role="status">
          <span>{undo.label}</span>
          <button type="button" onClick={doUndo} className="rounded-full bg-white/20 px-4 py-1.5 font-semibold hover:bg-white/30 transition">Undo</button>
        </div>
      )}
    </div>
  );
}
