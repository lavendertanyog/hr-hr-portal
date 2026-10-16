"use client";

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { authHeaders } from '../authSession';
import { useConfirm } from '../ConfirmDialog';
import { formatLeaveDate, openMcFile } from '../leaveFormat';

// One line summing up a claim's charges and tax, e.g. "Service charge 5% 40.66 · SST 6% 48.79".
const CHARGE_KIND_LABELS = { SERVICE_CHARGE: 'Service charge', TAX: 'Tax', ROUNDING: 'Rounding', DISCOUNT: 'Discount', OTHER: 'Other' };
const chargesSummary = (c) => {
  const lines = (c.charges || []).map((ch) => `${ch.label || CHARGE_KIND_LABELS[ch.kind] || ch.kind} ${ch.kind === 'DISCOUNT' ? '−' : ''}${Number(ch.amount).toFixed(2)}`);
  if (lines.length === 0) return '';
  return lines.join(' · ') + (c.tax_inclusive ? ' (prices include tax)' : '');
};

// Amber note on a claim that looks like the same receipt as another claim (same date, amount,
// currency and merchant), from the server's possible_duplicates.
const DUP_STATUS = { PENDING: 'waiting for manager', MANAGER_APPROVED: 'waiting for HR', APPROVED: 'approved', PAID: 'paid' };
function DuplicateFlag({ claim }) {
  const dups = claim.possible_duplicates || [];
  if (dups.length === 0) return null;
  const who = dups.map((d) => `${d.same_person ? 'their own earlier claim' : `${d.claimant_name || 'another employee'}'s claim`} (${DUP_STATUS[d.status] || d.status.toLowerCase()})`);
  return (
    <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <p><span className="font-semibold">Possible duplicate:</span> same date, amount and merchant as {who.join(', ')}.</p>
      {claim.duplicate_acknowledged && <p className="mt-0.5">The claimant was warned and submitted it anyway.</p>}
    </div>
  );
}


const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const PAGE_SIZE = 6;

const STATUS_LABEL = {
  PENDING: 'Waiting for manager',
  MANAGER_APPROVED: 'Waiting for HR',
  APPROVED: 'Approved',
  PAID: 'Paid',
  REJECTED: 'Rejected',
};
const STATUS_COLOR = {
  PENDING: 'bg-yellow-100 text-yellow-700',
  MANAGER_APPROVED: 'bg-amber-100 text-amber-700',
  APPROVED: 'bg-green-100 text-green-700',
  PAID: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};
const TABS = [
  { key: 'APPROVE', label: 'To approve' },
  { key: 'PAY', label: 'Approved, to pay' },
  { key: 'HISTORY', label: 'All claims' },
];

const sgtToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
const thisMonth = () => sgtToday().slice(0, 7);
const money = (currency, amount) => `${currency} ${Number(amount || 0).toFixed(2)}`;
const csvCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function ClaimRow({ c, categoryLabel, selectable, selected, onToggle, onReceipt, actions }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          {selectable && <input type="checkbox" checked={selected} onChange={onToggle} className="mt-1.5 rounded border-slate-300" />}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{categoryLabel(c.category)}</p>
            <h3 className="mt-1 text-lg font-semibold text-slate-900">{c.claimant_name}</h3>
            <p className="mt-1 text-sm text-slate-500">
              {c.merchant} • {formatLeaveDate(c.purchase_date)}
              <span className="ml-1.5 font-semibold text-[#1540A8]">{money(c.currency, c.total_amount)}</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_COLOR[c.status] || 'bg-slate-100 text-slate-600'}`}>{STATUS_LABEL[c.status] || c.status}</span>
              <button type="button" onClick={onReceipt} className="text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline">View receipt</button>
              <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline">{open ? 'Hide details' : 'Details'}</button>
            </div>
            <DuplicateFlag claim={c} />
            {open && (
              <div className="mt-3 space-y-1 text-sm text-slate-600">
                {c.items?.length > 0 && (
                  <ul className="space-y-0.5">
                    {c.items.map((it, i) => (
                      <li key={i}>{it.quantity ? `${Number(it.quantity)} × ` : ''}{it.description}{it.amount != null ? ` — ${Number(it.amount).toFixed(2)}` : ''}</li>
                    ))}
                  </ul>
                )}
                {chargesSummary(c) && <p><span className="text-slate-400">Charges and tax:</span> {chargesSummary(c)}</p>}
                <p><span className="text-slate-400">Submitted:</span> {formatLeaveDate(c.created_at)} · {c.claimant_email}</p>
                {c.project_code && <p><span className="text-slate-400">Project:</span> {c.project_code}{c.project_name ? ` · ${c.project_name}` : ''}</p>}
                {c.notes && <p><span className="text-slate-400">Notes:</span> {c.notes}</p>}
                {(c.manager_reviewer_name || c.manager_remarks) && (
                  <p><span className="text-slate-400">Manager:</span> {c.manager_reviewer_name || ''}{c.manager_remarks ? ` — ${c.manager_remarks}` : ''}</p>
                )}
                {(c.hr_reviewer_name || c.hr_remarks) && (
                  <p><span className="text-slate-400">HR:</span> {c.hr_reviewer_name || ''}{c.hr_remarks ? ` — ${c.hr_remarks}` : ''}</p>
                )}
                {c.status === 'PAID' && <p><span className="text-slate-400">Paid:</span> {formatLeaveDate(c.paid_at)}{c.paid_reference ? ` (${c.paid_reference})` : ''}</p>}
              </div>
            )}
          </div>
        </div>
        {actions && <div className="flex gap-2.5">{actions}</div>}
      </div>
    </div>
  );
}

export default function HrClaimsPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('APPROVE');
  const [categories, setCategories] = useState([]);
  const [toApprove, setToApprove] = useState([]);
  const [toPay, setToPay] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyMonth, setHistoryMonth] = useState(thisMonth());
  const [historyStatus, setHistoryStatus] = useState('');
  const [historySearch, setHistorySearch] = useState('');
  const [page, setPage] = useState(1);
  const [usage, setUsage] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState([]);
  const [toast, setToast] = useState(null);
  const [confirm, confirmDialog] = useConfirm();

  // Review modal
  const [review, setReview] = useState(null); // { claim, action }
  const [remarks, setRemarks] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [saving, setSaving] = useState(false);

  // Mark paid modal + export
  const [payOpen, setPayOpen] = useState(false);
  const [paidDate, setPaidDate] = useState(sgtToday());
  const [paidReference, setPaidReference] = useState('');
  const [exportMonth, setExportMonth] = useState(thisMonth());

  const showToast = (text, type) => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4000);
  };

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('hr_portal_user');
      if (!stored) { router.push('/'); return; }
      setReady(true);
    } catch { router.push('/'); }
  }, [router]);

  const loadQueues = useCallback(async () => {
    setLoadError('');
    try {
      const [a, p, u] = await Promise.all([
        axios.get(`${API_BASE}/api/v1/claims/hr-pending`, { headers: authHeaders() }),
        axios.get(`${API_BASE}/api/v1/claims/hr-list?status=APPROVED`, { headers: authHeaders() }),
        axios.get(`${API_BASE}/api/v1/claims/scan-usage`, { headers: authHeaders() }).catch(() => null),
      ]);
      setToApprove(a.data?.data || []);
      setToPay(p.data?.data || []);
      setUsage(u?.data?.data || null);
    } catch (err) {
      setLoadError(err.response?.data?.error || 'Failed to load claims.');
    }
  }, []);

  const loadHistory = useCallback(async () => {
    const params = new URLSearchParams();
    if (historyMonth) params.set('month', historyMonth);
    if (historyStatus) params.set('status', historyStatus);
    try {
      const res = await axios.get(`${API_BASE}/api/v1/claims/hr-list?${params}`, { headers: authHeaders() });
      setHistory(res.data?.data || []);
    } catch (err) {
      setHistory([]);
      showToast(err.response?.data?.error || 'Failed to load claims.', 'error');
    }
  }, [historyMonth, historyStatus]);

  useEffect(() => {
    if (!ready) return;
    loadQueues();
    axios.get(`${API_BASE}/api/v1/claims/categories`).then((r) => setCategories(r.data?.data || [])).catch(() => setCategories([]));
  }, [ready, loadQueues]);
  useEffect(() => { if (ready && tab === 'HISTORY') loadHistory(); }, [ready, tab, loadHistory]);
  useEffect(() => { setSelected([]); setPage(1); }, [tab, historyMonth, historyStatus, historySearch]);

  const categoryLabel = (code) => categories.find((c) => c.code === code)?.label || code;

  const viewReceipt = async (claimId) => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/claims/${claimId}/receipt`, { headers: authHeaders() });
      openMcFile(res.data?.data?.receiptImage);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to open the receipt.', 'error');
    }
  };

  const openReview = (claim, action) => {
    setReview({ claim, action });
    setRemarks('');
    setReviewError('');
  };

  const submitReview = async () => {
    if (!review) return;
    if (review.action === 'REJECTED' && !remarks.trim()) {
      setReviewError('Please give a reason for rejecting this claim.');
      return;
    }
    setSaving(true);
    try {
      await axios.patch(`${API_BASE}/api/v1/claims/${review.claim.claim_id}/hr-review`,
        { action: review.action, remarks: remarks.trim() || undefined }, { headers: authHeaders() });
      showToast(`${review.action === 'APPROVED' ? 'Approved' : 'Rejected'} claim for ${review.claim.claimant_name}.`, 'success');
      setReview(null);
      loadQueues();
    } catch (err) {
      setReviewError(err.response?.data?.error || 'Failed to save the decision.');
    } finally {
      setSaving(false);
    }
  };

  const bulkApprove = async () => {
    const ok = await confirm({ title: 'Bulk approve', message: `Approve ${selected.length} selected claim(s)?`, confirmLabel: 'Approve' });
    if (!ok) return;
    let done = 0;
    let failed = 0;
    for (const id of selected) {
      try {
        await axios.patch(`${API_BASE}/api/v1/claims/${id}/hr-review`, { action: 'APPROVED' }, { headers: authHeaders() });
        done += 1;
      } catch { failed += 1; }
    }
    setSelected([]);
    loadQueues();
    showToast(failed ? `Approved ${done} claim(s); ${failed} could not be approved.` : `Approved ${done} claim(s).`, failed ? 'error' : 'success');
  };

  const markPaid = async () => {
    if (!paidDate) { showToast('Please enter the payment date.', 'error'); return; }
    setSaving(true);
    try {
      const res = await axios.patch(`${API_BASE}/api/v1/claims/mark-paid`,
        { claimIds: selected, paidDate, paidReference: paidReference.trim() || undefined }, { headers: authHeaders() });
      const n = res.data?.data?.updated || 0;
      showToast(`Marked ${n} claim(s) paid.`, 'success');
      setPayOpen(false);
      setSelected([]);
      setPaidReference('');
      loadQueues();
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to mark claims paid.', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Payroll CSV: claims HR approved in the month, one row each, then a total per staff member and currency.
  const exportCsv = async () => {
    try {
      const res = await axios.get(`${API_BASE}/api/v1/claims/export?month=${exportMonth}`, { headers: authHeaders() });
      const rows = res.data?.data || [];
      if (rows.length === 0) { showToast(`No claims were approved in ${exportMonth}.`, 'error'); return; }
      const lines = [[
        'Staff', 'Email', 'Date of purchase', 'Merchant', 'Category', 'Currency', 'Amount', 'Tax', 'Service charge', 'Project', 'HR approved on', 'Status', 'Paid on', 'Payment reference', 'Possible duplicate', 'Claim ID',
      ]];
      const totals = new Map();
      for (const c of rows) {
        // Sum of the claim's tax lines (a receipt can have more than one) and service charges.
        const sumOf = (kind) => (c.charges || []).filter((ch) => ch.kind === kind).reduce((s, ch) => s + Number(ch.amount), 0);
        const tax = sumOf('TAX');
        lines.push([
          c.claimant_name, c.claimant_email, c.purchase_date, c.merchant, categoryLabel(c.category), c.currency,
          Number(c.total_amount).toFixed(2), tax.toFixed(2), sumOf('SERVICE_CHARGE').toFixed(2), c.project_code || '',
          c.hr_reviewed_at ? new Date(c.hr_reviewed_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }) : '',
          STATUS_LABEL[c.status] || c.status, c.paid_at || '', c.paid_reference || '',
          (c.possible_duplicates || []).length ? 'Yes' : '', c.claim_id,
        ]);
        const key = `${c.claimant_name}|${c.claimant_email}|${c.currency}`;
        const t = totals.get(key) || { total: 0, tax: 0 };
        totals.set(key, { total: t.total + Number(c.total_amount), tax: t.tax + tax });
      }
      lines.push([]);
      lines.push(['Total per staff member']);
      lines.push(['Staff', 'Email', 'Currency', 'Total', 'Tax']);
      for (const [key, t] of totals) {
        const [name, email, currency] = key.split('|');
        lines.push([name, email, currency, t.total.toFixed(2), t.tax.toFixed(2)]);
      }
      // The BOM makes Excel open the file as UTF-8.
      const csv = String.fromCharCode(0xfeff) + lines.map((l) => l.map(csvCell).join(',')).join(String.fromCharCode(13, 10));
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `claims-approved-${exportMonth}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      showToast(err.response?.data?.error || 'Failed to export claims.', 'error');
    }
  };

  const filteredHistory = history.filter((c) => {
    const q = historySearch.trim().toLowerCase();
    return !q || `${c.claimant_name} ${c.claimant_email} ${c.merchant}`.toLowerCase().includes(q);
  });
  const list = tab === 'APPROVE' ? toApprove : tab === 'PAY' ? toPay : filteredHistory;
  const pageCount = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  const pageRows = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const selectable = tab !== 'HISTORY';
  const toggle = (id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allSelected = selectable && list.length > 0 && selected.length === list.length;
  const toPayTotal = toPay.reduce((sum, c) => (c.currency === 'SGD' ? sum + Number(c.total_amount) : sum), 0);

  return (
    <div className="p-8">
      <div className="mb-8 pl-3">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">Claims</h1>
        <p className="mt-2 text-sm text-slate-500">Give final approval to expense claims, mark them paid with payroll, and export each month for payment.</p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">To approve</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{toApprove.length}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Approved, to pay</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{toPay.length}</p>
          {toPay.length > 0 && <p className="mt-1 text-xs text-slate-500">SGD {toPayTotal.toFixed(2)} in SGD claims</p>}
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Receipt scanning this month</p>
          {usage ? (
            <>
              <p className="mt-2 text-2xl font-semibold text-slate-900">US${usage.costUsd.toFixed(2)} <span className="text-sm font-medium text-slate-500">of US${usage.monthlyCapUsd.toFixed(2)}</span></p>
              <div className="mt-2 h-1.5 w-full rounded-full bg-slate-100">
                <div className="h-1.5 rounded-full bg-[#1540A8]" style={{ width: `${Math.min(100, (usage.costUsd / usage.monthlyCapUsd) * 100)}%` }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {usage.configured ? `${usage.scans} scans` : 'Scanning is not set up (no Gemini key).'}
                {usage.blocked ? ` · ${usage.blocked} stopped by a limit` : ''}{usage.errors ? ` · ${usage.errors} failed` : ''}
              </p>
            </>
          ) : <p className="mt-2 text-sm text-slate-400">—</p>}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 pt-4">
          <div className="flex flex-wrap gap-1">
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`rounded-t-xl px-4 py-2.5 text-sm font-semibold transition ${tab === t.key ? 'bg-[#e8edf8] text-[#1a3a8f]' : 'text-slate-500 hover:text-slate-700'}`}>
                {t.label}{t.key === 'APPROVE' ? ` (${toApprove.length})` : t.key === 'PAY' ? ` (${toPay.length})` : ''}
              </button>
            ))}
          </div>
          <div className="mb-3 flex items-center gap-2">
            <input type="month" value={exportMonth} onChange={(e) => setExportMonth(e.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <button type="button" onClick={exportCsv} disabled={!exportMonth}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">
              Export approved (CSV)
            </button>
          </div>
        </div>

        <div className="p-6">
          {tab === 'HISTORY' && (
            <div className="mb-5 flex flex-wrap items-center gap-3 border-b border-slate-100 pb-5">
              <input type="month" value={historyMonth} onChange={(e) => setHistoryMonth(e.target.value)}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              <div className="flex flex-wrap gap-1.5">
                {[['', 'All'], ['PENDING', 'With manager'], ['MANAGER_APPROVED', 'With HR'], ['APPROVED', 'Approved'], ['PAID', 'Paid'], ['REJECTED', 'Rejected']].map(([key, label]) => (
                  <button key={label} type="button" onClick={() => setHistoryStatus(key)}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${historyStatus === key ? 'bg-[#1540A8] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {label}
                  </button>
                ))}
              </div>
              <div className="relative">
                <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} placeholder="Search staff or merchant…"
                  className="rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <p className="text-xs text-slate-400">Month is when the claim was submitted.</p>
            </div>
          )}

          {selectable && list.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center justify-end gap-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
                <input type="checkbox" checked={allSelected} onChange={(e) => setSelected(e.target.checked ? list.map((c) => c.claim_id) : [])} className="rounded border-slate-300" />
                Select all
              </label>
              {tab === 'APPROVE' ? (
                <button type="button" onClick={bulkApprove} disabled={selected.length === 0}
                  className="rounded-2xl bg-[#1540A8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#12378F] disabled:opacity-40">
                  Approve{selected.length ? ` (${selected.length})` : ''}
                </button>
              ) : (
                <button type="button" onClick={() => setPayOpen(true)} disabled={selected.length === 0}
                  className="rounded-2xl bg-[#1540A8] px-4 py-2 text-xs font-semibold text-white hover:bg-[#12378F] disabled:opacity-40">
                  Mark paid{selected.length ? ` (${selected.length})` : ''}
                </button>
              )}
            </div>
          )}

          {loadError ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-red-600">{loadError}</div>
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center text-slate-500">
              {tab === 'APPROVE' ? 'No claims waiting for HR.' : tab === 'PAY' ? 'No approved claims waiting to be paid.' : 'No claims match this filter.'}
            </div>
          ) : (
            <div className="space-y-3">
              {pageRows.map((c) => (
                <ClaimRow key={c.claim_id} c={c} categoryLabel={categoryLabel}
                  selectable={selectable} selected={selected.includes(c.claim_id)} onToggle={() => toggle(c.claim_id)}
                  onReceipt={() => viewReceipt(c.claim_id)}
                  actions={tab === 'APPROVE' ? (<>
                    <button type="button" onClick={() => openReview(c, 'APPROVED')} className="rounded-2xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F]">Approve</button>
                    <button type="button" onClick={() => openReview(c, 'REJECTED')} className="rounded-2xl border border-slate-300 px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-red-400 hover:text-red-600">Reject</button>
                  </>) : null}
                />
              ))}
            </div>
          )}

          {pageCount > 1 && (
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">Prev</button>
              <span className="text-xs text-slate-500">Page {page} of {pageCount}</span>
              <button type="button" disabled={page === pageCount} onClick={() => setPage((p) => p + 1)} className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-40">Next</button>
            </div>
          )}
        </div>
      </div>

      {/* Approve / reject */}
      {review && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setReview(null); }}>
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{review.action === 'APPROVED' ? 'Approve claim' : 'Reject claim'}</p>
              <button type="button" onClick={() => setReview(null)} aria-label="Close" className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <p className="mt-4 text-sm text-slate-700">
              <strong>{review.claim.claimant_name}</strong> — {review.claim.merchant} • {formatLeaveDate(review.claim.purchase_date)} • {money(review.claim.currency, review.claim.total_amount)}
            </p>
            <label className="mt-5 block text-sm font-semibold text-slate-700 mb-2">
              {review.action === 'REJECTED' ? 'Reason' : 'Remark'}
              {review.action === 'REJECTED' ? <span className="text-red-500"> *</span> : <span className="font-normal text-slate-400"> (optional)</span>}
            </label>
            <textarea rows={3} value={remarks} onChange={(e) => { setRemarks(e.target.value); if (reviewError) setReviewError(''); }}
              className={`w-full resize-none rounded-xl border ${reviewError ? 'border-red-400' : 'border-slate-300'} px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500`}
              placeholder={review.action === 'REJECTED' ? 'Why is this claim rejected?' : 'Add a note for the staff member…'} />
            {reviewError && <p className="mt-2 text-sm font-medium text-red-500">{reviewError}</p>}
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setReview(null)} className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="button" onClick={submitReview} disabled={saving}
                className={`rounded-2xl px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 ${review.action === 'REJECTED' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#1540A8] hover:bg-[#12378F]'}`}>
                {saving ? 'Saving…' : review.action === 'REJECTED' ? 'Reject' : 'Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark paid */}
      {payOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) setPayOpen(false); }}>
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-2xl">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">Mark {selected.length} claim(s) paid</p>
              <button type="button" onClick={() => setPayOpen(false)} aria-label="Close" className="flex items-center justify-center w-7 h-7 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <label className="mt-5 block text-sm font-semibold text-slate-700 mb-2">Payment date</label>
            <input type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <label className="mt-4 block text-sm font-semibold text-slate-700 mb-2">Payment reference <span className="font-normal text-slate-400">(optional)</span></label>
            <input value={paidReference} onChange={(e) => setPaidReference(e.target.value)} maxLength={200} placeholder="e.g. October payroll"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="mt-2 text-xs text-slate-400">Each staff member gets an inbox notice that their claim was paid.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setPayOpen(false)} className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button type="button" onClick={markPaid} disabled={saving} className="rounded-2xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F] disabled:opacity-60">
                {saving ? 'Saving…' : 'Mark paid'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialog}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] pointer-events-none">
          <div className={`rounded-full px-4 py-2.5 text-sm font-medium shadow-lg border ${
            toast.type === 'error' ? 'bg-red-600 border-red-700 text-white' : 'bg-slate-900 border-slate-950 text-white'
          }`}>{toast.text}</div>
        </div>
      )}
    </div>
  );
}
