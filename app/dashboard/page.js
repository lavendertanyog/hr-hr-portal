"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import axios from 'axios';
import { useRouter } from 'next/navigation';
import { authHeaders } from '../authSession';
import { WHATS_NEW } from '../whatsNewData';
import { useT, getLocale } from '../i18n/LanguageProvider';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';
const PREVIEW_COUNT = 6;

// A YYYY-MM-DD calendar date as-is, or a full timestamp converted to its SGT date.
function toYMD(value) {
  const s = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
}

function dayMonth(ymd) {
  return new Date(ymd + 'T00:00:00').toLocaleDateString(getLocale(), { day: 'numeric', month: 'short' });
}

// "16 Oct · 1 day" or "16 Oct – 17 Oct · 2 days"
function leaveRange(item) {
  const start = toYMD(item.start_date);
  const end = toYMD(item.end_date);
  if (!start || !end) return '';
  const days = Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1;
  return start === end ? `${dayMonth(start)} · 1 day` : `${dayMonth(start)} – ${dayMonth(end)} · ${days} days`;
}

function initialsOf(name) {
  return String(name || '').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || '?';
}

function money(currency, amount) {
  const n = Number(amount || 0);
  return `${currency || 'SGD'} ${n.toFixed(2)}`;
}

const LEAVE_LABELS = { ANNUAL: 'Annual leave', EMERGENCY: 'Emergency leave', SICK: 'Sick leave' };
const ROLE_LABELS = { staff: 'Staff', manager: 'Manager', account_manager: 'Account manager', hr: 'HR' };
const AVATAR_COLORS = ['#1a3a8f', '#2f56b8', '#16307a', '#1540A8'];
const OUT_COLORS = ['#e48ab0', '#8fa6e6'];

// Card surface used across the redesigned dashboards: white, no border, a soft navy-tinted shadow.
const CARD = 'rounded-3xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-16px_rgba(22,48,122,0.18)]';

function Avatar({ name }) {
  const n = String(name || '');
  const color = AVATAR_COLORS[[...n].reduce((sum, c) => sum + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: color }} aria-hidden="true">
      {initialsOf(n)}
    </span>
  );
}

function ArrowLink({ href, children }) {
  return (
    <Link href={href} className="flex items-center gap-2 text-sm font-semibold text-slate-500 transition hover:text-[#1540A8]">
      {children}
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
    </Link>
  );
}

function StatIcon({ name }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  if (name === 'leave') return <svg {...common}><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></svg>;
  if (name === 'claims') return <svg {...common}><path d="M5 2h14v20l-3-2-2 2-2-2-2 2-2-2-3 2z" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="9" y1="12" x2="15" y2="12" /></svg>;
  if (name === 'people') return <svg {...common}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  return <svg {...common}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V4h8v3" /></svg>;
}

