"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import axios from 'axios';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

function initialsOf(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || '?';
}
function roleLabel(r) {
  return String(r || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function userRoles(u) {
  return Array.isArray(u.user_roles) && u.user_roles.length > 0 ? u.user_roles : [u.user_role].filter(Boolean);
}
const MANAGERS_PER_ROW = 4;
function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const ROLE_COLOR = {
  account_manager: { avatar: '#534AB7', text: '#3C3489', pillBg: '#EEEDFE', pillText: '#3C3489' },
  hr:              { avatar: '#16a34a', text: '#14532d', pillBg: '#f0fdf4', pillText: '#14532d' },
  manager:         { avatar: '#993556', text: '#993556', pillBg: '#FBEAF0', pillText: '#993556' },
  staff:           { avatar: '#0F6E56', text: '#085041', pillBg: '#E1F5EE', pillText: '#085041' },
};

const OrgNode = React.forwardRef(function OrgNode(
  { user, role, unassigned, editable, removable, currentSupervisorId, supervisorOptions, onAssignSupervisor, onRemoveSupervisor, onRemoveFromProject },
  ref
) {
  if (!user) return null;
  const color = ROLE_COLOR[role] || ROLE_COLOR.staff;
  const [assigning, setAssigning] = React.useState(false);
  return (
    <div ref={ref} title={user.email}
      className="relative z-10 flex flex-col gap-1.5 rounded-2xl border bg-white px-3.5 py-2.5 shadow-sm"
      style={{ borderColor: unassigned ? '#f59e0b' : '#e2e8f0', background: unassigned ? '#fffbeb' : '#ffffff', minWidth: 180, maxWidth: 240 }}>
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
          style={{ width: 32, height: 32, background: unassigned ? '#f59e0b' : color.avatar }}>
          {initialsOf(user.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
          <p className="text-[11px] font-semibold truncate" style={{ color: unassigned ? '#92400e' : color.text }}>{roleLabel(role)}</p>
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {editable && !unassigned && (
            <button type="button" onClick={() => setAssigning((v) => !v)} title="Reassign supervisor"
              className="flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
          {removable && (
            <button type="button" onClick={() => onRemoveFromProject(user.user_id)} title="Remove from project"
              className="flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-red-50 hover:text-red-500 transition">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" /><path d="M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {unassigned && editable && (
        assigning ? (
          <select autoFocus defaultValue=""
            onChange={(e) => { if (e.target.value) { onAssignSupervisor(user.user_id, e.target.value); setAssigning(false); } }}
            onBlur={() => setAssigning(false)}
            className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 focus:outline-none">
            <option value="" disabled>Select supervisor…</option>
            {supervisorOptions.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
          </select>
        ) : (
          <button type="button" onClick={() => setAssigning(true)}
            className="w-full rounded-lg border border-dashed border-amber-400 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition">
            + Assign Manager
          </button>
        )
      )}
      {editable && !unassigned && assigning && (
        <div className="space-y-1.5">
          <select autoFocus defaultValue=""
            onChange={(e) => { if (e.target.value) { onAssignSupervisor(user.user_id, e.target.value); setAssigning(false); } }}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none">
            <option value="" disabled>Reassign to…</option>
            {supervisorOptions.filter((s) => s.user_id !== currentSupervisorId).map((s) => (
              <option key={s.user_id} value={s.user_id}>{s.full_name}</option>
            ))}
          </select>
          <button type="button" onClick={() => { onRemoveSupervisor(user.user_id); setAssigning(false); }}
            className="w-full rounded-lg border border-dashed border-red-300 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-50 transition">
            Remove Manager
          </button>
        </div>
      )}
    </div>
  );
});

function TierPill({ role, text }) {
  const color = ROLE_COLOR[role] || ROLE_COLOR.staff;
  return (
    <div className="flex justify-center mb-2">
      <span className="rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em]"
        style={{ background: color.pillBg, color: color.pillText }}>
        {text}
      </span>
    </div>
  );
}
function Connector() { return <div className="mx-auto w-px h-6 bg-slate-300" />; }
function TreeRow({ children }) { return <div className="flex flex-wrap justify-center gap-4">{children}</div>; }

function personRoleLabel(u) {
  const roles = userRoles(u);
  return roles.length > 0 ? roleLabel(roles[0]) : '—';
}

function AddPersonNode({ role, options, onAdd }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { if (open) inputRef.current?.focus(); }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((u) => (u.full_name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
  }, [options, query]);

  if (open) {
    return (
      <div className="relative" style={{ minWidth: 180, maxWidth: 220 }}>
        <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input ref={inputRef} type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Search name…"
          className="w-full rounded-xl border-2 border-dashed border-blue-300 bg-white pl-9 pr-3 py-2 text-xs font-semibold text-blue-700 focus:outline-none" />
        <div className="absolute z-30 mt-1 w-full max-h-52 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-[11px] text-slate-400">No matches</p>
          ) : filtered.map((u) => (
            <button key={u.user_id} type="button"
              onMouseDown={(e) => { e.preventDefault(); onAdd(u.user_id); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs text-slate-700 hover:bg-blue-50">
              <span className="truncate">{u.full_name}</span>
              <span className="flex-shrink-0 text-[10px] text-slate-400">{personRoleLabel(u)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }
  return (
    <button type="button" onClick={() => { setOpen(true); setQuery(''); }}
      className="flex items-center justify-center rounded-xl border-2 border-dashed border-blue-300 px-3 py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 transition"
      style={{ minWidth: 160, maxWidth: 200, minHeight: 52 }}>
      + Add {roleLabel(role)}
    </button>
  );
}

function ProjectOrgTree({ project, allUsers, projectMembers, requesterId, onMembersChanged }) {
  // Group members by their project_role (from project_assignments.project_role)
  const byRole = useMemo(() => {
    const groups = { account_manager: [], manager: [], staff: [] };
    projectMembers.forEach((m) => {
      const r = m.project_role || 'staff';
      if (!groups[r]) groups[r] = [];
      groups[r].push(m);
    });
    return groups;
  }, [projectMembers]);

  // Staff grouped under their supervisor within this project
  const staffByManager = useMemo(() => {
    const groups = {};
    byRole.manager.forEach((mgr) => { groups[mgr.user_id] = []; });
    groups['__unassigned'] = [];
    byRole.staff.forEach((s) => {
      if (s.supervisor_id && groups[s.supervisor_id]) {
        groups[s.supervisor_id].push(s);
      } else {
        groups['__unassigned'].push(s);
      }
    });
    return groups;
  }, [byRole]);   

  const [actionError, setActionError]   = useState('');
  const [editMode, setEditMode]         = useState(false);

  // Staff report to a Manager, not the project's Account Manager — the AM is a separate
  // approval tier and shouldn't be selectable as someone's direct supervisor here.
  const supervisorOptions = byRole.manager;

  const memberIds = useMemo(() => new Set(projectMembers.map((m) => m.user_id)), [projectMembers]);
  // Any person in the system can be assigned to any level here — the project role assigned is
  // independent of that person's own account role.
  const candidatePool = useMemo(
    () => allUsers.filter((u) => !memberIds.has(u.user_id)),
    [allUsers, memberIds]
  );

  const handleAssignSupervisor = async (staffUserId, supervisorId) => {
    setActionError('');
    try {
      await axios.patch(`${BACKEND}/api/v1/users/set-supervisor`, { managerId: supervisorId, staffIds: [staffUserId] });
      await onMembersChanged?.();
    } catch (err) { setActionError(err.response?.data?.error || 'Failed to assign manager.'); }
  };

  const handleRemoveSupervisor = async (staffUserId) => {
    setActionError('');
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/remove-supervisor`, { requesterId, staffId: staffUserId });
      await onMembersChanged?.();
    } catch (err) { setActionError(err.response?.data?.error || 'Failed to remove manager.'); }
  };

  const handleAddToProject = async (userId, projectRole) => {
    setActionError('');
    try {
      // Pass the intended project role directly — assigning first and correcting the role
      // afterward let the backend's "demote the existing Account Manager" side effect fire
      // against a temporary, wrong default role instead of the one actually being set here.
      await axios.post(`${BACKEND}/api/v1/projects/assign-bulk`, {
        managerId: requesterId, userIds: [userId], projectCode: project.project_code, projectRole,
      });
      await onMembersChanged?.();
    } catch (err) { setActionError(err.response?.data?.error || 'Failed to add to project.'); }
  };

  const handleAddStaffToManager = async (userId, managerId) => {
    setActionError('');
    try {
      await axios.post(`${BACKEND}/api/v1/projects/assign-bulk`, {
        managerId: requesterId, userIds: [userId], projectCode: project.project_code, projectRole: 'staff',
      });
      await axios.patch(`${BACKEND}/api/v1/users/set-supervisor`, { managerId, staffIds: [userId] });
      await onMembersChanged?.();
    } catch (err) { setActionError(err.response?.data?.error || 'Failed to add staff.'); }
  };

  const handleRemoveFromProject = async (userId) => {
    setActionError('');
    try {
      await axios.delete(`${BACKEND}/api/v1/assignments/remove`, {
        data: { managerId: requesterId, userId, projectCode: project.project_code },
      });
      await onMembersChanged?.();
    } catch (err) { setActionError(err.response?.data?.error || 'Failed to remove from project.'); }
  };

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-8 overflow-x-auto">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{project.project_code}</p>
          <h2 className="text-xl font-semibold text-slate-900">{project.project_name}</h2>
          <p className="text-xs text-slate-400 mt-1">{project.budget_hours} hrs budget · {(project.status || 'ACTIVE').toUpperCase() === 'INACTIVE' ? 'DEPLOYED' : (project.status || 'ACTIVE')} · {projectMembers.length} assigned</p>
        </div>
        <button type="button" onClick={() => setEditMode((v) => !v)}
          className={`flex-shrink-0 flex items-center gap-1.5 rounded-xl border px-4 py-2 text-xs font-semibold transition ${
            editMode ? 'border-[#1a3a8f] bg-[#1a3a8f] text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          {editMode ? 'Save' : 'Edit Organisation'}
        </button>
      </div>
      {actionError && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">
          {actionError}
          <button type="button" onClick={() => setActionError('')} className="flex-shrink-0 text-red-400 hover:text-red-600" aria-label="Dismiss">×</button>
        </div>
      )}
      <div className="relative flex flex-col items-center min-w-fit rounded-2xl px-8 py-8 border border-slate-200"
        style={editMode
          ? { backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '18px 18px', backgroundColor: '#fafafa' }
          : { backgroundColor: '#ffffff' }}>
        <TierPill role="account_manager" text="Account Manager" />
        <TreeRow>
          {byRole.account_manager.map((m) => (
            <OrgNode key={m.user_id} user={m} role="account_manager" removable={editMode} onRemoveFromProject={handleRemoveFromProject} />
          ))}
          {editMode && byRole.account_manager.length === 0 && (
            <AddPersonNode role="account_manager" options={candidatePool}
              onAdd={(userId) => handleAddToProject(userId, 'account_manager')} />
          )}
        </TreeRow>
        <Connector />
        {/* Each manager and their own staff form a self-contained column, side by side —
            so a manager's branch line never has to cross into another manager's branch.
            Rows are chunked to MANAGERS_PER_ROW so a re-shown "Manager" pill marks the
            start of every new row once managers wrap. */}
        {chunk(editMode ? [...byRole.manager, { __addManager: true }] : byRole.manager, MANAGERS_PER_ROW).map((row, rowIndex) => (
          <React.Fragment key={rowIndex}>
            <TierPill role="manager" text="Manager" />
            <div className="w-full flex flex-row flex-nowrap justify-center items-start gap-10 mb-8 last:mb-0">
              {row.map((mgr) => {
                if (mgr.__addManager) {
                  return (
                    <div key="__add" className="flex flex-col items-center">
                      <AddPersonNode role="manager" options={candidatePool}
                        onAdd={(userId) => handleAddToProject(userId, 'manager')} />
                    </div>
                  );
                }
                const group = staffByManager[mgr.user_id] || [];
                return (
                  <div key={mgr.user_id} className="flex flex-col items-start">
                    <OrgNode user={mgr} role="manager" removable={editMode} onRemoveFromProject={handleRemoveFromProject} />
                    <div className="relative mt-4" style={{ paddingLeft: 28, width: 252 }}>
                      <div className="absolute" style={{ left: 13, top: -16, bottom: 22, width: 1, background: '#cbd5e1' }} />
                      <div className="flex flex-col gap-3">
                        {group.map((s) => (
                          <div key={s.user_id} className="relative">
                            <div className="absolute" style={{ left: -15, top: 21, width: 15, height: 1, background: '#cbd5e1' }} />
                            <OrgNode user={s} role="staff" editable={editMode} removable={editMode}
                              currentSupervisorId={mgr.user_id} supervisorOptions={supervisorOptions}
                              onAssignSupervisor={handleAssignSupervisor} onRemoveSupervisor={handleRemoveSupervisor}
                              onRemoveFromProject={handleRemoveFromProject} />
                          </div>
                        ))}
                        {editMode && (
                          <div className="relative">
                            <div className="absolute" style={{ left: -15, top: 26, width: 15, height: 1, background: '#cbd5e1' }} />
                            <AddPersonNode role="staff" options={candidatePool}
                              onAdd={(userId) => handleAddStaffToManager(userId, mgr.user_id)} />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </React.Fragment>
        ))}
        {(staffByManager['__unassigned'] || []).length > 0 && (
          <div className="w-full flex flex-col items-center pt-8">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-2">
              No Manager Assigned
            </p>
            <TreeRow>
              {staffByManager['__unassigned'].map((s) => (
                <OrgNode key={s.user_id} user={s} role="staff" unassigned editable={editMode} removable={editMode}
                  supervisorOptions={supervisorOptions} onAssignSupervisor={handleAssignSupervisor}
                  onRemoveFromProject={handleRemoveFromProject} />
              ))}
            </TreeRow>
          </div>
        )}
        {projectMembers.length === 0 && (
          <p className="mt-6 text-sm text-slate-400 italic">No members assigned to this project yet.</p>
        )}
      </div>
    </div>
  );
}

function HierarchyContent({ hideHeader = false }) {
  const [requesterId, setRequesterId]   = useState(null);
  const [allUsers, setAllUsers]         = useState([]);
  const [projects, setProjects]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selectedCode, setSelectedCode] = useState(null);
  const [projectMembers, setProjectMembers] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [showAllProjects, setShowAllProjects] = useState(false);
  const COLLAPSED_ROWS_HEIGHT = 92; // ~2 rows of pills

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setRequesterId(u.user_id);
    } catch {}
  }, []);

  const fetchData = useCallback(async (rid) => {
    if (!rid) return;
    setLoading(true);
    try {
      const [usersRes, projRes] = await Promise.all([
        axios.get(`${BACKEND}/api/v1/hr/active-users?requesterId=${rid}`),
        axios.get(`${BACKEND}/api/v1/projects`),
      ]);
      setAllUsers(usersRes.data?.data || []);
      setProjects(projRes.data?.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { if (requesterId) fetchData(requesterId); }, [requesterId, fetchData]);

  const projectHierarchy = useMemo(() => projects.map((p) => {
    const am = allUsers.find((u) => u.user_id === p.account_manager_id);
    const mgrIds = Array.isArray(p.manager_ids) ? p.manager_ids : [p.account_manager_id].filter(Boolean);
    return { ...p, accountManager: am, projectManagers: allUsers.filter((u) => mgrIds.includes(u.user_id)) };
  }), [projects, allUsers]);

  useEffect(() => {
    if (!loading && !selectedCode && projectHierarchy.length > 0) {
      setSelectedCode(projectHierarchy[0].project_code);
    }
  }, [loading, selectedCode, projectHierarchy]);

  // (URL sync removed — caused router.replace crash in Next.js App Router)

  const fetchProjectMembers = useCallback((code) => {
    if (!code) return;
    axios.get(`${BACKEND}/api/v1/projects/${code}/members`)
      .then((r) => setProjectMembers(r.data?.data || []))
      .catch(() => setProjectMembers([]));
  }, []);

  useEffect(() => { fetchProjectMembers(selectedCode); }, [selectedCode, fetchProjectMembers]);

  const activeProject = projectHierarchy.find((p) => p.project_code === selectedCode);

  const visibleProjects = useMemo(() => {
    const q = projectSearch.trim().toLowerCase();
    const active = projectHierarchy.filter((p) => !['INACTIVE', 'DEPLOYED'].includes((p.status || 'ACTIVE').toUpperCase()));
    if (!q) return active;
    return active.filter((p) => {
      const amNames = p.account_manager_names || (p.accountManager ? [p.accountManager.full_name] : []);
      const mgrNames = (p.projectManagers || []).map((m) => m.full_name);
      const peopleMatch = [...amNames, ...mgrNames].some((n) => (n || '').toLowerCase().includes(q));
      return p.project_code.toLowerCase().includes(q) || (p.project_name || '').toLowerCase().includes(q) || peopleMatch;
    });
  }, [projectHierarchy, projectSearch]);

  const hasActiveFilter = Boolean(projectSearch.trim());
  const isCollapsed = !showAllProjects && !hasActiveFilter;

  return (
    <div className={hideHeader ? '' : 'p-8'}>
      {!hideHeader && (
        <div className="mb-10 pl-3">
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Organisation Hierarchy</h1>
          <p className="mt-2 text-sm text-slate-500">Visualise project reporting lines, reassign roles, and review employee project involvement.</p>
        </div>
      )}
      {loading ? <p className="text-sm text-slate-400 py-8">Loading…</p> : (
        projectHierarchy.filter((p) => !['INACTIVE', 'DEPLOYED'].includes((p.status || 'ACTIVE').toUpperCase())).length === 0
          ? <p className="text-sm text-slate-400 py-8">No active projects found.</p>
          : (
          <>
            <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-5 flex flex-wrap items-center gap-3">
                <div className="relative">
                  <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <input
                    type="text"
                    value={projectSearch}
                    onChange={(e) => { setProjectSearch(e.target.value); }}
                    placeholder="Search project or person name…"
                    className="rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-60"
                  />
                </div>
                <span className="ml-auto text-xs text-slate-400">{visibleProjects.length} project{visibleProjects.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="overflow-hidden" style={isCollapsed ? { maxHeight: COLLAPSED_ROWS_HEIGHT } : undefined}>
                <div className="flex flex-wrap gap-2">
                  {visibleProjects.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-slate-400">No projects match your search.</p>
                  ) : visibleProjects.map((p) => (
                    <button key={p.project_code} onClick={() => setSelectedCode(p.project_code)}
                      className={`rounded-xl px-4 py-2 text-xs font-semibold border transition ${p.project_code === selectedCode ? 'bg-[#1a3a8f] text-white border-[#1a3a8f] shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {p.project_code} · {p.project_name}
                    </button>
                  ))}
                </div>
              </div>
              {!hasActiveFilter && visibleProjects.length > 0 && (
                <div className="mt-4 flex justify-center">
                  <button type="button" onClick={() => setShowAllProjects((v) => !v)}
                    className="flex items-center gap-2 rounded-2xl bg-[#1a3a8f] px-6 py-2.5 text-sm font-semibold text-white shadow hover:bg-[#12307a] transition">
                    {showAllProjects ? (
                      <>Show less <span>▲</span></>
                    ) : (
                      <>Show all {visibleProjects.length} projects <span>▼</span></>
                    )}
                  </button>
                </div>
              )}
            </div>
            {activeProject
              ? <ProjectOrgTree project={activeProject} allUsers={allUsers} projectMembers={projectMembers}
                  requesterId={requesterId} onMembersChanged={() => fetchProjectMembers(selectedCode)} />
              : <p className="text-sm text-slate-400">Select a project above.</p>}
          </>
        )
      )}
    </div>
  );
}

export default function HierarchyPage({ hideHeader = false } = {}) {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">Loading hierarchy…</div>}>
      <HierarchyContent hideHeader={hideHeader} />
    </Suspense>
  );
}