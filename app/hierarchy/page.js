"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense } from 'react';
import Image from 'next/image';
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
function primaryRole(u) {
  const priority = ['hr', 'account_manager', 'manager', 'staff'];
  const r = userRoles(u);
  return priority.find((p) => r.includes(p)) || 'staff';
}

const ROLE_COLOR = {
  account_manager: { border: '#7c3aed', text: '#6d28d9', bg: '#f5f3ff' },
  hr:              { border: '#16a34a', text: '#15803d', bg: '#f0fdf4' },
  manager:         { border: '#1a3a8f', text: '#1d4ed8', bg: '#eff6ff' },
  staff:           { border: '#64748b', text: '#475569', bg: '#f8fafc' },
};
const ROLE_LABELS = { hr: 'HR', account_manager: 'Account Manager', manager: 'Manager', staff: 'Staff' };

const OrgNode = React.forwardRef(function OrgNode({ user, role }, ref) {
  if (!user) return null;
  const color = ROLE_COLOR[role] || ROLE_COLOR.staff;
  return (
    <div ref={ref}
      className="relative z-10 flex items-center gap-2 rounded-xl border-2 bg-white px-3 py-2 shadow-sm"
      style={{ borderColor: color.border, background: color.bg, minWidth: 160, maxWidth: 200 }}>
      <div className="flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
        style={{ width: 32, height: 32, background: color.border }}>
        {initialsOf(user.full_name)}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
        <p className="text-[11px] font-medium truncate" style={{ color: color.text }}>{roleLabel(role)}</p>
        <p className="text-[10px] text-slate-400 truncate">{user.email}</p>
      </div>
    </div>
  );
});

function LevelLabel({ text }) {
  return <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300 mb-2">{text}</p>;
}
function Connector() { return <div className="mx-auto w-px h-6 bg-slate-300" />; }
function TreeRow({ children }) { return <div className="flex flex-wrap justify-center gap-4">{children}</div>; }

function ProjectOrgTree({ project, allUsers, projectMembers, onRoleChange }) {
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
  const containerRef    = useRef(null);
  const [lines, setLines]               = useState([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

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
    setLines(next);
  }, [byRole.manager]);

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
              <TreeRow>{group.map((s) => <OrgNode key={s.user_id} user={s} role="staff" />)}</TreeRow>
            </div>
          );
        })}
        {(staffByManager['__unassigned'] || []).length > 0 && (
          <div className="w-full flex flex-col items-center pt-8">
            <LevelLabel text="Staff — no supervisor linked" />
            <TreeRow>{staffByManager['__unassigned'].map((s) => <OrgNode key={s.user_id} user={s} role="staff" />)}</TreeRow>
          </div>
        )}
        {projectMembers.length === 0 && (
          <p className="mt-6 text-sm text-slate-400 italic">No members assigned to this project yet.</p>
        )}
      </div>
    </div>
  );
}