export default function HrDashboard() {
  const { t } = useT();
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [leave, setLeave] = useState([]);
  const [claims, setClaims] = useState([]);
  const [people, setPeople] = useState([]);
  const [projects, setProjects] = useState([]);
  const [outToday, setOutToday] = useState(null);
  const [activeTab, setActiveTab] = useState('LEAVE');
  // Which stat card the user clicked; only that card gets the outline (none on first load).
  const [selectedCard, setSelectedCard] = useState(null);
  const listRef = useRef(null);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('hr_portal_user');
      if (!stored) { router.push('/'); return; }
      setUser(JSON.parse(stored));
    } catch { router.push('/'); }
  }, [router]);

  useEffect(() => {
    if (!user?.user_id) return;
    const uid = user.user_id;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });
    Promise.all([
      axios.get(`${API_BASE}/api/v1/hr/leave-requests?requesterId=${uid}`).catch(() => null),
      axios.get(`${API_BASE}/api/v1/claims/hr-pending`, { headers: authHeaders() }).catch(() => null),
      axios.get(`${API_BASE}/api/v1/users`).catch(() => null),
      axios.get(`${API_BASE}/api/v1/projects`).catch(() => null),
      axios.get(`${API_BASE}/api/v1/calendar/leave`, { params: { requesterId: uid, from: today, to: today } }).catch(() => null),
    ]).then(([leaveRes, claimsRes, usersRes, projectsRes, outRes]) => {
      setLeave((leaveRes?.data?.data || []).filter((r) => String(r.workflow_status).toUpperCase() === 'PENDING'));
      setClaims(claimsRes?.data?.data || []);
      setPeople(usersRes?.data?.data || []);
      setProjects(projectsRes?.data?.data || []);
      setOutToday(outRes?.data?.data || []);
      setLoaded(true);
    });
  }, [user?.user_id]);

  const activeProjects = useMemo(
    () => projects.filter((p) => !['INACTIVE', 'DEPLOYED'].includes(String(p.status || 'ACTIVE').toUpperCase())),
    [projects],
  );

  const displayName = user?.full_name || String(user?.email || '').split('@')[0].split('.').filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ') || 'HR';
  const firstName = displayName.split(' ')[0];

  // Worked out only once the user is loaded (always client-side), so the server render and the
  // first client render match and the time-based text can't cause a hydration mismatch.
  const greeting = (() => {
    if (!user) return 'Welcome back';
    const hour = Number(new Date().toLocaleString(getLocale(), { timeZone: 'Asia/Singapore', hour: 'numeric', hour12: false }));
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  })();
  const todayLabel = user
    ? new Date().toLocaleDateString(getLocale(), { timeZone: 'Asia/Singapore', weekday: 'short', day: 'numeric', month: 'short' })
    : '';

  const totalPending = leave.length + claims.length;

  const openTab = (tab, fromCard) => {
    setActiveTab(tab);
    setSelectedCard(fromCard ? tab : null);
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const stats = [
    { key: 'LEAVE', label: t("Leave to review"), value: leave.length, icon: 'leave', tint: 'bg-yellow-100 text-yellow-700' },
    { key: 'CLAIMS', label: t("Claims to review"), value: claims.length, icon: 'claims', tint: 'bg-pink-100 text-pink-800' },
    { key: 'PEOPLE', label: t("Employees"), value: people.length, icon: 'people', tint: 'bg-emerald-100 text-emerald-700' },
    { key: 'PROJECTS', label: t("Active projects"), value: activeProjects.length, icon: 'projects', tint: 'bg-[#E8EEFF] text-[#16307a]' },
  ];

  const tabs = [
    { id: 'LEAVE', label: t("Leave · {length}", { length: leave.length }), heading: t("Leave waiting for review"), link: { href: '/admin?tab=leave', label: t("Open Approvals") } },
    { id: 'CLAIMS', label: t("Claims · {length}", { length: claims.length }), heading: t("Claims waiting for review"), link: { href: '/admin?tab=claims', label: t("Open Approvals") } },
    { id: 'PEOPLE', label: t("Employees · {length}", { length: people.length }), heading: t("Employees"), link: { href: '/people', label: t("Open Employee") } },
    { id: 'PROJECTS', label: t("Projects · {length}", { length: activeProjects.length }), heading: t("Active projects"), link: { href: '/project-codes', label: t("Open Projects") } },
  ];
  const current = tabs.find((t) => t.id === activeTab);
  const listLength = { LEAVE: leave.length, CLAIMS: claims.length, PEOPLE: people.length, PROJECTS: activeProjects.length }[activeTab];

  const latestNews = WHATS_NEW[0];

  return (
    <div className="px-6 pb-8 pt-2 sm:px-8">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">

        {/* ── Main column ── */}
        <div className="flex min-w-0 flex-col gap-8">

          {/* Greeting */}
          <section className="relative overflow-hidden rounded-3xl px-8 py-9 text-white sm:px-10" style={{ background: '#16307a' }}>
            <svg className="pointer-events-none absolute -right-8 -top-12 hidden sm:block" width="320" height="320" viewBox="0 0 320 320" fill="none" aria-hidden="true">
              <circle cx="160" cy="160" r="130" stroke="#2f56b8" strokeWidth="2" />
              <circle cx="160" cy="160" r="96" stroke="#2f56b8" strokeWidth="2" strokeDasharray="4 8" />
              <circle cx="160" cy="160" r="62" fill="#1a3a8f" stroke="#E8EEFF" strokeWidth="3" />
              <circle cx="160" cy="146" r="16" stroke="#ffffff" strokeWidth="7" />
              <path d="M130 194a30 30 0 0 1 60 0" stroke="#ffffff" strokeWidth="7" strokeLinecap="round" />
              <circle cx="268" cy="80" r="13" fill="#f0c9dc" />
              <circle cx="52" cy="226" r="8" fill="#E8EEFF" />
            </svg>
            <div className="relative max-w-lg">
              <p className="text-xs font-bold uppercase tracking-[0.28em] text-[#aab8e0]">{todayLabel || 'HR Portal'}</p>
              <h1 className="mt-3 text-4xl font-extrabold tracking-tight">{t(greeting)}, {firstName}</h1>
              <p className="mt-3 text-sm text-[#d6def5]">
                {!loaded ? t("Checking for requests…")
                  : totalPending === 0 ? t("You’re all caught up. Nothing is waiting for HR.")
                    : (totalPending === 1 ? t("1 item is waiting for HR review.") : t("{totalPending} items are waiting for HR review.", { totalPending: totalPending }))}
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link href={leave.length === 0 && claims.length > 0 ? '/admin?tab=claims' : '/admin?tab=leave'}
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-bold text-[#16307a] transition hover:bg-[#E8EEFF]">{t("Review requests")}</Link>
                <Link href="/people"
                  className="rounded-2xl border border-[#4a6bc4] px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10">{t("Manage employees")}</Link>
              </div>
            </div>
          </section>

          {/* Stat cards: each one opens its list in the panel below */}
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            {stats.map((item) => (
              <button key={item.key} type="button" onClick={() => openTab(item.key, true)} aria-pressed={selectedCard === item.key}
                className={`${CARD} flex items-center gap-4 px-5 py-5 text-left transition hover:shadow-md ${selectedCard === item.key ? 'ring-2 ring-[#1540A8]' : ''}`}>
                <span className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${item.tint}`}>
                  <StatIcon name={item.icon} />
                </span>
                <span className="flex flex-col">
                  <span className="text-2xl font-extrabold leading-tight text-slate-900 tabular-nums">{loaded ? item.value : '—'}</span>
                  <span className="text-xs text-slate-500">{t(item.label)}</span>
                </span>
              </button>
            ))}
          </div>

          {/* List panel */}
          <section ref={listRef} className="flex scroll-mt-24 flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-extrabold text-slate-900">{t(current.heading)}</h2>
              <div className="flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-sm">
                {tabs.map((tabItem) => (
                  <button key={tabItem.id} type="button" onClick={() => { setActiveTab(tabItem.id); setSelectedCard(tabItem.id); }}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${activeTab === tabItem.id ? 'bg-[#1540A8] text-white' : 'text-slate-500 hover:text-slate-700'}`}>
                    {t(tabItem.label)}
                  </button>
                ))}
              </div>
            </div>

            <div className={`${CARD} px-6 py-2`}>
              {!loaded ? (
                <p className="py-8 text-center text-sm text-slate-400">{t("Loading…")}</p>
              ) : listLength === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  {t({ LEAVE: 'No leave waiting for review.', CLAIMS: 'No claims waiting for review.', PEOPLE: 'No employees yet.', PROJECTS: 'No active projects.' }[activeTab])}
                </p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {activeTab === 'LEAVE' && leave.slice(0, PREVIEW_COUNT).map((l) => (
                    <li key={l.leave_id} className="flex flex-wrap items-center gap-4 py-4">
                      <Avatar name={l.full_name} />
                      <span className="min-w-0 flex-1 basis-48">
                        <span className="block truncate text-sm font-bold text-slate-900">{l.full_name || l.email}</span>
                        <span className="block truncate text-xs text-slate-500">{LEAVE_LABELS[String(l.category)] || l.category} · {leaveRange(l)}</span>
                      </span>
                      {l.mc_file_url && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{t("MC attached")}</span>}
                      <Link href="/admin?tab=leave" className="rounded-xl bg-[#1540A8] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#12378F]">{t("Review")}</Link>
                    </li>
                  ))}

                  {activeTab === 'CLAIMS' && claims.slice(0, PREVIEW_COUNT).map((c) => (
                    <li key={c.claim_id} className="flex flex-wrap items-center gap-4 py-4">
                      <Avatar name={c.claimant_name} />
                      <span className="min-w-0 flex-1 basis-48">
                        <span className="block truncate text-sm font-bold text-slate-900">{c.claimant_name || c.claimant_email}</span>
                        <span className="block truncate text-xs text-slate-500">
                          {c.merchant || 'Receipt'}{c.purchase_date ? ` · ${dayMonth(toYMD(c.purchase_date))}` : ''}{c.category ? ` · ${c.category}` : ''}
                        </span>
                      </span>
                      <span className="text-sm font-bold tabular-nums text-slate-900">{money(c.currency, c.total_amount)}</span>
                      <Link href="/admin?tab=claims" className="rounded-xl bg-[#1540A8] px-4 py-2 text-sm font-bold text-white transition hover:bg-[#12378F]">{t("Review")}</Link>
                    </li>
                  ))}

                  {activeTab === 'PEOPLE' && people.slice(0, PREVIEW_COUNT).map((p) => {
                    const roles = Array.isArray(p.user_roles) && p.user_roles.length ? p.user_roles : [p.user_role];
                    return (
                      <li key={p.user_id} className="flex flex-wrap items-center gap-4 py-4">
                        <Avatar name={p.full_name} />
                        <span className="min-w-0 flex-1 basis-48">
                          <span className="block truncate text-sm font-bold text-slate-900">{p.full_name || p.email}</span>
                          <span className="block truncate text-xs text-slate-500">{p.email}</span>
                        </span>
                        <span className="flex flex-wrap gap-1.5">
                          {roles.filter(Boolean).map((r) => (
                            <span key={r} className="rounded-full bg-[#E8EEFF] px-2.5 py-1 text-xs font-semibold text-[#1a3a8f]">{ROLE_LABELS[String(r).toLowerCase()] || r}</span>
                          ))}
                        </span>
                      </li>
                    );
                  })}

                  {activeTab === 'PROJECTS' && activeProjects.slice(0, PREVIEW_COUNT).map((p) => {
                    const budget = Number(p.budget_hours || 0);
                    const pct = budget > 0 ? Math.round((Number(p.total_tracked_hours || 0) / budget) * 100) : null;
                    const color = pct === null ? '#cbd5e1' : pct >= 100 ? '#dc2626' : pct >= 80 ? '#d97706' : '#1540A8';
                    const end = toYMD(p.end_date);
                    return (
                      <li key={p.project_code} className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 py-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(120px,200px)]">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8EEFF] text-[#16307a]">
                          <StatIcon name="projects" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-bold text-slate-900" title={p.project_name}>{p.project_name || p.project_code}</span>
                          <span className="block truncate text-xs text-slate-500">{p.project_code}{end ? t(" · Ends {dayMonth}", { dayMonth: dayMonth(end) }) : ''}</span>
                        </span>
                        <span className="col-span-2 flex items-center gap-3 sm:col-span-1">
                          <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF2FB]" aria-hidden="true">
                            <span className="block h-full rounded-full" style={{ width: `${Math.min(100, pct || 0)}%`, background: color }} />
                          </span>
                          <span className="w-24 text-right text-xs font-semibold tabular-nums text-slate-600">
                            {pct === null ? t("No budget") : t("{pct}% of {budget} h", { pct: pct, budget: budget })}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {loaded && (
                <div className="flex items-center justify-between border-t border-slate-100 py-3">
                  <span className="text-xs text-slate-400">
                    {listLength > PREVIEW_COUNT ? t("Showing {PREVIEW_COUNT} of {listLength}", { PREVIEW_COUNT: PREVIEW_COUNT, listLength: listLength }) : ''}
                  </span>
                  <ArrowLink href={current.link.href}>{t(current.link.label)}</ArrowLink>
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ── Side column ── */}
        <aside className="flex min-w-0 flex-col gap-7 rounded-3xl bg-white p-6 xl:self-start">
          {/* Out today */}
          <section className="relative overflow-hidden rounded-3xl p-6 text-white" style={{ background: '#0f2463' }}>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#aab8e0]">{t("Out today")}</p>
            {outToday === null ? (
              <p className="mt-3 text-sm text-[#d6def5]">{t("Loading…")}</p>
            ) : outToday.length === 0 ? (
              <p className="mt-3 text-base font-bold">{t("Everyone's in today.")}</p>
            ) : (
              <>
                <div className="mt-3 flex items-center">
                  {outToday.slice(0, 4).map((p, i) => (
                    <span key={p.leave_id} className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold"
                      style={{ marginLeft: i ? -8 : 0, boxShadow: '0 0 0 3px #0f2463', background: OUT_COLORS[i % OUT_COLORS.length], color: i % 2 ? '#0f2463' : '#ffffff' }}
                      title={p.full_name}>
                      {initialsOf(p.full_name)}
                    </span>
                  ))}
                  <span className="ml-3 text-base font-bold">{outToday.length} {outToday.length === 1 ? t("person") : t("people")}</span>
                </div>
                <p className="mt-2 truncate text-xs text-[#d6def5]">{outToday.map((p) => p.full_name).join(', ')}</p>
              </>
            )}
            <Link href="/calendar" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-[#E8EEFF]">{t("View calendar")}{" "}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </Link>
          </section>

          {/* Quick actions */}
          <section>
            <h2 className="mb-4 text-base font-extrabold text-slate-900">{t("Quick actions")}</h2>
            <div className="grid grid-cols-2 gap-2.5">
              {[
                { label: t("Add employee"), href: '/people' },
                { label: t("New project"), href: '/project-codes' },
                { label: t("Attendance"), href: '/attendance' },
                { label: t("Reports"), href: '/reports' },
              ].map((a) => (
                <Link key={a.label} href={a.href}
                  className="flex h-12 items-center justify-center rounded-2xl bg-[#E8EEFF] px-2 text-center text-sm font-bold text-[#16307a] transition hover:bg-[#dbe4ff]">
                  {t(a.label)}
                </Link>
              ))}
            </div>
          </section>

          {/* What's new */}
          {latestNews && (
            <section className="relative flex min-h-[170px] flex-col justify-end overflow-hidden rounded-3xl p-6 text-white" style={{ background: '#16307a' }}>
              <svg className="pointer-events-none absolute -right-8 -top-8" width="170" height="170" viewBox="0 0 200 200" fill="none" aria-hidden="true">
                <circle cx="120" cy="80" r="56" fill="#1a3a8f" stroke="#aab8e0" strokeWidth="2" />
                <path d="M120 50l8 22 22 8-22 8-8 22-8-22-22-8 22-8z" fill="#E8EEFF" />
                <circle cx="62" cy="140" r="18" fill="#f0c9dc" />
              </svg>
              <p className="relative text-xs font-bold uppercase tracking-[0.24em] text-[#aab8e0]">{t("What's new")}</p>
              <p className="relative mt-1.5 text-base font-extrabold leading-snug">{t(latestNews.title)}</p>
              <Link href="/whats-new" className="relative mt-3 flex items-center gap-2 text-sm font-semibold text-white hover:text-[#E8EEFF]">{t("Read more")}{" "}<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
