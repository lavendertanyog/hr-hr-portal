"use client";

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import axios from 'axios';
import { useT } from '../../i18n/LanguageProvider';

// Opened from the MC proof links in the attendance export. The proof is stored as a base64 data
// URL, so it's fetched with the logged-in HR user's id and shown from a temporary blob URL.
export default function McProofPage() {
  const { t } = useT();
  const { leaveId } = useParams();
  const [state, setState] = useState({ status: 'loading' });
  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

  useEffect(() => {
    let objectUrl = null;
    let requesterId = '';
    try { requesterId = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}')?.user_id || ''; } catch {}
    if (!requesterId) { setState({ status: 'signin' }); return undefined; }

    axios.get(`${backendBaseUrl}/api/v1/hr/leave/${leaveId}/mc-proof?requesterId=${requesterId}`)
      .then(async (res) => {
        const d = res.data.data;
        const blob = await (await fetch(d.mc_file_url)).blob();
        objectUrl = URL.createObjectURL(blob);
        setState({ status: 'ready', url: objectUrl, isPdf: blob.type === 'application/pdf', info: d });
      })
      .catch((err) => {
        const code = err.response?.status;
        setState({ status: 'error', message: code === 403 ? t("Only HR can view MC proof.") : (err.response?.data?.error || t("Unable to load this MC proof.")) });
      });
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [leaveId, backendBaseUrl]);

  const fmt = (s) => new Date(`${String(s).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  if (state.status === 'loading') return <div className="p-8 text-sm text-slate-500">{t("Loading MC proof…")}</div>;
  if (state.status === 'signin') {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-slate-900">{t("Please sign in")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t("Sign in to the HR portal, then open this link again to view the MC proof.")}</p>
        <a href="/" className="mt-4 inline-block rounded-3xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white">{t("Go to sign in")}</a>
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-slate-900">{t("MC proof unavailable")}</h1>
        <p className="mt-2 text-sm text-slate-500">{t(state.message)}</p>
      </div>
    );
  }

  const { info } = state;
  return (
    <div className="p-8">
      <p className="text-sm uppercase tracking-[0.32em] text-slate-500">{t("HR Portal")}</p>
      <h1 className="mt-3 text-3xl font-semibold text-slate-900">{t("MC proof — {full_name}", { full_name: info.full_name })}</h1>
      <p className="mt-2 text-sm text-slate-500">{t("{v} leave, {fmt}", { v: String(info.category).charAt(0) + String(info.category).slice(1).toLowerCase(), fmt: fmt(info.start_date) })}{" "}{String(info.start_date).slice(0, 10) === String(info.end_date).slice(0, 10) ? '' : ` – ${fmt(info.end_date)}`}
      </p>
      <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 bg-white p-3 shadow-sm">
        {state.isPdf
          ? <iframe src={state.url} title={t("MC proof")} className="h-[80vh] w-full rounded-2xl" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img src={state.url} alt={t("MC proof for {full_name}", { full_name: info.full_name })} className="mx-auto max-h-[80vh] w-auto max-w-full" />}
      </div>
      <a href={state.url} download={`mc-proof-${info.full_name.replace(/\s+/g, '-').toLowerCase()}`} className="mt-4 inline-block text-sm font-semibold text-[#1540A8] hover:underline">{t("Download file")}</a>
    </div>
  );
}
