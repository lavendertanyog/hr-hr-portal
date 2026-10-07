"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';

// Project lifecycle: ACTIVE -> DEPLOYED -> MAINTENANCE (-> DEPLOYED again). Legacy INACTIVE
// projects (from the old Deactivate action) are shown as DEPLOYED.
export const projectStatusOf = (p) => {
  const s = String(p?.status || 'ACTIVE').toUpperCase();
  return s === 'INACTIVE' ? 'DEPLOYED' : s;
};

// Card tint, text and utilisation-bar colours per status
const STATUS_THEME = {
  ACTIVE: { label: 'Active', bg: '#E4EAFF', ink: '#1540A8', track: '#C9D5FF' },
  DEPLOYED: { label: 'Deployed', bg: '#D6F3E4', ink: '#05764F', track: '#B3E6CB' },
  MAINTENANCE: { label: 'Maintenance', bg: '#FDE6C6', ink: '#A85406', track: '#F8CF96' },
};
const themeOf = (status) => STATUS_THEME[status] || STATUS_THEME.ACTIVE;
const STATUS_FILTERS = [['ALL', 'All'], ['ACTIVE', 'Active'], ['DEPLOYED', 'Deployed'], ['MAINTENANCE', 'Maintenance']];

const AVATAR_COLORS = ['#1540A8', '#7C3AED', '#0F766E', '#B45309', '#BE185D', '#475569'];
const avatarColor = (name) => AVATAR_COLORS[[...(name || '?')].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR_COLORS.length];
const initialsOf = (name) => (name || '').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || '?';
const formatDate = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};
const roleLabel = (r) => String(r || 'staff').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

// -- Icons ---------------------------------------------------------------------
const svgProps = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
function StatusIcon({ status, size = 16 }) {
  if (status === 'DEPLOYED') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
        <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1-.1-2.9a2.2 2.2 0 0 0-2.9-.1z" />
        <path d="M12 15l-3-3a22 22 0 0 1 2-3.9A12.9 12.9 0 0 1 22 2c0 2.7-.8 7.5-6 11a22.4 22.4 0 0 1-4 2z" />
        <path d="M9 12H4s.6-3 2-4c1.6-1.1 5 0 5 0" /><path d="M12 15v5s3-.6 4-2c1.1-1.6 0-5 0-5" />
      </svg>
    );
  }
  if (status === 'MAINTENANCE') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.8-3.8a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.8 3.8z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}>
      <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
    </svg>
  );
}
const PencilIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...svgProps}><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
);
const CloseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...svgProps}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>
);
const ChevronIcon = ({ dir = 'right' }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" {...svgProps}>
    {dir === 'left' ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
  </svg>
);
const ArrowIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...svgProps}><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>
);
const SearchIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...svgProps}><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
);

