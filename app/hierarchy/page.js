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

const ROLE_COLOR = {
  account_manager: { border: '#7c3aed', text: '#6d28d9', bg: '#f5f3ff' },
  hr:              { border: '#16a34a', text: '#15803d', bg: '#f0fdf4' },
  manager:         { border: '#1a3a8f', text: '#1d4ed8', bg: '#eff6ff' },
  staff:           { border: '#64748b', text: '#475569', bg: '#f8fafc' },
};

const OrgNode = React.forwardRef(function OrgNode({ user, role, unassigned, supervisorOptions, onAssignSupervisor }, ref) {
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
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-900 truncate">{user.full_name}</p>
          <p className="text-[11px] font-medium truncate" style={{ color: unassigned ? '#b45309' : color.text }}>{roleLabel(role)}</p>
        </div>
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
    </div>
  );
});

function LevelLabel({ text }) {
  return <p className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-slate-300 mb-2">{text}</p>;
}
function Connector() { return <div className="mx-auto w-px h-6 bg-slate-300" />; }
function TreeRow({ children }) { return <div className="flex flex-wrap justify-center gap-4">{children}</div>; }

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
              <TreeRow>{group.map((s) => <OrgNode key={s.user_id} user={s} role="staff" />)}</TreeRow>
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

function HierarchyContent() {
  const [requesterId, setRequesterId]   = useState(null);
  const [allUsers, setAllUsers]         = useState([]);
  const [projects, setProjects]         = useState([]);
  const [loading, setLoading]           = useState(true);
  const [logoMissing, setLogoMissing]   = useState(false);
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
      {loading ? <p className="text-sm text-slate-400 py-8">Loading…</p> : (
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
              ? <ProjectOrgTree project={activeProject} allUsers={allUsers} projectMembers={projectMembers}
                  requesterId={requesterId} onMembersChanged={() => fetchProjectMembers(selectedCode)} />
              : <p className="text-sm text-slate-400">Select a project above.</p>}
          </>
        )
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