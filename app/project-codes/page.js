"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import axios from 'axios';

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
              <button type="button" onClick={() => toggle(u.user_id)} className="ml-0.5 leading-none hover:text-red-500">&times;</button>
            </span>
          ))}
        </div>
      )}
      {/* ref only wraps the input + dropdown panel, so clicking the label, chips, or any
          other whitespace on the page (not just outside the whole field) closes the menu */}
      <div ref={ref} className="relative">
        <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          value={search}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setSearch(e.target.value); setOpen(true); }}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-slate-50 ${isSelected ? 'bg-[#E8EEFF]' : ''}`}
                >
                  <span className="font-medium text-slate-800">{u.full_name}</span>
                  <span className="text-xs text-slate-400">{u.email}</span>
                  {isSelected && <span className="ml-2 text-[#1540A8] font-bold">&#10003;</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// -- Modal overlay ------------------------------------------------------------
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <h2 className="text-xl font-semibold text-slate-950">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100">&times;</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

export default function ProjectCodesPage() {
  const [projects, setProjects] = useState([]);
  const [utilisationMap, setUtilisationMap] = useState({});
  // Anyone can be assigned as a project's Account Manager or Manager, regardless of their own
  // role — so both fields in the Issue/Edit modal list every active employee, not just users
  // already holding a manager/account_manager role.
  const [allUsers, setAllUsers] = useState([]);
  const [managerUsers, setManagerUsers] = useState([]); // role-based combined list, used only for the filter dropdown
  const [loading, setLoading] = useState(true);
  const [sessionUser, setSessionUser] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [managerFilter, setManagerFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [projectPage, setProjectPage] = useState(1);
  const [openMenuCode, setOpenMenuCode] = useState(null);
  const [reactivatingCode, setReactivatingCode] = useState(null);
  const menuRef = useRef(null);

  // Modal state
  const [modal, setModal] = useState(null); // null | 'create' | 'edit'
  const [editProject, setEditProject] = useState(null);

  // Form state
  const [formCode, setFormCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formHours, setFormHours] = useState('');
  const [formAccountManagerIds, setFormAccountManagerIds] = useState([]);
  const [formManagerIds, setFormManagerIds] = useState([]);
  const [formError, setFormError] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Delete confirm
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const backendBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'https://hr-backend-qjww.onrender.com';

  useEffect(() => {
    try {
      const u = JSON.parse(sessionStorage.getItem('hr_portal_user') || '{}');
      if (u?.user_id) setSessionUser(u);
    } catch {}
  }, []);

  const fetchAll = useCallback(async () => {
    try {
      const [projectsRes, utilisationRes, managersRes, amRes, allUsersRes] = await Promise.all([
        axios.get(`${backendBaseUrl}/api/v1/projects`).catch(() => ({ data: { data: [] } })),
        axios.get(`${backendBaseUrl}/api/v1/projects/utilisation-detail`).catch(() => ({ data: { data: [] } })),
        axios.get(`${backendBaseUrl}/api/v1/users?role=manager`).catch(() => ({ data: { data: [] } })),
        axios.get(`${backendBaseUrl}/api/v1/users?role=account_manager`).catch(() => ({ data: { data: [] } })),
        axios.get(`${backendBaseUrl}/api/v1/users`).catch(() => ({ data: { data: [] } })),
      ]);
      setProjects(projectsRes.data.data || []);
      const utilMap = {};
      (utilisationRes.data.data || []).forEach((u) => { utilMap[u.project_code] = Number(u.weighted_utilisation_pct || 0); });
      setUtilisationMap(utilMap);
      setAllUsers(allUsersRes.data.data || []);
      const combined = [
        ...(managersRes.data.data || []),
        ...(amRes.data.data || []),
      ];
      const seen = new Set();
      setManagerUsers(combined.filter((u) => { if (seen.has(u.user_id)) return false; seen.add(u.user_id); return true; }));
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [backendBaseUrl]);

  useEffect(() => {
    void fetchAll();
    // Removed auto-polling (was 15s) — caused navigation lag. Refresh is now manual.
  }, [fetchAll]);

  useEffect(() => {
    const handler = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setOpenMenuCode(null); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleReactivate = async (projectCode) => {
    setReactivatingCode(projectCode);
    try {
      await axios.patch(`${backendBaseUrl}/api/v1/projects/${projectCode}/reactivate`, {
        editorId: sessionUser?.user_id,
      });
      await fetchAll();
    } catch (err) {
      console.error('Reactivate failed:', err.response?.data?.error || err.message);
    } finally {
      setReactivatingCode(null);
      setOpenMenuCode(null);
    }
  };

  const openCreate = () => {
    setFormCode(''); setFormName(''); setFormHours(''); setFormAccountManagerIds([]); setFormManagerIds([]); setFormError('');
    setDeleteConfirm(false);
    setModal('create');
  };

  const openEdit = (project) => {
    setEditProject(project);
    setFormCode(project.project_code || '');
    setFormName(project.project_name || '');
    setFormHours(project.budget_hours != null ? String(project.budget_hours) : '');
    setFormAccountManagerIds(Array.isArray(project.account_manager_ids) && project.account_manager_ids.length > 0
      ? project.account_manager_ids
      : [project.account_manager_id].filter(Boolean));
    setFormManagerIds(Array.isArray(project.manager_ids) ? project.manager_ids : []);
    setFormError('');
    setDeleteConfirm(false);
    setModal('edit');
  };

  const closeModal = () => { setModal(null); setEditProject(null); setDeleteConfirm(false); };

  const handleCreate = async (e) => {
    e.preventDefault(); setFormError('');
    if (!formCode.trim() || !formName.trim() || !formHours || formAccountManagerIds.length === 0 || formManagerIds.length === 0) {
      setFormError('All fields are required: Project Code, Project Name, Budget Hours, at least one Account Manager, and at least one Manager.');
      return;
    }
    setFormSubmitting(true);
    try {
      await axios.post(`${backendBaseUrl}/api/v1/projects/create`, {
        creatorId: sessionUser?.user_id,
        projectCode: formCode.trim().toUpperCase(),
        projectName: formName.trim(),
        budgetHours: formHours ? Number(formHours) : null,
        accountManagerIds: formAccountManagerIds,
        managerIds: formManagerIds,
      });
      closeModal();
      await fetchAll();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to create project.');
    } finally { setFormSubmitting(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault(); setFormError('');
    if (!formName.trim()) { setFormError('Project Name is required.'); return; }
    setFormSubmitting(true);
    try {
      await axios.patch(`${backendBaseUrl}/api/v1/projects/${editProject.project_code}`, {
        projectName: formName.trim(),
        budgetHours: formHours ? Number(formHours) : null,
        accountManagerIds: formAccountManagerIds,
        managerIds: formManagerIds,
        editorId: sessionUser?.user_id,
      });
      closeModal();
      await fetchAll();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to update project.');
    } finally { setFormSubmitting(false); }
  };

  const handleDeactivate = async () => {
    setDeleteLoading(true); setFormError('');
    try {
      await axios.patch(`${backendBaseUrl}/api/v1/projects/${editProject.project_code}/deactivate`, {
        editorId: sessionUser?.user_id,
      });
      closeModal();
      await fetchAll();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Failed to deactivate project.');
    } finally { setDeleteLoading(false); setDeleteConfirm(false); }
  };

  const formFields = (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Project Code <span className="text-red-500">*</span></label>
        <input
          type="text"
          value={formCode}
          onChange={(e) => setFormCode(e.target.value)}
          placeholder="e.g. PROJ-001"
          disabled={modal === 'edit'}
          required
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
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
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
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
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      <UserMultiSelect
        label={<>Account Manager <span className="text-red-500">*</span></>}
        placeholder="Search by name or email..."
        users={allUsers}
        selected={formAccountManagerIds}
        onChange={setFormAccountManagerIds}
      />
      <UserMultiSelect
        label={<>Manager <span className="text-red-500">*</span></>}
        placeholder="Search by name or email..."
        users={allUsers}
        selected={formManagerIds}
        onChange={setFormManagerIds}
      />
      {formError && <p className="text-sm font-medium text-red-500">{formError}</p>}
    </div>
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-7">
        <p className="text-sm uppercase tracking-[0.32em] text-slate-500">HR Portal</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">Projects</h1>
        <p className="mt-2 text-sm text-slate-500">Create, edit and manage all project codes.</p>
      </div>

      {/* Projects Table */}
      <div className="rounded-3xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {/* Unified toolbar: search · status filter · manager filter … + Issue New Code */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search code or project name..."
              className="rounded-2xl border border-slate-200 bg-white pl-10 pr-4 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="ALL">Status: All</option>
            <option value="ACTIVE">Status: Active</option>
            <option value="INACTIVE">Status: Inactive</option>
          </select>
          <select value={managerFilter} onChange={(e) => setManagerFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="ALL">Filter by Manager</option>
            {managerUsers.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
          </select>
          <button
            onClick={openCreate}
            className="ml-auto rounded-3xl bg-[#1540A8] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F]"
          >
            + Issue New Code
          </button>
        </div>
        <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500 uppercase tracking-[0.22em] text-[0.70rem]">
            <tr>
              <th className="px-6 py-4">Code ID</th>
              <th className="px-6 py-4">Project Name</th>
              <th className="px-6 py-4">Hours</th>
              <th className="px-6 py-4">Utilization</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Manager</th>
              <th className="px-6 py-4">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100" ref={menuRef}>
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">Loading project codes...</td></tr>
            ) : (() => {
              const filtered = projects.filter((p) => {
                const statusOk = statusFilter === 'ALL' || (p.status || 'ACTIVE').toUpperCase() === statusFilter;
                const q = searchQuery.trim().toLowerCase();
                const searchOk = !q || (p.project_code || '').toLowerCase().includes(q) || (p.project_name || '').toLowerCase().includes(q);
                const managerOk = managerFilter === 'ALL'
                  || p.account_manager_id === managerFilter
                  || (Array.isArray(p.account_manager_ids) && p.account_manager_ids.includes(managerFilter))
                  || (Array.isArray(p.manager_ids) && p.manager_ids.includes(managerFilter));
                return statusOk && searchOk && managerOk;
              });
              if (filtered.length === 0) return <tr><td colSpan={7} className="px-6 py-8 text-center text-slate-500">No project codes found.</td></tr>;
              const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
              const safePage = Math.min(projectPage, totalPages);
              const page = filtered.slice((safePage - 1) * 10, safePage * 10);
              return (
                <>
                  {page.map((project) => {
                    const hours = project.budget_hours ?? 0;
                    const utilization = utilisationMap[project.project_code] != null && !isNaN(Number(utilisationMap[project.project_code])) ? Number(utilisationMap[project.project_code]) : (Number(project.budget_hours) > 0 ? Math.round(((project.total_tracked_hours ?? 0) / Number(project.budget_hours)) * 100) : 0);
                    const amNames = project.account_manager_names || (project.account_manager_name ? [project.account_manager_name] : []);
                    const mgrNames = project.manager_names || [];
                    const isInactive = (project.status || '').toUpperCase() === 'INACTIVE';
                    return (
                      <tr key={project.project_code} className="hover:bg-slate-50">
                        <td className="px-6 py-4 font-semibold text-slate-900">{project.project_code}</td>
                        <td className="px-6 py-4 text-slate-700">{project.project_name}</td>
                        <td className="px-6 py-4 text-slate-700">{hours} hrs</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-20 h-2 rounded-full bg-slate-200 overflow-hidden">
                              <div className="h-full bg-[#163EAF]" style={{ width: `${Math.min(Math.max(utilization, 0), 100)}%` }} />
                            </div>
                            <span className="text-xs text-slate-500">{utilization}%</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                            isInactive ? 'bg-red-100 text-red-700' : 'bg-[#E8EEFF] text-[#163EAF]'
                          }`}>
                            {project.status ?? 'Active'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-slate-700 max-w-[220px]">
                          <p className="truncate"><span className="text-slate-400">AM:</span> {amNames.length > 0 ? amNames.join(', ') : '—'}</p>
                          <p className="truncate"><span className="text-slate-400">Mgr:</span> {mgrNames.length > 0 ? mgrNames.join(', ') : '—'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="relative inline-block">
                            <button type="button"
                              onClick={() => setOpenMenuCode(openMenuCode === project.project_code ? null : project.project_code)}
                              className="flex items-center justify-center rounded-xl border border-slate-200 w-8 h-8 text-slate-500 hover:bg-slate-100 transition">
                              &#8230;
                            </button>
                            {openMenuCode === project.project_code && (
                              <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
                                <button type="button" onClick={() => { openEdit(project); setOpenMenuCode(null); }}
                                  className="block w-full px-4 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50">
                                  Edit
                                </button>
                                {isInactive && (
                                  <button type="button" disabled={reactivatingCode === project.project_code}
                                    onClick={() => handleReactivate(project.project_code)}
                                    className="block w-full px-4 py-2.5 text-left text-xs font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60">
                                    {reactivatingCode === project.project_code ? 'Reactivating…' : 'Reactivate'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {totalPages > 1 && (
                    <tr><td colSpan={7} className="px-6 py-3 bg-slate-50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">Page {safePage} of {totalPages}</span>
                        <div className="flex gap-2">
                          <button onClick={() => setProjectPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                            className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-100">Prev</button>
                          <button onClick={() => setProjectPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                            className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 disabled:opacity-40 hover:bg-slate-100">Next</button>
                        </div>
                      </div>
                    </td></tr>
                  )}
                </>
              );
            })()}
          </tbody>
        </table>
        </div>
      </div>

      {/* Create Modal */}
      {modal === 'create' && (
        <Modal title="Issue New Project Code" onClose={closeModal}>
          <form onSubmit={handleCreate} className="space-y-4">
            {formFields}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal}
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={formSubmitting}
                className="rounded-2xl bg-[#1540A8] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F] disabled:opacity-60">
                {formSubmitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Modal */}
      {modal === 'edit' && editProject && (
        <Modal title={`Edit — ${editProject.project_code}`} onClose={closeModal}>
          <form onSubmit={handleEdit} className="space-y-4">
            {formFields}
            <div className="flex justify-end gap-3 pt-2">
              <button type="button" onClick={closeModal}
                className="rounded-2xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button type="submit" disabled={formSubmitting}
                className="rounded-2xl bg-[#1540A8] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#12378F] disabled:opacity-60">
                {formSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>

          {/* Deactivate section */}
          <div className="mt-6 border-t border-slate-100 pt-5">
            {!deleteConfirm ? (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className="w-full rounded-2xl border border-amber-200 bg-amber-50 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-100"
              >
                Deactivate Project Code
              </button>
            ) : (
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800 mb-1">Deactivate <span className="font-bold">{editProject.project_code}</span>?</p>
                <p className="text-xs text-amber-700 mb-3">This will remove all staff assignments and set the project to INACTIVE. This cannot be undone from this portal.</p>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(false)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeactivate}
                    disabled={deleteLoading}
                    className="flex-1 rounded-xl bg-amber-600 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60"
                  >
                    {deleteLoading ? 'Deactivating...' : 'Yes, Deactivate'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