// -- Multi-select dropdown for managers/account_managers ----------------------
function UserMultiSelect({ label, placeholder, users, selected, onChange }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? users.filter((u) => (u.full_name + ' ' + u.email).toLowerCase().includes(q)) : users;
  }, [users, search]);

  const toggle = (userId) => {
    onChange(selected.includes(userId) ? selected.filter((id) => id !== userId) : [...selected, userId]);
  };

  const selectedUsers = users.filter((u) => selected.includes(u.user_id));

  return (
    <div className="relative">
      <label className="block text-sm font-semibold text-slate-700 mb-2">{label}</label>
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedUsers.map((u) => (
            <span key={u.user_id} className="flex items-center gap-1 rounded-full bg-[#E8EEFF] px-3 py-1 text-xs font-semibold text-[#1540A8]">
              {u.full_name}
              <button type="button" onClick={() => toggle(u.user_id)} className="ml-0.5 leading-none hover:text-red-500" aria-label={`Remove ${u.full_name}`}>&times;</button>
            </span>
          ))}
        </div>
      )}
      <div ref={ref} className="relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"><SearchIcon /></span>
        <input
          type="text"
          value={search}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {open && (
          <div className="absolute z-50 mt-1 max-h-52 w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400">No results</p>
            ) : filtered.map((u) => {
              const isSelected = selected.includes(u.user_id);
              return (
                <button
                  key={u.user_id}
                  type="button"
                  onClick={() => toggle(u.user_id)}
                  className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${isSelected ? 'bg-[#E8EEFF]' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-800">{u.full_name}</span>
                    <span className="block truncate text-xs text-slate-400">{u.email}</span>
                  </span>
                  {isSelected && <span className="text-[#1540A8] font-bold">&#10003;</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Avatar({ name, size = 32 }) {
  return (
    <span
      title={name}
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, fontSize: size < 30 ? 10 : 11, background: avatarColor(name) }}
    >
      {initialsOf(name)}
    </span>
  );
}

// Drawer building blocks, styled after the Employee drawer
const headerBtn = 'grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-white';

function Section({ title, onEdit, children }) {
  return (
    <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {onEdit && (
          <button type="button" onClick={onEdit} aria-label={`Edit ${title.toLowerCase()}`}
            className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <PencilIcon size={14} />
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 truncate text-[15px] font-medium text-slate-900">{children}</p>
    </div>
  );
}

function PersonRow({ name, sub, role }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3.5 py-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Avatar name={name} size={30} />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{name}</p>
          {sub && <p className="truncate text-xs text-slate-400">{sub}</p>}
        </div>
      </div>
      <span className="shrink-0 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-inset ring-slate-200">{role}</span>
    </div>
  );
}

// -- Project cards + details/edit drawer -----------------------------------------
// Shared by the HR portal (Projects > Project Codes) and the Account Manager portal
// (My Projects). The portal passes its own user lists and whether an Account Manager
// is required when issuing a code. Leave out managerFilterOptions to hide the manager filter.
export default function ProjectCards({
  backendBaseUrl,
  sessionUser,
  accountManagerOptions,
  managerOptions,
  managerFilterOptions,
  requireAccountManager = true,
}) {
  const [projects, setProjects] = useState([]);
  const [utilisationMap, setUtilisationMap] = useState({});
  const [loading, setLoading] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [managerFilter, setManagerFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer: null (closed) | 'view' | 'edit' | 'create'. It covers the page, so another
  // project is picked by closing it (or with its previous/next buttons).
  const [panel, setPanel] = useState(null);
  const [drawerTab, setDrawerTab] = useState('details'); // details | team
  const [selectedCode, setSelectedCode] = useState(null);
  const [membersByCode, setMembersByCode] = useState({});
  const [confirmDeploy, setConfirmDeploy] = useState(false);
  const closeBtnRef = useRef(null);

  // Form state
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formAccountManagerIds, setFormAccountManagerIds] = useState([]);
  const [formManagerIds, setFormManagerIds] = useState([]);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const fetchAll = useCallback(async () => {
    try {
      const [projectsRes, utilisationRes] = await Promise.all([
        axios.get(`${backendBaseUrl}/api/v1/projects`).catch(() => ({ data: { data: [] } })),
        axios.get(`${backendBaseUrl}/api/v1/projects/utilisation-detail`).catch(() => ({ data: { data: [] } })),
      ]);
      setProjects(projectsRes.data.data || []);
      const utilMap = {};
      (utilisationRes.data.data || []).forEach((u) => { utilMap[u.project_code] = Number(u.weighted_utilisation_pct || 0); });
      setUtilisationMap(utilMap);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [backendBaseUrl]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const selected = projects.find((p) => p.project_code === selectedCode) || null;

  // Team members for the open project, fetched each time it's opened
  useEffect(() => {
    if (!selectedCode || panel !== 'view') return undefined;
    let cancelled = false;
    axios.get(`${backendBaseUrl}/api/v1/projects/${encodeURIComponent(selectedCode)}/members`)
      .then((res) => { if (!cancelled) setMembersByCode((m) => ({ ...m, [selectedCode]: res.data.data || [] })); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [backendBaseUrl, selectedCode, panel]);
  const members = membersByCode[selectedCode] || [];

  const utilisationOf = (project) => (
    utilisationMap[project.project_code] != null && !isNaN(Number(utilisationMap[project.project_code]))
      ? Number(utilisationMap[project.project_code])
      : (Number(project.budget_hours) > 0 ? Math.round(((project.total_tracked_hours ?? 0) / Number(project.budget_hours)) * 100) : 0)
  );

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      const statusOk = statusFilter === 'ALL' || projectStatusOf(p) === statusFilter;
      const searchOk = !q || (p.project_code || '').toLowerCase().includes(q) || (p.project_name || '').toLowerCase().includes(q);
      const managerOk = managerFilter === 'ALL'
        || p.account_manager_id === managerFilter
        || (Array.isArray(p.account_manager_ids) && p.account_manager_ids.includes(managerFilter))
        || (Array.isArray(p.manager_ids) && p.manager_ids.includes(managerFilter));
      return statusOk && searchOk && managerOk;
    });
  }, [projects, statusFilter, searchQuery, managerFilter]);

  const fillForm = (project) => {
    setFormCode(project?.project_code || '');
    setFormName(project?.project_name || '');
    setFormHours(project?.budget_hours != null ? String(project.budget_hours) : '');
    setFormAccountManagerIds(project
      ? (Array.isArray(project.account_manager_ids) && project.account_manager_ids.length > 0 ? project.account_manager_ids : [project.account_manager_id].filter(Boolean))
      : []);
    setFormManagerIds(project && Array.isArray(project.manager_ids) ? project.manager_ids : []);
    setFormError('');
  };

  const showProject = (code) => {
    setSelectedCode(code);
    setPanel('view');
    setDrawerTab('details');
    setConfirmDeploy(false);
    setFormError('');
  };

  const openCreate = () => {
    setSelectedCode(null);
    fillForm(null);
    setConfirmDeploy(false);
    setPanel('create');
  };

  const startEdit = () => {
    fillForm(selected);
    setConfirmDeploy(false);
    setPanel('edit');
  };

  const closePanel = useCallback(() => {
    const code = selectedCode;
    setPanel(null);
    setConfirmDeploy(false);
    setFormError('');
    if (code) {
      requestAnimationFrame(() => document.querySelector(`[data-project-card="${CSS.escape(code)}"]`)?.focus());
    }
  }, [selectedCode]);

  // A view/edit drawer whose project no longer exists (deleted elsewhere) simply stays hidden
  const panelOpen = panel === 'create' || ((panel === 'view' || panel === 'edit') && Boolean(selected));

  useEffect(() => {
    if (!panelOpen) return undefined;
    closeBtnRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') closePanel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [panelOpen, closePanel]);

  // Previous / next within the projects currently shown in the grid
  const position = filtered.findIndex((p) => p.project_code === selectedCode);
  const prevProject = position > 0 ? filtered[position - 1] : null;
  const nextProject = position >= 0 && position < filtered.length - 1 ? filtered[position + 1] : null;

  const handleCreate = async (e) => {
    e.preventDefault(); setFormError('');
    const missingAm = requireAccountManager && formAccountManagerIds.length === 0;
    if (!formCode.trim() || !formName.trim() || !formHours || missingAm || formManagerIds.length === 0) {
      setFormError(requireAccountManager
        ? 'All fields are required: Project Code, Project Name, Budget Hours, at least one Account Manager, and at least one Manager.'
        : 'Project Code, Project Name, Budget Hours, and at least one Manager are required. Account Manager is optional — leave it blank for projects with no AM assigned.');
      return;
    }
    setBusy(true);
    try {
      const code = formCode.trim().toUpperCase();
      await axios.post(`${backendBaseUrl}/api/v1/projects/create`, {
        creatorId: sessionUser?.user_id,
        projectCode: code,
        projectName: formName.trim(),
        budgetHours: formHours ? Number(formHours) : null,
        accountManagerIds: formAccountManagerIds,
        managerIds: formManagerIds,
      });
      await fetchAll();
      showProject(code);
      setToast(`Project code ${code} issued.`);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create project.');
    } finally { setBusy(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault(); setFormError('');
    if (!formName.trim()) { setFormError('Project Name is required.'); return; }
    setBusy(true);
    try {
      await axios.patch(`${backendBaseUrl}/api/v1/projects/${selected.project_code}`, {
        projectName: formName.trim(),
        budgetHours: formHours ? Number(formHours) : null,
        accountManagerIds: formAccountManagerIds,
        managerIds: formManagerIds,
        editorId: sessionUser?.user_id,
      });
      await fetchAll();
      setPanel('view');
      setDrawerTab('details');
      setToast('Project updated.');
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to update project.');
    } finally { setBusy(false); }
  };

  const handleDeploy = async () => {
    setBusy(true); setFormError('');
    try {
      await axios.patch(`${backendBaseUrl}/api/v1/projects/${selected.project_code}/deploy`, { editorId: sessionUser?.user_id });
      await fetchAll();
      setConfirmDeploy(false);
      setToast(`${selected.project_code} marked as deployed.`);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to mark project as deployed.');
    } finally { setBusy(false); }
  };

  const handleReactivate = async () => {
    setBusy(true); setFormError('');
    try {
      await axios.patch(`${backendBaseUrl}/api/v1/projects/${selected.project_code}/reactivate`, { editorId: sessionUser?.user_id });
      await fetchAll();
      setToast(`${selected.project_code} reactivated for maintenance.`);
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to reactivate project.');
    } finally { setBusy(false); }
  };

  // -- Card grid --------------------------------------------------------------
  const grid = (
    <div className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map(([key, label]) => {
          const on = statusFilter === key;
          return (
            <button key={key} type="button" aria-pressed={on} onClick={() => setStatusFilter(key)}
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${
                on ? 'bg-[#1540A8] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}>
              {label}
            </button>
          );
        })}
        <div className="flex w-full flex-wrap items-center gap-2.5 sm:ml-auto sm:w-auto">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-full bg-white px-3.5 py-2 ring-1 ring-inset ring-slate-200 sm:flex-none">
            <span className="text-slate-400"><SearchIcon /></span>
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code or project name"
              aria-label="Search projects"
              className="w-full min-w-0 bg-transparent text-sm text-slate-900 outline-none sm:w-52"
            />
          </label>
          {managerFilterOptions && (
            <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)} aria-label="Filter by manager"
              className="rounded-full border-0 bg-white px-4 py-2 text-sm text-slate-700 ring-1 ring-inset ring-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="ALL">Filter by Manager</option>
              {managerFilterOptions.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
            </select>
          )}
          <button type="button" onClick={openCreate}
            className="rounded-full bg-[#1540A8] px-5 py-2 text-sm font-semibold text-white hover:bg-[#12378F]">
            + Issue New Code
          </button>
        </div>
      </div>

      <p className="text-sm text-slate-500">
        {loading ? 'Loading project codes…' : `${filtered.length} project${filtered.length === 1 ? '' : 's'}`}
      </p>

      {!loading && filtered.length === 0 ? (
        <div className="rounded-[28px] bg-white px-6 py-12 text-center text-sm text-slate-500 ring-1 ring-inset ring-slate-200">
          No project codes found.
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))' }}>
          {filtered.map((project) => {
            const status = projectStatusOf(project);
            const theme = themeOf(status);
            const utilization = utilisationOf(project);
            const isOpen = panelOpen && panel !== 'create' && selectedCode === project.project_code;
            return (
              <button
                key={project.project_code}
                type="button"
                data-project-card={project.project_code}
                aria-pressed={isOpen}
                aria-label={`${project.project_name}, ${theme.label}, ${utilization}% utilised`}
                onClick={() => showProject(project.project_code)}
                className="flex min-h-[188px] flex-col gap-3.5 rounded-[28px] p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                style={{ background: theme.bg, boxShadow: isOpen ? '0 0 0 2px #1540A8' : undefined }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2 text-[13px] font-medium" style={{ color: theme.ink }}>
                    <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-white"><StatusIcon status={status} /></span>
                    {theme.label}
                  </span>
                  <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-white/70 text-slate-500"><ArrowIcon /></span>
                </div>
                <h3 className="text-[1.15rem] font-medium leading-snug text-slate-900" style={{ textWrap: 'balance' }}>{project.project_name}</h3>
                <div className="mt-auto space-y-1.5">
                  <div className="flex justify-between text-xs text-slate-600">
                    <span>Utilization</span>
                    <span className="font-semibold tabular-nums" style={{ color: theme.ink }}>{utilization}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full" style={{ background: theme.track }}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(Math.max(utilization, 0), 100)}%`, background: theme.ink }} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  // -- Drawer -----------------------------------------------------------------
  const formFields = (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Project Code <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={formCode}
          onChange={(e) => setFormCode(e.target.value)}
          placeholder="e.g. PROJ-001"
          disabled={panel === 'edit'}
          required
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Project Name <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={formName}
          onChange={(e) => setFormName(e.target.value)}
          placeholder="e.g. Website Redesign"
          required
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Budget Hours <span className="text-red-500">*</span></label>
        <input
          type="number"
          min="0"
          value={formHours}
          onChange={(e) => setFormHours(e.target.value)}
          placeholder="e.g. 200"
          required
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <UserMultiSelect
        label={requireAccountManager
          ? <>Account Manager <span className="text-red-500">*</span></>
          : <>Account Manager <span className="text-slate-400 font-normal">(optional)</span></>}
        placeholder="Search by name or email..."
        users={accountManagerOptions}
        selected={formAccountManagerIds}
        onChange={setFormAccountManagerIds}
      />
      <UserMultiSelect
        label={<>Manager <span className="text-red-500">*</span></>}
        placeholder="Search by name or email..."
        users={managerOptions}
        selected={formManagerIds}
        onChange={setFormManagerIds}
      />
      {formError && <p className="text-sm font-medium text-red-500">{formError}</p>}
    </div>
  );

  let drawer = null;
  if (panelOpen) {
    const isCreate = panel === 'create';
    const status = isCreate ? 'ACTIVE' : projectStatusOf(selected);
    const theme = themeOf(status);
    const utilization = isCreate ? 0 : utilisationOf(selected);
    const ring = Math.min(Math.max(utilization, 0), 100);
    const amNames = isCreate ? [] : (selected.account_manager_names || (selected.account_manager_name ? [selected.account_manager_name] : []));
    const mgrNames = isCreate ? [] : (selected.manager_names || []);
    const staff = members.filter((m) => (m.project_role || 'staff') === 'staff');
    const title = isCreate ? 'Issue New Code' : selected.project_name;

    let body;
    if (panel === 'create' || panel === 'edit') {
      body = (
        <form onSubmit={isCreate ? handleCreate : handleEdit} className="space-y-5">
          <Section title={isCreate ? 'New project code' : 'Edit project'}>{formFields}</Section>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => { if (isCreate) { closePanel(); } else { setPanel('view'); setDrawerTab('details'); } }}
              className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={busy}
              className="rounded-xl bg-[#1540A8] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F] disabled:opacity-60">
              {busy ? 'Saving...' : isCreate ? 'Create' : 'Save Changes'}
            </button>
          </div>
        </form>
      );
    } else if (drawerTab === 'team') {
      body = (
        <Section title={`Staff assigned (${staff.length})`} onEdit={undefined}>
          {staff.length === 0 ? (
            <p className="text-sm text-slate-400">No staff assigned to this project yet. Managers assign staff from their Team page.</p>
          ) : (
            <div className="space-y-2">
              {staff.map((m) => <PersonRow key={m.user_id} name={m.full_name} sub={m.email} role={roleLabel(m.project_role)} />)}
            </div>
          )}
        </Section>
      );
    } else {
      body = (
        <div className="space-y-4">
          <Section title="Project information" onEdit={startEdit}>
            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              <Field label="Project code">{selected.project_code}</Field>
              <Field label="Project name">{selected.project_name}</Field>
              <Field label="Budget hours">{selected.budget_hours ?? 0} hrs</Field>
              <Field label="Utilization">{utilization}%</Field>
              <Field label="Status">{theme.label}</Field>
              <Field label="Created">{formatDate(selected.created_at)}</Field>
            </div>
          </Section>

          <Section title="Managers" onEdit={startEdit}>
            {amNames.length === 0 && mgrNames.length === 0 ? (
              <p className="text-sm text-slate-400">No managers assigned.</p>
            ) : (
              <div className="space-y-2">
                {amNames.map((n) => <PersonRow key={`am-${n}`} name={n} role="Account Manager" />)}
                {mgrNames.map((n) => <PersonRow key={`mgr-${n}`} name={n} role="Manager" />)}
              </div>
            )}
          </Section>

          <Section title="Project status">
            {status === 'DEPLOYED' ? (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-slate-600">This project is deployed. Staff keep their assignments but can&apos;t log time, progress or budget requests against it. Reactivate it for maintenance or updates.</p>
                <button type="button" onClick={handleReactivate} disabled={busy}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                  style={{ background: STATUS_THEME.MAINTENANCE.bg, color: STATUS_THEME.MAINTENANCE.ink }}>
                  <StatusIcon status="MAINTENANCE" /> {busy ? 'Reactivating…' : 'Reactivate for maintenance'}
                </button>
              </div>
            ) : confirmDeploy ? (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-slate-700">
                  <span className="font-semibold">Mark {selected.project_code} as deployed?</span> Staff assignments are kept, but no one can log time, progress or budget requests against it until it is reactivated for maintenance.
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirmDeploy(false)}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                    Cancel
                  </button>
                  <button type="button" onClick={handleDeploy} disabled={busy}
                    className="rounded-xl bg-[#1540A8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#12378F] disabled:opacity-60">
                    {busy ? 'Saving...' : 'Yes, mark as deployed'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-slate-600">
                  {status === 'MAINTENANCE' ? 'Back in progress for maintenance or updates.' : 'In progress.'} Mark it as deployed once the work is live.
                </p>
                <button type="button" onClick={() => setConfirmDeploy(true)}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
                  style={{ background: STATUS_THEME.DEPLOYED.bg, color: STATUS_THEME.DEPLOYED.ink }}>
                  <StatusIcon status="DEPLOYED" /> Mark as deployed
                </button>
              </div>
            )}
          </Section>
          {formError && <p className="text-sm font-medium text-red-500">{formError}</p>}
        </div>
      );
    }

    drawer = (
      <>
        <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={closePanel} aria-hidden="true" />
        <aside
          data-project-panel=""
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[600px] flex-col bg-white shadow-[-12px_0_40px_rgba(15,23,42,0.18)]"
        >
          {/* Edge handle, like the Employee drawer */}
          <button type="button" onClick={closePanel} aria-label="Collapse panel"
            className="absolute left-0 top-1/2 hidden h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm hover:text-slate-900 sm:grid">
            <ChevronIcon dir="right" />
          </button>

          {/* Header bar */}
          <div className="flex shrink-0 items-center justify-between gap-2 px-5 py-4">
            <div className="flex gap-2">
              {!isCreate && (
                <>
                  <button type="button" className={headerBtn} disabled={!prevProject} aria-label="Previous project"
                    onClick={() => prevProject && showProject(prevProject.project_code)}>
                    <ChevronIcon dir="left" />
                  </button>
                  <button type="button" className={headerBtn} disabled={!nextProject} aria-label="Next project"
                    onClick={() => nextProject && showProject(nextProject.project_code)}>
                    <ChevronIcon dir="right" />
                  </button>
                </>
              )}
            </div>
            <div className="flex gap-2">
              {panel === 'view' && (
                <button type="button" className={headerBtn} onClick={startEdit} aria-label="Edit project" title="Edit project">
                  <PencilIcon />
                </button>
              )}
              <button ref={closeBtnRef} type="button" className={headerBtn} onClick={closePanel} aria-label="Close panel" title="Close">
                <CloseIcon />
              </button>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* Hero band */}
            <div className="flex items-center gap-5 bg-[#F3F6FD] px-6 py-6">
              <div className="grid h-[88px] w-[88px] shrink-0 place-items-center rounded-full"
                style={{ background: isCreate ? '#E2E8F0' : `conic-gradient(${theme.ink} ${ring}%, ${theme.track} 0)` }}>
                <span className="grid h-[76px] w-[76px] place-items-center rounded-full bg-white text-lg font-bold tabular-nums" style={{ color: isCreate ? '#64748B' : theme.ink }}>
                  {isCreate ? '+' : `${utilization}%`}
                </span>
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-semibold leading-tight text-slate-900" style={{ textWrap: 'balance' }}>{title}</h2>
                {isCreate ? (
                  <p className="mt-2 text-sm text-slate-500">Create a project code staff can log time against.</p>
                ) : (
                  <>
                    <div className="mt-2 flex flex-wrap items-center gap-2.5">
                      <span className="rounded-md px-2 py-0.5 text-xs font-semibold" style={{ background: theme.bg, color: theme.ink }}>{theme.label}</span>
                      <span className="text-sm text-slate-500">{selected.project_code}</span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{selected.budget_hours ?? 0} budget hrs · Created {formatDate(selected.created_at)}</p>
                  </>
                )}
              </div>
            </div>

            {/* Tabs */}
            {panel === 'view' && (
              <div role="tablist" aria-label="Project sections" className="flex gap-6 border-b border-slate-100 px-6">
                {[['details', 'Details'], ['team', 'Team']].map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={drawerTab === id} onClick={() => setDrawerTab(id)}
                    className={`-mb-px border-b-2 py-3.5 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                      drawerTab === id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-700'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            )}

            <div className="p-6">{body}</div>
          </div>
        </aside>
      </>
    );
  }

  return (
    <>
      {grid}
      {drawer}
      {toast && (
        <div role="status" className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-slate-900 px-5 py-2.5 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
