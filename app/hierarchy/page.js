"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Image from 'next/image';
import axios from 'axios';

const BACKEND = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

const ROLE_OPTIONS = [
  { key: 'account_manager', label: 'Account Manager' },
  { key: 'manager', label: 'Manager' },
  { key: 'staff', label: 'Staff' },
  { key: 'hr', label: 'HR' },
];

function initialsOf(name) {
  return (name || '').split(' ').filter(Boolean).slice(0, 2).map((n) => n[0].toUpperCase()).join('') || '?';
}
function roleLabel(r) {
  return String(r || '').split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
function userRoles(u) {
  return Array.isArray(u.user_roles) && u.user_roles.length > 0 ? u.user_roles : [u.user_role].filter(Boolean);
}
// Which level of the global reporting tree a user belongs to. Priority: AM > Manager > Staff.
// A user who is only HR (or has no recognised role) sits outside that tree entirely.
function primaryLevel(u) {
  const roles = userRoles(u).map((r) => String(r).toLowerCase());
  if (roles.includes('account_manager')) return 'account_manager';
  if (roles.includes('manager')) return 'manager';
  if (roles.includes('staff')) return 'staff';
  return null;
}

const ROLE_COLOR = {
  account_manager: { border: '#7c3aed', text: '#6d28d9', bg: '#f5f3ff' },
  hr:              { border: '#16a34a', text: '#15803d', bg: '#f0fdf4' },
  manager:         { border: '#1a3a8f', text: '#1d4ed8', bg: '#eff6ff' },
  staff:           { border: '#64748b', text: '#475569', bg: '#f8fafc' },
};

/* ---------------------------------------------------------------------- */
/* Shared: role editor popover (add/change/remove a person's AM/Manager/  */
/* Staff/HR role membership) — used by both tabs.                         */
/* ---------------------------------------------------------------------- */

function RoleEditor({ user, requesterId, onSaved, onClose }) {
  const [selected, setSelected] = useState(userRoles(user).map((r) => String(r).toLowerCase()));
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState('');

  const toggle = (key) => {
    setSelected((prev) => (prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key]));
  };

  const save = async () => {
    if (selected.length === 0) return;
    setSubmitting(true); setFeedback('');
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/update-user-roles`, { requesterId, userId: user.user_id, roles: selected });
      await onSaved?.();
      onClose();
    } catch (err) {
      setFeedback(err.response?.data?.error || 'Failed to update roles.');
    } finally { setSubmitting(false); }
  };

  return (
    <div className="absolute z-20 mt-1 w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">Roles</p>
      <div className="space-y-1.5 mb-3">
        {ROLE_OPTIONS.map((r) => (
          <label key={r.key} className="flex items-center gap-2 text-xs text-slate-700">
            <input type="checkbox" checked={selected.includes(r.key)} onChange={() => toggle(r.key)} className="rounded border-slate-300" />
            {r.label}
          </label>
        ))}
      </div>
      {feedback && <p className="text-[11px] text-red-500 mb-2">{feedback}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={submitting || selected.length === 0}
          className="flex-1 rounded-lg bg-[#1a3a8f] px-2 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50">
          {submitting ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onClose}
          className="flex-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-slate-50">
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Tab 1: original per-project org tree, with the project search/filter.  */
/* ---------------------------------------------------------------------- */

const OrgNode = React.forwardRef(function OrgNode(
  { user, role, unassigned, editable, currentSupervisorId, supervisorOptions, onAssignSupervisor, onRemoveSupervisor },
  ref
) {
  if (!user) return null;
  const color = ROLE_COLOR[role] || ROLE_COLOR.staff;
  const [assigning, setAssigning] = React.useState(false);
  return (
    <div ref={ref} title={user.email}
      className="relative z-10 flex flex-col gap-1.5 rounded-xl border-2 bg-white px-3 py-2 shadow-sm"
      style={{ borderColor: unassigned ? '#f59e0b' : color.border, background: unassigned ? '#fffbeb' : color.bg, minWidth: 160, maxWidth: 200 }}>
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
          style={{ width: 32, height: 32, background: unassigned ? '#f59e0b' : color.border }}>
          {initialsOf(user.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
          <p className="text-[11px] font-medium truncate" style={{ color: unassigned ? '#b45309' : color.text }}>{roleLabel(role)}</p>
        </div>
        {editable && !unassigned && (
          <button type="button" onClick={() => setAssigning((v) => !v)} title="Reassign supervisor"
            className="flex-shrink-0 flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </button>
        )}
      </div>
      {unassigned && (
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
            Remove supervisor
          </button>
        </div>
      )}
    </div>
  );
});

function LevelLabel({ text }) {
  return <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300 mb-2">{text}</p>;
}
function Connector() { return <div className="mx-auto w-px h-6 bg-slate-300" />; }
function TreeRow({ children }) { return <div className="flex flex-wrap justify-center gap-4">{children}</div>; }

function ProjectOrgTree({ project, projectMembers, requesterId, onMembersChanged }) {
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

  const managerNodeRefs = useRef(new Map());
  const staffGroupRefs  = useRef(new Map());
  const unassignedGroupRef = useRef(null);
  const containerRef    = useRef(null);
  const [lines, setLines]               = useState([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const supervisorOptions = [...byRole.account_manager, ...byRole.manager];

  const handleAssignSupervisor = async (staffUserId, supervisorId) => {
    try {
      await axios.patch(`${BACKEND}/api/v1/users/set-supervisor`, { managerId: supervisorId, staffIds: [staffUserId] });
      await onMembersChanged?.();
    } catch (_) {}
  };

  const handleRemoveSupervisor = async (staffUserId) => {
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/remove-supervisor`, { requesterId, staffId: staffUserId });
      await onMembersChanged?.();
    } catch (_) {}
  };

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const box = container.getBoundingClientRect();
    setContainerSize({ width: container.scrollWidth, height: container.scrollHeight });
    const next = byRole.manager.map((mgr) => {
      const mEl = managerNodeRefs.current.get(mgr.user_id);
      const sEl = staffGroupRefs.current.get(mgr.user_id);
      if (!mEl || !sEl) return null;
      const mb = mEl.getBoundingClientRect();
      const sb = sEl.getBoundingClientRect();
      return { key: mgr.user_id, x1: mb.left + mb.width / 2 - box.left, y1: mb.bottom - box.top, x2: sb.left + sb.width / 2 - box.left, y2: sb.top - box.top };
    }).filter(Boolean);

    // AM row → each manager node
    byRole.account_manager.forEach((am) => {
      const amEl = managerNodeRefs.current.get(am.user_id + '_am');
      if (!amEl) return;
      const ab = amEl.getBoundingClientRect();
      byRole.manager.forEach((mgr) => {
        const mEl = managerNodeRefs.current.get(mgr.user_id);
        if (!mEl) return;
        const mb = mEl.getBoundingClientRect();
        next.push({
          key: `am-${am.user_id}-${mgr.user_id}`,
          x1: ab.left + ab.width / 2 - box.left, y1: ab.bottom - box.top,
          x2: mb.left + mb.width / 2 - box.left, y2: mb.top - box.top,
        });
      });
    });

    // Top row (manager, or AM if no managers) → unassigned staff group
    const unassignedEl = unassignedGroupRef.current;
    if (unassignedEl) {
      const ub = unassignedEl.getBoundingClientRect();
      const topRow = byRole.manager.length > 0 ? byRole.manager.map((m) => managerNodeRefs.current.get(m.user_id))
        : byRole.account_manager.map((am) => managerNodeRefs.current.get(am.user_id + '_am'));
      topRow.filter(Boolean).forEach((el, i) => {
        const b = el.getBoundingClientRect();
        next.push({
          key: `unassigned-${i}`,
          x1: b.left + b.width / 2 - box.left, y1: b.bottom - box.top,
          x2: ub.left + ub.width / 2 - box.left, y2: ub.top - box.top,
        });
      });
    }

    setLines(next);
  }, [byRole.manager, byRole.account_manager]);

  useEffect(() => { recompute(); }, [recompute]);
  useEffect(() => { window.addEventListener('resize', recompute); return () => window.removeEventListener('resize', recompute); }, [recompute]);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-8 overflow-x-auto">
      <div className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-400">{project.project_code}</p>
        <h2 className="text-xl font-semibold text-slate-900">{project.project_name}</h2>
        <p className="text-xs text-slate-400 mt-1">{project.budget_hours} hrs budget · {project.status || 'ACTIVE'} · {projectMembers.length} assigned</p>
      </div>
      <div ref={containerRef} className="relative flex flex-col items-center min-w-fit">
        <svg className="absolute inset-0 z-0 pointer-events-none"
          style={{ width: containerSize.width, height: containerSize.height }}
          width={containerSize.width} height={containerSize.height}>
          {lines.map((l) => (
            <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
              stroke="#cbd5e1" strokeWidth="1.5" strokeDasharray="4 3" />
          ))}
        </svg>
        {byRole.account_manager.length > 0 && (
          <>
            <LevelLabel text="Account Manager" />
            <TreeRow>
              {byRole.account_manager.map((m) => (
                <OrgNode key={m.user_id} ref={(el) => { if (el) managerNodeRefs.current.set(m.user_id + '_am', el); }} user={m} role="account_manager" />
              ))}
            </TreeRow>
          </>
        )}
        {byRole.manager.length > 0 && (
          <>
            {byRole.account_manager.length > 0 && <Connector />}
            <LevelLabel text="Manager" />
            <TreeRow>
              {byRole.manager.map((m) => (
                <OrgNode key={m.user_id}
                  ref={(el) => { if (el) managerNodeRefs.current.set(m.user_id, el); else managerNodeRefs.current.delete(m.user_id); }}
                  user={m} role="manager" />
              ))}
            </TreeRow>
          </>
        )}
        {byRole.manager.map((mgr) => {
          const group = staffByManager[mgr.user_id] || [];
          if (group.length === 0) return null;
          return (
            <div key={mgr.user_id}
              ref={(el) => { if (el) staffGroupRefs.current.set(mgr.user_id, el); else staffGroupRefs.current.delete(mgr.user_id); }}
              className="w-full flex flex-col items-center pt-8">
              <LevelLabel text={`Staff — reports to ${mgr.full_name}`} />
              <TreeRow>{group.map((s) => (
                <OrgNode key={s.user_id} user={s} role="staff" editable
                  currentSupervisorId={mgr.user_id} supervisorOptions={supervisorOptions}
                  onAssignSupervisor={handleAssignSupervisor} onRemoveSupervisor={handleRemoveSupervisor} />
              ))}</TreeRow>
            </div>
          );
        })}
        {(staffByManager['__unassigned'] || []).length > 0 && (
          <div ref={unassignedGroupRef} className="w-full flex flex-col items-center pt-8">
            <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-2">
              Unassigned / Direct Reports — No Supervisor
            </p>
            <TreeRow>
              {staffByManager['__unassigned'].map((s) => (
                <OrgNode key={s.user_id} user={s} role="staff" unassigned
                  supervisorOptions={supervisorOptions} onAssignSupervisor={handleAssignSupervisor} />
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

function ProjectTeamsTab({ requesterId, allUsers }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedCode, setSelectedCode] = useState(null);
  const [projectMembers, setProjectMembers] = useState([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [showAllProjects, setShowAllProjects] = useState(false);
  const COLLAPSED_ROWS_HEIGHT = 92; // ~2 rows of pills

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/v1/projects`);
      setProjects(res.data?.data || []);
    } catch {} finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

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
    const active = projectHierarchy.filter((p) => (p.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');
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

  if (loading) return <p className="text-sm text-slate-400 py-8">Loading…</p>;
  if (projectHierarchy.filter((p) => (p.status || 'ACTIVE').toUpperCase() !== 'INACTIVE').length === 0) {
    return <p className="text-sm text-slate-400 py-8">No active projects found.</p>;
  }

  return (
    <>
      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={projectSearch}
            onChange={(e) => { setProjectSearch(e.target.value); }}
            placeholder="Search project or person name…"
            className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400 w-60"
          />
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
        ? <ProjectOrgTree project={activeProject} projectMembers={projectMembers}
            requesterId={requesterId} onMembersChanged={() => fetchProjectMembers(selectedCode)} />
        : <p className="text-sm text-slate-400">Select a project above.</p>}
    </>
  );
}

/* ---------------------------------------------------------------------- */
/* Tab 2: global reporting structure — Account Manager -> Manager -> Staff, */
/* independent of any project. This is the AM<->Manager reporting line     */
/* that had no dedicated UI before.                                        */
/* ---------------------------------------------------------------------- */

function ReportingNode({ user, level, requesterId, isRoot, supervisorOptions, onReassign, onRemove, onRolesSaved }) {
  const [moving, setMoving] = useState(false);
  const [editingRoles, setEditingRoles] = useState(false);
  const color = ROLE_COLOR[level] || ROLE_COLOR.staff;

  return (
    <div title={user.email}
      className="relative flex flex-col gap-1.5 rounded-xl border-2 bg-white px-3 py-2 shadow-sm"
      style={{ borderColor: color.border, background: color.bg, minWidth: 180, maxWidth: 220 }}>
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
          style={{ width: 32, height: 32, background: color.border }}>
          {initialsOf(user.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
          <p className="text-[11px] font-medium truncate" style={{ color: color.text }}>{roleLabel(level)}</p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <button type="button" onClick={() => { setEditingRoles((v) => !v); setMoving(false); }} title="Edit roles"
            className="flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
          {!isRoot && (
            <button type="button" onClick={() => { setMoving((v) => !v); setEditingRoles(false); }} title="Reassign"
              className="flex items-center justify-center w-6 h-6 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          )}
        </div>
      </div>
      {editingRoles && (
        <RoleEditor user={user} requesterId={requesterId} onSaved={onRolesSaved} onClose={() => setEditingRoles(false)} />
      )}
      {moving && !isRoot && (
        <div className="space-y-1.5">
          <select autoFocus defaultValue=""
            onChange={(e) => { if (e.target.value) { onReassign(user.user_id, e.target.value); setMoving(false); } }}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none">
            <option value="" disabled>Move under…</option>
            {supervisorOptions.filter((s) => s.user_id !== user.supervisor_id).map((s) => (
              <option key={s.user_id} value={s.user_id}>{s.full_name}</option>
            ))}
          </select>
          {user.supervisor_id && (
            <button type="button" onClick={() => { onRemove(user.user_id); setMoving(false); }}
              className="w-full rounded-lg border border-dashed border-red-300 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-50 transition">
              Remove from team
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ReportingUnassignedNode({ user, level, supervisorOptions, onReassign }) {
  const [assigning, setAssigning] = useState(false);
  return (
    <div title={user.email}
      className="flex flex-col gap-1.5 rounded-xl border-2 border-dashed bg-white px-3 py-2 shadow-sm"
      style={{ borderColor: '#f59e0b', background: '#fffbeb', minWidth: 180, maxWidth: 220 }}>
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
          style={{ width: 32, height: 32, background: '#f59e0b' }}>
          {initialsOf(user.full_name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
          <p className="text-[11px] font-medium truncate text-amber-700">{roleLabel(level)}</p>
        </div>
      </div>
      {assigning ? (
        <select autoFocus defaultValue=""
          onChange={(e) => { if (e.target.value) { onReassign(user.user_id, e.target.value); setAssigning(false); } }}
          onBlur={() => setAssigning(false)}
          className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1 text-[11px] font-semibold text-amber-700 focus:outline-none">
          <option value="" disabled>Assign to…</option>
          {supervisorOptions.map((s) => <option key={s.user_id} value={s.user_id}>{s.full_name}</option>)}
        </select>
      ) : (
        <button type="button" onClick={() => setAssigning(true)}
          className="w-full rounded-lg border border-dashed border-amber-400 py-1 text-[11px] font-semibold text-amber-700 hover:bg-amber-100 transition">
          + Assign
        </button>
      )}
    </div>
  );
}

function ReportingTreeRow({ children }) { return <div className="flex flex-wrap gap-4">{children}</div>; }

function ReportingStructureTab({ requesterId, allUsers, onRefresh }) {
  const amList = useMemo(() => allUsers.filter((u) => primaryLevel(u) === 'account_manager'), [allUsers]);
  const managerList = useMemo(() => allUsers.filter((u) => primaryLevel(u) === 'manager'), [allUsers]);
  const staffList = useMemo(() => allUsers.filter((u) => primaryLevel(u) === 'staff'), [allUsers]);

  const amIds = useMemo(() => new Set(amList.map((u) => u.user_id)), [amList]);
  const managerIds = useMemo(() => new Set(managerList.map((u) => u.user_id)), [managerList]);

  const managersByAM = useMemo(() => {
    const map = new Map();
    amList.forEach((am) => map.set(am.user_id, []));
    managerList.forEach((m) => { if (amIds.has(m.supervisor_id)) map.get(m.supervisor_id).push(m); });
    return map;
  }, [amList, managerList, amIds]);
  const unassignedManagers = useMemo(() => managerList.filter((m) => !amIds.has(m.supervisor_id)), [managerList, amIds]);

  const staffByManager = useMemo(() => {
    const map = new Map();
    managerList.forEach((m) => map.set(m.user_id, []));
    staffList.forEach((s) => { if (managerIds.has(s.supervisor_id)) map.get(s.supervisor_id).push(s); });
    return map;
  }, [managerList, staffList, managerIds]);
  const unassignedStaff = useMemo(() => staffList.filter((s) => !managerIds.has(s.supervisor_id)), [staffList, managerIds]);

  const handleReassign = async (userId, supervisorId) => {
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/set-supervisor`, { requesterId, staffId: userId, supervisorId });
      await onRefresh();
    } catch (_) {}
  };
  const handleRemove = async (userId) => {
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/remove-supervisor`, { requesterId, staffId: userId });
      await onRefresh();
    } catch (_) {}
  };

  if (amList.length === 0) return <p className="text-sm text-slate-400 py-8">No Account Managers found.</p>;

  return (
    <div className="rounded-3xl border border-slate-200 bg-white shadow-sm p-8 space-y-8">
      {amList.map((am) => {
        const managers = managersByAM.get(am.user_id) || [];
        return (
          <div key={am.user_id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-5">
            <ReportingNode user={am} level="account_manager" requesterId={requesterId} isRoot
              supervisorOptions={[]} onReassign={handleReassign} onRemove={handleRemove} onRolesSaved={onRefresh} />
            {managers.length > 0 ? (
              <div className="mt-4 pl-6 border-l-2 border-slate-200 space-y-4">
                <ReportingTreeRow>
                  {managers.map((m) => (
                    <ReportingNode key={m.user_id} user={m} level="manager" requesterId={requesterId}
                      supervisorOptions={amList} onReassign={handleReassign} onRemove={handleRemove} onRolesSaved={onRefresh} />
                  ))}
                </ReportingTreeRow>
                {managers.map((m) => {
                  const staff = staffByManager.get(m.user_id) || [];
                  if (staff.length === 0) return null;
                  return (
                    <div key={m.user_id} className="pl-6 border-l-2 border-slate-200">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 mb-2">Reports to {m.full_name}</p>
                      <ReportingTreeRow>
                        {staff.map((s) => (
                          <ReportingNode key={s.user_id} user={s} level="staff" requesterId={requesterId}
                            supervisorOptions={managerList} onReassign={handleReassign} onRemove={handleRemove} onRolesSaved={onRefresh} />
                        ))}
                      </ReportingTreeRow>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="mt-3 pl-6 text-xs text-slate-400 italic">No managers reporting to this Account Manager yet.</p>
            )}
          </div>
        );
      })}

      {(unassignedManagers.length > 0 || unassignedStaff.length > 0) && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-600 mb-3">Unassigned</p>
          {unassignedManagers.length > 0 && (
            <div className="mb-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">Managers without an Account Manager</p>
              <ReportingTreeRow>
                {unassignedManagers.map((m) => (
                  <ReportingUnassignedNode key={m.user_id} user={m} level="manager" supervisorOptions={amList} onReassign={handleReassign} />
                ))}
              </ReportingTreeRow>
            </div>
          )}
          {unassignedStaff.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-2">Staff without a Manager</p>
              <ReportingTreeRow>
                {unassignedStaff.map((s) => (
                  <ReportingUnassignedNode key={s.user_id} user={s} level="staff" supervisorOptions={managerList} onReassign={handleReassign} />
                ))}
              </ReportingTreeRow>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Page shell: header, stats, tab switcher                                 */
/* ---------------------------------------------------------------------- */

function HierarchyContent() {
  const [requesterId, setRequesterId] = useState(null);
  const [allUsers, setAllUsers]       = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [logoMissing, setLogoMissing] = useState(false);
  const [activeTab, setActiveTab]     = useState('projects'); // 'projects' | 'reporting'

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setRequesterId(u.user_id);
    } catch {}
  }, []);

  const fetchUsers = useCallback(async (rid) => {
    if (!rid) return;
    setUsersLoading(true);
    try {
      const res = await axios.get(`${BACKEND}/api/v1/hr/active-users?requesterId=${rid}`);
      setAllUsers(res.data?.data || []);
    } catch {} finally { setUsersLoading(false); }
  }, []);

  useEffect(() => { if (requesterId) fetchUsers(requesterId); }, [requesterId, fetchUsers]);

  const stats = useMemo(() => {
    const count = (role) => allUsers.filter((u) => userRoles(u).includes(role)).length;
    return { hr: count('hr'), account_manager: count('account_manager'), manager: count('manager'), staff: count('staff') };
  }, [allUsers]);

  return (
    <div className="p-8">
      <div className="mb-7 flex items-start justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Organisation Hierarchy</h1>
          <p className="mt-2 text-sm text-slate-500">Visualise project reporting lines, or manage the Account Manager → Manager → Staff reporting structure directly.</p>
        </div>
        <div className="hidden md:block">
          {!logoMissing
            ? <Image src="/nextan-logo.png" alt="Nextan" width={140} height={44} className="object-contain opacity-80" onError={() => setLogoMissing(true)} />
            : <span className="text-lg font-bold tracking-tight text-blue-900">nextan</span>}
        </div>
      </div>

      <div className="mb-7 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: 'HR',               value: stats.hr,              color: 'text-green-700'  },
          { label: 'Account Managers',  value: stats.account_manager, color: 'text-purple-700' },
          { label: 'Managers',          value: stats.manager,         color: 'text-blue-700'   },
          { label: 'Staff',             value: stats.staff,           color: 'text-slate-700'  },
        ].map((s) => (
          <div key={s.label} className="rounded-2xl border border-gray-100 bg-white px-6 py-5 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">{s.label}</p>
            <p className={`mt-3 text-4xl font-semibold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex gap-2">
        <button type="button" onClick={() => setActiveTab('projects')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold border transition ${activeTab === 'projects' ? 'bg-[#1a3a8f] text-white border-[#1a3a8f] shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
          Project Teams
        </button>
        <button type="button" onClick={() => setActiveTab('reporting')}
          className={`rounded-xl px-4 py-2 text-sm font-semibold border transition ${activeTab === 'reporting' ? 'bg-[#1a3a8f] text-white border-[#1a3a8f] shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
          Reporting Structure
        </button>
      </div>

      {activeTab === 'projects' ? (
        usersLoading ? <p className="text-sm text-slate-400 py-8">Loading…</p> : (
          <ProjectTeamsTab requesterId={requesterId} allUsers={allUsers} />
        )
      ) : (
        <>
          <p className="mb-4 text-xs text-slate-400">
            Click <span className="font-semibold">✓</span> on any card to edit that person&rsquo;s roles, or <span className="font-semibold">✎</span> to reassign who they report to. HR is not shown here since HR oversees every project already.
          </p>
          {usersLoading ? <p className="text-sm text-slate-400 py-8">Loading…</p> : (
            <ReportingStructureTab requesterId={requesterId} allUsers={allUsers} onRefresh={() => fetchUsers(requesterId)} />
          )}
        </>
      )}
    </div>
  );
}

export default function HierarchyPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-slate-400">Loading hierarchy…</div>}>
      <HierarchyContent />
    </Suspense>
  );
}
