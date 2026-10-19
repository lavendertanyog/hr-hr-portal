"use client";

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useT, getLocale } from '../i18n/LanguageProvider';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function CloseButton({ onClick }) {
  const { t } = useT();
  return (
    <button type="button" onClick={onClick} aria-label={t("Close")}
      className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  );
}

// Small window for setting leave days for one or many people: set everyone to a number, or add
// to / take from each person's own number. Shared by the toolbar menu, the selection bar and the
// search shortcut, so there is one place that does it.
export default function LeaveDaysModal({ people, requesterId, onClose, onDone }) {
  const { t } = useT();
  const [setTo, setSetTo] = useState(String(people.length === 1 ? (people[0].leave_entitlement_days ?? 12) : 12));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const amounts = Array.from(new Set(people.map((u) => u.leave_entitlement_days ?? 12))).sort((a, b) => a - b);
  const names = people.slice(0, 3).map((u) => u.full_name).join(', ') + (people.length > 3 ? ` and ${people.length - 3} more` : '');
  const step = (d) => setSetTo((v) => String(Math.max(0, (Number(v) || 0) + d)));
  const valid = setTo !== '' && Number.isInteger(Number(setTo)) && Number(setTo) >= 0;

  const apply = async (payload, summary) => {
    setBusy(true); setMsg(null);
    try {
      const res = await axios.patch(`${BACKEND}/api/v1/hr/update-leave-entitlement-bulk`, {
        requesterId, userIds: people.map((u) => u.user_id), reason, ...payload,
      });
      const n = res.data?.updated ?? people.length;
      setMsg({ ok: true, text: t("{summary} — updated {n} {v}.", { summary: summary, n: n, v: n === 1 ? 'person' : 'people' }) });
      onDone(res.data?.data || []);
      setTimeout(onClose, 900);
    } catch (err) {
      setMsg({ ok: false, text: err.response?.data?.error || t("Failed to update leave days.") });
      setBusy(false);
    }
  };

  const change = (d) => {
    const summary = d > 0 ? `Added ${d} day${d === 1 ? '' : 's'}` : `Took off ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'}`;
    if (people.length > 1 && !window.confirm(t("{v} for {length} people?", { v: summary.replace(/^Added/, 'Add').replace(/^Took/, 'Take'), length: people.length }))) return;
    apply({ delta: d }, summary);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden" role="dialog" aria-label={t("Set leave days")}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-slate-900">{t("Set leave days")}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{people.length} {people.length === 1 ? t("person") : t("people")}</p>
            <p className="text-xs text-slate-400 truncate">{names}</p>
          </div>
          <CloseButton onClick={onClose} />
        </div>

        <div className="px-6 py-5">
          <p className="text-xs text-slate-400 mb-4">
            {amounts.length === 1 ? t("Currently {v} days per year", { v: amounts[0] }) : t("Currently {v}–{v2} days per year (different amounts)", { v: amounts[0], v2: amounts[amounts.length - 1] })}
          </p>

          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">{t("Set")}{" "}{people.length === 1 ? t("to") : t("everyone to")}</p>
          <div className="flex items-center gap-2 mb-3">
            <button type="button" onClick={() => step(-1)} aria-label={t("One less day")}
              className="w-10 h-10 rounded-xl bg-[#f1f4fa] text-lg font-semibold text-slate-600 hover:bg-[#e6ebf5] transition">−</button>
            <input type="number" min="0" step="1" value={setTo} onChange={(e) => setSetTo(e.target.value)} aria-label={t("Leave days per year")}
              onKeyDown={(e) => { if (e.key === 'Enter' && valid && !busy) apply({ leaveEntitlementDays: Number(setTo) }, `Set to ${Number(setTo)} days`); }}
              className="w-20 rounded-xl border border-slate-200 px-3 py-2 text-center text-lg font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400" />
            <button type="button" onClick={() => step(1)} aria-label={t("One more day")}
              className="w-10 h-10 rounded-xl bg-[#f1f4fa] text-lg font-semibold text-slate-600 hover:bg-[#e6ebf5] transition">+</button>
            <span className="text-sm text-slate-400">{t("days")}</span>
          </div>
          <button type="button" disabled={busy || !valid} onClick={() => apply({ leaveEntitlementDays: Number(setTo) }, `Set to ${Number(setTo)} days`)}
            className="w-full rounded-full bg-[#1a3a8f] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#12307a] disabled:opacity-50 transition">
            {busy ? t("Saving…") : t("Apply to {length} {v}", { length: people.length, v: people.length === 1 ? 'person' : 'people' })}
          </button>

          <div className="my-5 border-t border-slate-100" />

          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">{t("Or change")}{" "}{people.length === 1 ? t("by") : t("each person by")}</p>
          <div className="flex gap-2">
            {[1, 2, -1].map((d) => (
              <button key={d} type="button" disabled={busy} onClick={() => change(d)}
                className="flex-1 rounded-full bg-[#f1f4fa] px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-[#e6ebf5] disabled:opacity-50 transition">
                {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
              </button>
            ))}
          </div>
          {people.length > 1 && <p className="mt-2 text-xs text-slate-400">{t("Adds to or takes from each person's own number, so people keep their differences.")}</p>}

          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("Reason (optional, kept in history)")}
            className="mt-5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400" />

          {msg && (
            <p className={`mt-4 rounded-xl px-4 py-2.5 text-sm font-medium ${msg.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{t(msg.text)}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// Latest changes to leave days: who, whose, from what to what, why.
export function LeaveHistoryModal({ requesterId, onClose }) {
  const { t } = useT();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    axios.get(`${BACKEND}/api/v1/hr/leave-entitlement-history?requesterId=${requesterId}`)
      .then((r) => setRows(r.data?.data || []))
      .catch((err) => setError(t(err.response?.data?.error || 'Failed to load history.')));
  }, [requesterId]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden" role="dialog" aria-label={t("Leave change history")}>
        <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{t("Leave change history")}</h2>
            <p className="text-sm text-slate-500 mt-0.5">{t("The latest changes to anyone's leave days.")}</p>
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div className="overflow-y-auto px-6 py-4">
          {error ? (
            <p className="text-sm text-red-600">{error}</p>
          ) : rows === null ? (
            <p className="text-sm text-slate-400">{t("Loading…")}</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-400">{t("No changes recorded yet.")}</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.audit_id} className="py-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900">
                      {r.employee_name || 'Unknown'} <span className="text-slate-400 font-normal">· {r.old_days ?? '?'} → </span>
                      <span className="font-semibold">{t("{new_days} days", { new_days: r.new_days })}</span>
                    </p>
                    <p className="text-xs text-slate-400">{t("by")}{" "}{r.changed_by_name || 'Unknown'}{r.reason ? ` · “${r.reason}”` : ''}
                    </p>
                  </div>
                  <span className="flex-shrink-0 text-xs text-slate-400">
                    {new Date(r.created_at).toLocaleString(getLocale(), { timeZone: 'Asia/Singapore', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