const ALL_ROLES_LIST = [
  { key: 'hr',              label: 'HR',              color: 'bg-green-50 text-green-700 border-green-200'    },
  { key: 'account_manager', label: 'Account Manager', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  { key: 'manager',         label: 'Manager',          color: 'bg-blue-50 text-blue-700 border-blue-200'      },
  { key: 'staff',           label: 'Staff',            color: 'bg-slate-100 text-slate-600 border-slate-200'  },
];

function RoleBadge({ role }) {
  const def = ALL_ROLES_LIST.find((r) => r.key === role);
  return (
    <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${def?.color || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
      {def?.label || roleLabel(role)}
    </span>
  );
}

function RoleAssignmentTab({ allUsers, projects, requesterId, onRefresh }) {
  const ACTIVE_PROJECTS = projects.filter((p) => (p.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [projectMembers, setProjectMembers] = useState([]);
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState('');
  const [roleModal, setRoleModal] = useState(null);
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [projectRoleSaving, setProjectRoleSaving] = useState(null); // userId being updated

  useEffect(() => {
    if (projectFilter === 'ALL') { setProjectMembers([]); return; }
    axios.get(`${BACKEND}/api/v1/projects/${projectFilter}/members`)
      .then((r) => setProjectMembers(r.data?.data || []))
      .catch(() => setProjectMembers([]));
  }, [projectFilter]);

  const displayUsers = useMemo(() => {
    const base = projectFilter === 'ALL' ? allUsers : projectMembers;
    const q = search.trim().toLowerCase();
    return q ? base.filter((u) => (u.full_name + ' ' + u.email).toLowerCase().includes(q)) : base;
  }, [projectFilter, allUsers, projectMembers, search]);

  const openModal = (u) => { setRoleModal(u); setSelectedRoles(userRoles(u)); setFeedback(''); };

  const saveRoles = async () => {
    if (!roleModal || selectedRoles.length === 0) return;
    setSaving(true);
    try {
      await axios.patch(`${BACKEND}/api/v1/hr/update-user-roles`, { requesterId, userId: roleModal.user_id, roles: selectedRoles });
      setFeedback('Roles updated.'); setRoleModal(null); await onRefresh();
    } catch (err) { setFeedback(err.response?.data?.error || 'Failed.'); }
    finally { setSaving(false); }
  };

  const updateProjectRole = async (userId, projectCode, newRole) => {
    setProjectRoleSaving(userId);
    try {
      await axios.patch(`${BACKEND}/api/v1/projects/assignments/role`, { managerId: requesterId, userId, projectCode, projectRole: newRole });
      // Refresh members list
      const r = await axios.get(`${BACKEND}/api/v1/projects/${projectCode}/members`);
      setProjectMembers(r.data?.data || []);
      setFeedback(`Project role updated for ${projectCode}.`);
    } catch (err) { setFeedback(err.response?.data?.error || 'Failed to update project role.'); }
    finally { setProjectRoleSaving(null); }
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1">Filter by project</label>
          <select value={projectFilter} onChange={(e) => { setProjectFilter(e.target.value); setFeedback(''); }}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="ALL">All users in database</option>
            {ACTIVE_PROJECTS.map((p) => (
              <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>
            ))}
          </select>
        </div>
        <div className="ml-auto">
          <label className="block text-xs font-semibold text-slate-600 mb-1">Search</label>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or email…"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>
      {feedback && (
        <div className={`mb-4 rounded-2xl px-4 py-3 text-sm font-medium border ${feedback.includes('updated') ? 'border-green-200 bg-green-50 text-green-700' : 'border-red-200 bg-red-50 text-red-700'}`}>{feedback}</div>
      )}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">Role Assignment</p>
          <p className="mt-0.5 font-semibold text-slate-900">
            {projectFilter === 'ALL' ? `All ${displayUsers.length} users` : `${displayUsers.length} members of ${projectFilter}`}
          </p>
          {projectFilter !== 'ALL' && (
            <p className="mt-1 text-xs text-slate-400">
              Manage Roles → changes the employee's <strong>global system role</strong> (portal access). &nbsp;|
              Project Role dropdown → changes their <strong>role within {projectFilter} only</strong>.
            </p>
          )}
        </div>
        {displayUsers.length === 0 ? (
          <p className="px-6 py-8 text-sm text-slate-400">No users found.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              <tr>
                <th className="px-6 py-3">Name</th>
                <th className="px-6 py-3">Email</th>
                <th className="px-6 py-3">System Roles</th>
                {projectFilter !== 'ALL' && <th className="px-6 py-3">Role in {projectFilter}</th>}
                <th className="px-6 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {displayUsers.map((u) => (
                <tr key={u.user_id} className="hover:bg-slate-50 transition">
                  <td className="px-6 py-3 font-semibold text-slate-900">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 flex items-center justify-center rounded-full text-white text-xs font-bold flex-shrink-0"
                        style={{ background: ROLE_COLOR[primaryRole(u)]?.border || '#64748b' }}>
                        {initialsOf(u.full_name)}
                      </div>
                      {u.full_name}
                    </div>
                  </td>
                  <td className="px-6 py-3 text-slate-500">{u.email}</td>
                  <td className="px-6 py-3"><div className="flex flex-wrap gap-1">{userRoles(u).map((r) => <RoleBadge key={r} role={r} />)}</div></td>
                  {projectFilter !== 'ALL' && (
                    <td className="px-6 py-3">
                      <select
                        value={u.project_role || 'staff'}
                        disabled={projectRoleSaving === u.user_id}
                        onChange={(e) => updateProjectRole(u.user_id, projectFilter, e.target.value)}
                        className="rounded-xl border border-slate-300 px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
                        style={{ color: ROLE_COLOR[u.project_role || 'staff']?.text }}>
                        <option value="account_manager">Account Manager</option>
                        <option value="manager">Manager</option>
                        <option value="staff">Staff</option>
                      </select>
                    </td>
                  )}
                  <td className="px-6 py-3">
                    <button onClick={() => openModal(u)}
                      className="rounded-xl border border-[#1a3a8f] px-3 py-1.5 text-xs font-semibold text-[#1a3a8f] hover:bg-[#e8edf8] transition">
                      Manage Roles
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {roleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Manage Roles</h2>
                <p className="text-sm text-slate-500 mt-0.5">{roleModal.full_name} · {roleModal.email}</p>
              </div>
              <button onClick={() => setRoleModal(null)} className="text-xl text-slate-400 hover:text-slate-600">&times;</button>
            </div>
            <div className="px-6 py-5 space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400 mb-4">Select all applicable roles. You must select at least one.</p>
              {ALL_ROLES_LIST.map(({ key, label, color }) => {
                const checked = selectedRoles.includes(key);
                return (
                  <label key={key}
                    className={`flex items-center gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition ${checked ? 'border-[#1a3a8f] bg-[#e8edf8]' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <input type="checkbox" checked={checked}
                      onChange={() => setSelectedRoles((prev) => prev.includes(key) ? prev.filter((r) => r !== key) : [...prev, key])}
                      className="rounded border-slate-300" />
                    <span className={`text-sm font-semibold ${checked ? 'text-[#1a3a8f]' : 'text-slate-700'}`}>{label}</span>
                  </label>
                );
              })}
              {feedback && <p className={`rounded-xl px-4 py-2.5 text-sm font-medium ${feedback.includes('updat') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>{feedback}</p>}
            </div>
            <div className="flex gap-3 justify-end px-6 pb-6">
              <button onClick={() => setRoleModal(null)} className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700">Cancel</button>
              <button onClick={saveRoles} disabled={saving || selectedRoles.length === 0}
                className="rounded-2xl bg-[#1a3a8f] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60 hover:bg-[#12307a] transition">
                {saving ? 'Saving…' : 'Save Roles'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeOverview({ allUsers, projects }) {
  const ACTIVE_PROJECTS = projects.filter((p) => (p.status || 'ACTIVE').toUpperCase() !== 'INACTIVE');
  const [search, setSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState('ALL');

  const userProjectMap = useMemo(() => {
    const map = {};
    ACTIVE_PROJECTS.forEach((p) => {
      const amId = p.account_manager_id;
      const mgrIds = Array.isArray(p.manager_ids) ? p.manager_ids : [p.account_manager_id].filter(Boolean);
      if (amId) {
        if (!map[amId]) map[amId] = [];
        map[amId].push({ code: p.project_code, name: p.project_name, role: 'account_manager' });
      }
      mgrIds.forEach((mid) => {
        if (!map[mid]) map[mid] = [];
        if (!map[mid].find((x) => x.code === p.project_code)) map[mid].push({ code: p.project_code, name: p.project_name, role: 'manager' });
      });
    });
    return map;
  }, [ACTIVE_PROJECTS]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers.filter((u) => {
      const projs = userProjectMap[u.user_id] || [];
      const matchesName = !q || (u.full_name + ' ' + u.email).toLowerCase().includes(q);
      const matchesProject = !q || projs.some((p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q));
      const filterMatch = projectFilter === 'ALL' || projs.some((p) => p.code === projectFilter);
      return (matchesName || matchesProject) && filterMatch;
    });
  }, [allUsers, search, projectFilter, userProjectMap]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <p className="text-sm text-slate-500">{allUsers.length} employees · {filtered.length} shown</p>
        <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="ALL">All projects</option>
          {ACTIVE_PROJECTS.map((p) => <option key={p.project_code} value={p.project_code}>{p.project_code} — {p.project_name}</option>)}
        </select>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name or project code…"
          className="ml-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((u) => {
          const roles = userRoles(u);
          const pr = primaryRole(u);
          const projs = userProjectMap[u.user_id] || [];
          return (
            <div key={u.user_id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex items-center justify-center rounded-full text-white text-sm font-bold flex-shrink-0"
                  style={{ width: 40, height: 40, background: ROLE_COLOR[pr]?.border || '#64748b' }}>
                  {initialsOf(u.full_name)}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{u.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">{u.email}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {roles.map((r) => <RoleBadge key={r} role={r} />)}
              </div>
              {projs.length > 0 ? (
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 mb-1.5">Projects</p>
                  <div className="flex flex-wrap gap-1.5">
                    {projs.map((p) => (
                      <span key={p.code + p.role} className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                        style={{ borderColor: ROLE_COLOR[p.role]?.border, color: ROLE_COLOR[p.role]?.text, background: ROLE_COLOR[p.role]?.bg }}>
                        {p.code} · {ROLE_LABELS[p.role] || p.role}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">Not assigned to any project</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HierarchyContent() {
  const [requesterId, setRequesterId]   = useState(null);
  const [allUsers, setAllUsers]         = useState([]);
  const [projects, setProjects]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [logoMissing, setLogoMissing]   = useState(false);
  const [tab, setTab]                   = useState('tree');
  const [selectedCode, setSelectedCode] = useState(null);
  const [projectMembers, setProjectMembers] = useState([]);

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

  const stats = useMemo(() => {
    const count = (role) => allUsers.filter((u) => userRoles(u).includes(role)).length;
    return { hr: count('hr'), account_manager: count('account_manager'), manager: count('manager'), staff: count('staff') };
  }, [allUsers]);

  const activeProject = projectHierarchy.find((p) => p.project_code === selectedCode);

  return (
    <div className="p-8">
      <div className="mb-7 flex items-start justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
          <h1 className="mt-3 text-4xl font-semibold text-slate-950">Organisation Hierarchy</h1>
          <p className="mt-2 text-sm text-slate-500">Visualise project reporting lines, reassign roles, and review employee project involvement.</p>
        </div>
        <div className="hidden md:block">
          {!logoMissing
            ? <Image src="/nextan-logo.png" alt="Nextan" width={110} height={34} className="object-contain opacity-80" onError={() => setLogoMissing(true)} />
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
      <div className="mb-6 flex gap-1 rounded-2xl border border-slate-200 bg-white p-1.5 w-fit shadow-sm">
        {[
          { key: 'tree',     label: 'Project Org Tree'  },
          { key: 'roles',    label: 'Role Assignment'   },
          { key: 'overview', label: 'Employee Overview' },
        ].map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`rounded-xl px-5 py-2.5 text-sm font-semibold transition ${tab === t.key ? 'bg-[#1a3a8f] text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}>
            {t.label}
          </button>
        ))}
      </div>
      {loading ? <p className="text-sm text-slate-400 py-8">Loading…</p> : (
        <>
          {tab === 'tree' && (
            projectHierarchy.filter((p) => (p.status || 'ACTIVE').toUpperCase() !== 'INACTIVE').length === 0
              ? <p className="text-sm text-slate-400 py-8">No active projects found.</p>
              : (
              <>
                <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                  {projectHierarchy
                    .filter((p) => (p.status || 'ACTIVE').toUpperCase() !== 'INACTIVE')
                    .map((p) => (
                      <button key={p.project_code} onClick={() => setSelectedCode(p.project_code)}
                        className={`rounded-xl px-4 py-2 text-xs font-semibold border transition ${p.project_code === selectedCode ? 'bg-[#1a3a8f] text-white border-[#1a3a8f] shadow' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                        {p.project_code} · {p.project_name}
                      </button>
                    ))}
                </div>
                {activeProject
                  ? <ProjectOrgTree project={activeProject} allUsers={allUsers} projectMembers={projectMembers} />
                  : <p className="text-sm text-slate-400">Select a project above.</p>}
              </>
            )
          )}
          {tab === 'roles' && (
            <RoleAssignmentTab allUsers={allUsers} projects={projects} requesterId={requesterId} onRefresh={() => fetchData(requesterId)} />
          )}
          {tab === 'overview' && (
            <EmployeeOverview allUsers={allUsers} projects={projects} />
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