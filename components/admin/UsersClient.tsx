'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Pencil,
  Plus,
  Trash2,
  UserCheck,
  UserX,
  Loader2,
  Search,
  X,
  Users,
  Building2,
  BellRing,
  AlertTriangle,
  FileText,
  Calendar,
  Flame,
  BarChart3,
  Scissors,
} from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { roleLabel, TEAM_ROLES } from '@/lib/utils/hierarchy';
import { toast } from 'sonner';

function normalizeRole(role: string) {
  return role === 'user' ? 'member' : role;
}

/** Keep only the local 10 digits for the input (strip leading 91 if pasted). */
function localWaDigits(raw: string) {
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length > 10) digits = digits.slice(2);
  return digits.slice(0, 10);
}

/** Full WA number for API/DB: 91 + 10 digits, without doubling 91. */
function fullWaNumber(localOrFull: string) {
  const digits = localOrFull.replace(/\D/g, '');
  if (digits.startsWith('91') && digits.length >= 12) return digits;
  const last10 = digits.slice(-10);
  return last10.length === 10 ? `91${last10}` : digits;
}

interface UserNotificationPrefs {
  dailyPdf: boolean;
  morningReminder: boolean;
  highPriority: boolean;
  misReports: boolean;
  openSalonAlerts: boolean;
}

export default function UsersClient({
  users: initial,
  departments: initialDepartments,
}: {
  users: any[];
  departments: { id: string; name: string }[];
}) {
  const [activeTab, setActiveTab] = useState<'users' | 'departments' | 'notifications'>('users');
  const [users, setUsers] = useState(initial);
  const [search, setSearch] = useState('');
  const [deptSearch, setDeptSearch] = useState('');
  const [notifSearch, setNotifSearch] = useState('');
  const [departments, setDepartments] = useState(initialDepartments);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [deptToDelete, setDeptToDelete] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [form, setForm] = useState({
    name: '',
    waNumber: '',
    role: 'member',
    department: '',
    isActive: true,
  });
  const [mounted, setMounted] = useState(false);

  // WhatsApp Notification Preferences
  const [waPreferences, setWaPreferences] = useState<Record<string, UserNotificationPrefs>>({});
  const [loadingWaPrefs, setLoadingWaPrefs] = useState(false);
  const [savingPrefKey, setSavingPrefKey] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
    fetchNotificationPreferences();
  }, []);

  async function fetchNotificationPreferences() {
    setLoadingWaPrefs(true);
    try {
      const res = await fetch('/api/reminders/settings');
      const data = await res.json();
      if (data.success && data.data) {
        setWaPreferences(data.data);
      }
    } catch (err) {
      console.error('Failed to load WhatsApp preferences', err);
    } finally {
      setLoadingWaPrefs(false);
    }
  }

  async function toggleWaPreference(uid: string, key: keyof UserNotificationPrefs, currentVal: boolean, userName: string) {
    const newVal = !currentVal;
    const saveKey = `${uid}-${key}`;
    setSavingPrefKey(saveKey);

    // Optimistic UI update
    setWaPreferences(prev => ({
      ...prev,
      [uid]: {
        ...(prev[uid] || {
          dailyPdf: true,
          morningReminder: true,
          highPriority: true,
          misReports: true,
          openSalonAlerts: false,
        }),
        [key]: newVal,
      },
    }));

    try {
      const res = await fetch('/api/reminders/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid,
          preferences: { [key]: newVal },
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const labels: Record<keyof UserNotificationPrefs, string> = {
        dailyPdf: 'Daily PDF',
        morningReminder: "Today's Tasks Reminder",
        highPriority: 'High Priority (2-Hr)',
        misReports: 'MIS Reports',
        openSalonAlerts: 'Open Salon Alerts',
      };
      toast.success(`${labels[key]} turned ${newVal ? 'ON' : 'OFF'} for ${userName}`);
    } catch (err: any) {
      toast.error(err.message || 'Failed to update setting');
      // Revert optimistic update
      setWaPreferences(prev => ({
        ...prev,
        [uid]: {
          ...(prev[uid] as UserNotificationPrefs),
          [key]: currentVal,
        },
      }));
    } finally {
      setSavingPrefKey(null);
    }
  }

  function setF(k: string, v: any) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function startEdit(user: any) {
    setEditingUser({
      uid: user.uid,
      name: user.name,
      waNumber: localWaDigits(user.waNumberLast10 || user.waNumber || ''),
      role: normalizeRole(user.role),
      department: user.department,
      isActive: user.isActive,
    });
  }

  function setEditF(k: string, v: any) {
    setEditingUser((u: any) => ({ ...u, [k]: v }));
  }

  async function createDepartment(e: React.FormEvent) {
    e.preventDefault();
    if (!departmentName.trim()) return;

    setLoading('department');
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: departmentName.trim() }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setDepartments(ds => [...ds, data.data].sort((a, b) => a.name.localeCompare(b.name)));
      setDepartmentName('');
      toast.success('Department created');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create department');
    } finally {
      setLoading(null);
    }
  }

  async function confirmDeleteDepartment() {
    if (!deptToDelete) return;
    const id = deptToDelete.id;
    setLoading(`department-${id}`);
    try {
      const res = await fetch(`/api/departments?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setDepartments(ds => ds.filter(d => d.id !== id));
      setUsers(us => us.map(u => (departments.find(d => d.id === id)?.name === u.department ? { ...u, department: '' } : u)));
      toast.success(`Department "${deptToDelete.name}" deleted`);
      setDeptToDelete(null);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete department');
    } finally {
      setLoading(null);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    if (form.waNumber.length !== 10) {
      toast.error('Enter a valid 10-digit WhatsApp number');
      return;
    }
    setLoading('create');
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, waNumber: fullWaNumber(form.waNumber) }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('User created');
      setShowForm(false);
      setForm({ name: '', waNumber: '', role: 'member', department: '', isActive: true });
      const createdUid = data.data?.uid;
      setUsers(us => [
        ...us,
        {
          uid: createdUid || `user-${Date.now()}`,
          ...form,
          waNumber: fullWaNumber(form.waNumber),
          waNumberLast10: form.waNumber,
          createdAt: new Date().toISOString(),
        },
      ]);
      fetchNotificationPreferences();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to create user');
    } finally {
      setLoading(null);
    }
  }

  async function updateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;
    if (String(editingUser.waNumber).length !== 10) {
      toast.error('Enter a valid 10-digit WhatsApp number');
      return;
    }
    setLoading('edit');
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editingUser,
          waNumber: fullWaNumber(editingUser.waNumber),
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setUsers(us =>
        us.map(u =>
          u.uid === editingUser.uid
            ? {
                ...u,
                ...editingUser,
                waNumber: fullWaNumber(editingUser.waNumber),
                waNumberLast10: editingUser.waNumber,
              }
            : u,
        ),
      );
      toast.success('User updated');
      setEditingUser(null);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update user');
    } finally {
      setLoading(null);
    }
  }

  async function toggleActive(uid: string, current: boolean) {
    setLoading(uid);
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid, isActive: !current }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setUsers(us => us.map(u => (u.uid === uid ? { ...u, isActive: !current } : u)));
      toast.success(`User ${!current ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update user');
    } finally {
      setLoading(null);
    }
  }

  async function deleteUser(user: any) {
    if (!confirm(`Permanently delete ${user.name}? This cannot be undone.`)) return;

    setLoading(`delete-${user.uid}`);
    try {
      const res = await fetch(`/api/users?uid=${encodeURIComponent(user.uid)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setUsers(us => us.filter(u => u.uid !== user.uid));
      toast.success('User deleted');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete user');
    } finally {
      setLoading(null);
    }
  }

  // Filter team members directory locally
  const searchTerms = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleUsers = searchTerms.length
    ? users.filter(user => {
        const fields = [user.name, user.department, user.uid, user.waNumber, roleLabel(normalizeRole(user.role) as any)];
        const searchable = fields.join(' ').toLowerCase();
        return searchTerms.every(term => searchable.includes(term));
      })
    : users;

  // Filter departments locally
  const visibleDepartments = deptSearch.trim()
    ? departments.filter(d => d.name.toLowerCase().includes(deptSearch.trim().toLowerCase()))
    : departments;

  // Filter WhatsApp notification table (strictly active users only - never show deactivated users)
  const activeUsers = users.filter(user => user.isActive !== false);
  const notifSearchTerms = notifSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const visibleNotifUsers = notifSearchTerms.length
    ? activeUsers.filter(user => {
        const fields = [user.name, user.department, user.uid, user.waNumber, roleLabel(normalizeRole(user.role) as any)];
        const searchable = fields.join(' ').toLowerCase();
        return notifSearchTerms.every(term => searchable.includes(term));
      })
    : activeUsers;

  // Helper to count active members in a department
  const getDeptMemberCount = (deptName: string) => {
    return users.filter(u => u.isActive !== false && u.department?.trim().toLowerCase() === deptName.trim().toLowerCase()).length;
  };

  return (
    <div className="space-y-5">
      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-gray-200 bg-white p-1 rounded-xl shadow-xs overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab('users')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition shrink-0',
            activeTab === 'users' ? 'bg-brand-50 text-brand-700 shadow-xs' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
          )}
        >
          <Users size={16} />
          <span>Team Members</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-brand-100/70 text-brand-700 font-bold">
            {users.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('departments')}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition shrink-0',
            activeTab === 'departments' ? 'bg-brand-50 text-brand-700 shadow-xs' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
          )}
        >
          <Building2 size={16} />
          <span>Departments</span>
          <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-brand-100/70 text-brand-700 font-bold">
            {departments.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('notifications');
            fetchNotificationPreferences();
          }}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition shrink-0',
            activeTab === 'notifications' ? 'bg-brand-50 text-brand-700 shadow-xs' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50',
          )}
        >
          <BellRing size={16} />
          <span>WhatsApp Notification Controls</span>
        </button>
      </div>

      {/* TAB 1: TEAM MEMBERS */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative max-w-sm flex-1">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                aria-label="Search team members"
                placeholder="Search team members by name, phone, dept…"
                value={search}
                onChange={event => setSearch(event.target.value)}
                className="input w-full pl-9"
              />
            </div>
            <button onClick={() => setShowForm(true)} className="btn-primary shrink-0">
              <Plus size={15} /> Add User
            </button>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/75">
                    {['Name', 'WhatsApp', 'Department', 'Role', 'Status', 'Joined', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        {searchTerms.length ? 'No team members match your search.' : 'No team members yet.'}
                      </td>
                    </tr>
                  )}
                  {visibleUsers.map(user => (
                    <tr key={user.uid} className="border-b border-gray-50 hover:bg-gray-50/75 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
                            {user.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold text-gray-900 block leading-tight">{user.name}</span>
                            <span className="text-[10px] text-gray-400 font-mono">{user.uid}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-600">{user.waNumber}</td>
                      <td className="px-4 py-3">
                        {user.department ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-gray-100 text-gray-700">
                            {user.department}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'badge text-[11px]',
                            normalizeRole(user.role) === 'admin' ? 'bg-brand-100 text-brand-700 font-medium' : 'bg-gray-100 text-gray-600',
                          )}
                        >
                          {roleLabel(normalizeRole(user.role) as any)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            'badge text-[11px]',
                            user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600',
                          )}
                        >
                          {user.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-400">{formatDate(user.createdAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => startEdit(user)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                          >
                            <Pencil size={12} />
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(user.uid, user.isActive)}
                            disabled={loading === user.uid}
                            className={cn(
                              'inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                              user.isActive ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50',
                            )}
                          >
                            {loading === user.uid ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : user.isActive ? (
                              <UserX size={12} />
                            ) : (
                              <UserCheck size={12} />
                            )}
                            {user.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => deleteUser(user)}
                            disabled={loading === `delete-${user.uid}`}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          >
                            {loading === `delete-${user.uid}` ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : (
                              <Trash2 size={12} />
                            )}
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEPARTMENTS (FRIENDLY UI & POPUP CONFIRMATION) */}
      {activeTab === 'departments' && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <Building2 size={18} className="text-brand-600" />
                  Department Directory
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Manage organization teams and functional units. Deleting a department requires confirmation.
                </p>
              </div>

              {/* Add department form */}
              <form onSubmit={createDepartment} className="flex items-center gap-2 w-full md:w-auto">
                <input
                  value={departmentName}
                  onChange={e => setDepartmentName(e.target.value)}
                  placeholder="New department name..."
                  className="input py-2 text-sm flex-1 md:w-64"
                  disabled={loading === 'department'}
                />
                <button
                  type="submit"
                  disabled={loading === 'department' || !departmentName.trim()}
                  className="btn-primary shrink-0"
                >
                  {loading === 'department' ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Add Department
                </button>
              </form>
            </div>

            {/* Department Search */}
            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between gap-3">
              <div className="relative max-w-sm flex-1">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  placeholder="Filter departments..."
                  value={deptSearch}
                  onChange={e => setDeptSearch(e.target.value)}
                  className="input pl-9 py-1.5 text-xs w-full"
                />
              </div>
              <span className="text-xs font-medium text-gray-500 shrink-0">
                Showing {visibleDepartments.length} of {departments.length} departments
              </span>
            </div>
          </div>

          {/* Department Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {visibleDepartments.length === 0 && (
              <div className="col-span-full card p-8 text-center text-gray-500">
                No departments found matching &quot;{deptSearch}&quot;.
              </div>
            )}
            {visibleDepartments.map(dept => {
              const count = getDeptMemberCount(dept.name);
              return (
                <div
                  key={dept.id}
                  className="card p-3.5 hover:shadow-md transition-all border border-gray-100 flex items-center justify-between gap-3 group"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate" title={dept.name}>
                      {dept.name}
                    </h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span
                        className={cn(
                          'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold',
                          count > 0 ? 'bg-brand-50 text-brand-700' : 'bg-gray-100 text-gray-500',
                        )}
                      >
                        {count === 1 ? '1 member' : `${count} members`}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDeptToDelete(dept)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition shrink-0 opacity-80 group-hover:opacity-100"
                    title={`Delete ${dept.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: WHATSAPP NOTIFICATION CONTROLS */}
      {activeTab === 'notifications' && (
        <div className="space-y-4">
          <div className="card p-4 sm:p-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <BellRing size={18} className="text-brand-600" />
                  WhatsApp Notification Controls
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Configure real-time automated WhatsApp alerts per team member. Toggling a switch saves immediately.
                </p>
              </div>

              <div className="relative max-w-sm w-full md:w-64">
                <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="search"
                  placeholder="Filter users..."
                  value={notifSearch}
                  onChange={e => setNotifSearch(e.target.value)}
                  className="input pl-9 py-1.5 text-xs w-full"
                />
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap items-center gap-4 text-xs text-gray-500">
              <span className="flex items-center gap-1.5">
                <FileText size={13} className="text-blue-500" /> Daily PDF Report
              </span>
              <span className="flex items-center gap-1.5">
                <Calendar size={13} className="text-amber-500" /> Today&apos;s Tasks (Morning)
              </span>
              <span className="flex items-center gap-1.5">
                <Flame size={13} className="text-red-500" /> 2-Hr High Priority Alert
              </span>
              <span className="flex items-center gap-1.5">
                <BarChart3 size={13} className="text-emerald-500" /> MIS Reports
              </span>
              <span className="flex items-center gap-1.5">
                <Scissors size={13} className="text-purple-500" /> Open Salon Broadcast
              </span>
            </div>
          </div>

          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/75 text-xs text-gray-600 font-semibold">
                    <th className="px-4 py-3 text-left">Team Member</th>
                    <th className="px-3 py-3 text-left">WhatsApp</th>
                    <th className="px-3 py-3 text-center">Daily PDF</th>
                    <th className="px-3 py-3 text-center">Today&apos;s Tasks</th>
                    <th className="px-3 py-3 text-center">2-Hr High Priority</th>
                    <th className="px-3 py-3 text-center">MIS Reports</th>
                    <th className="px-3 py-3 text-center">Open Salon Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleNotifUsers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                        No team members found matching your search.
                      </td>
                    </tr>
                  )}
                  {visibleNotifUsers.map(user => {
                    const prefs = waPreferences[user.uid] || {
                      dailyPdf: false,
                      morningReminder: false,
                      highPriority: false,
                      misReports: false,
                      openSalonAlerts: false,
                    };

                    const renderToggle = (key: keyof UserNotificationPrefs, label: string) => {
                      const enabled = Boolean(prefs[key]);
                      const isSaving = savingPrefKey === `${user.uid}-${key}`;

                      return (
                        <div className="flex flex-col items-center justify-center">
                          <button
                            type="button"
                            role="switch"
                            aria-checked={enabled}
                            disabled={isSaving || user.isActive === false}
                            onClick={() => toggleWaPreference(user.uid, key, enabled, user.name)}
                            className={cn(
                              'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-1 disabled:opacity-40 disabled:cursor-not-allowed',
                              enabled ? 'bg-emerald-500' : 'bg-gray-200',
                            )}
                            title={`${label}: ${enabled ? 'Enabled' : 'Disabled'}`}
                          >
                            <span
                              className={cn(
                                'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out',
                                enabled ? 'translate-x-4' : 'translate-x-0',
                              )}
                            />
                          </button>
                        </div>
                      );
                    };

                    return (
                      <tr key={user.uid} className="border-b border-gray-50 hover:bg-gray-50/75 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center shrink-0">
                              {user.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-gray-900 leading-tight">{user.name}</span>
                                {user.isActive === false && (
                                  <span className="text-[10px] bg-red-100 text-red-700 font-medium px-1.5 py-0.2 rounded">
                                    Inactive
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <span className="text-[10px] text-gray-500">{roleLabel(normalizeRole(user.role) as any)}</span>
                                {user.department && (
                                  <>
                                    <span className="text-gray-300 text-[10px]">•</span>
                                    <span className="text-[10px] text-gray-500 truncate">{user.department}</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-gray-600">
                          {user.waNumber || <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-3 py-3 text-center">{renderToggle('dailyPdf', 'Daily PDF')}</td>
                        <td className="px-3 py-3 text-center">{renderToggle('morningReminder', "Today's Tasks")}</td>
                        <td className="px-3 py-3 text-center">{renderToggle('highPriority', '2-Hr High Priority')}</td>
                        <td className="px-3 py-3 text-center">{renderToggle('misReports', 'MIS Reports')}</td>
                        <td className="px-3 py-3 text-center">{renderToggle('openSalonAlerts', 'Open Salon Alert')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: DELETE DEPARTMENT CONFIRMATION POPUP */}
      {deptToDelete && mounted && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] w-screen h-screen">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-sm p-6 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle size={24} />
            </div>

            <h3 className="text-base font-bold text-gray-900 mb-1">Delete Department?</h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Are you sure you want to delete <strong className="text-gray-800">&quot;{deptToDelete.name}&quot;</strong>?
              {getDeptMemberCount(deptToDelete.name) > 0 && (
                <span className="block mt-1 font-medium text-amber-600">
                  ⚠️ {getDeptMemberCount(deptToDelete.name)} team member(s) will have their department cleared.
                </span>
              )}
            </p>

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setDeptToDelete(null)}
                className="btn-secondary flex-1 text-xs py-2"
                disabled={loading === `department-${deptToDelete.id}`}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteDepartment}
                disabled={loading === `department-${deptToDelete.id}`}
                className="btn-danger flex-1 text-xs py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg flex items-center justify-center gap-1.5 shadow-xs"
              >
                {loading === `department-${deptToDelete.id}` && <Loader2 size={13} className="animate-spin" />}
                Delete Department
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* MODAL: CREATE USER */}
      {showForm && mounted && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] w-screen h-screen">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Add New User</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={createUser} className="space-y-4">
              <div>
                <label className="label">Full Name *</label>
                <input value={form.name} onChange={e => setF('name', e.target.value)} className="input" required />
              </div>
              <div>
                <label className="label">WhatsApp Number *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 pointer-events-none">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={form.waNumber}
                    onChange={e => setF('waNumber', localWaDigits(e.target.value))}
                    placeholder="9876543210"
                    className="input pl-12"
                    inputMode="numeric"
                    autoComplete="tel"
                    required
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Enter the 10-digit number.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Role</label>
                  <select value={form.role} onChange={e => setF('role', e.target.value)} className="input">
                    <option value="admin">Admin</option>
                    {TEAM_ROLES.map(role => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Department</label>
                  <select value={form.department} onChange={e => setF('department', e.target.value)} className="input" required>
                    <option value="">Select...</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={loading === 'create' || form.waNumber.length !== 10} className="btn-primary flex-1">
                  {loading === 'create' && <Loader2 size={14} className="animate-spin" />}
                  Create User
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}

      {/* MODAL: EDIT USER */}
      {editingUser && mounted && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-[2px] w-screen h-screen">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Edit User</h2>
              <button onClick={() => setEditingUser(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={updateUser} className="space-y-4">
              <div>
                <label className="label">Full Name *</label>
                <input value={editingUser.name} onChange={e => setEditF('name', e.target.value)} className="input" required />
              </div>
              <div>
                <label className="label">WhatsApp Number *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-gray-500 pointer-events-none">
                    +91
                  </span>
                  <input
                    type="tel"
                    value={editingUser.waNumber}
                    onChange={e => setEditF('waNumber', localWaDigits(e.target.value))}
                    placeholder="9876543210"
                    className="input pl-12"
                    inputMode="numeric"
                    autoComplete="tel"
                    required
                  />
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Enter the 10-digit number.</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Role</label>
                  <select value={editingUser.role} onChange={e => setEditF('role', e.target.value)} className="input">
                    <option value="admin">Admin</option>
                    {TEAM_ROLES.map(role => (
                      <option key={role} value={role}>
                        {roleLabel(role)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Department</label>
                  <select value={editingUser.department} onChange={e => setEditF('department', e.target.value)} className="input" required>
                    {departments.map(d => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={editingUser.isActive}
                  onChange={e => setEditF('isActive', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
                Active user
              </label>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={loading === 'edit' || String(editingUser.waNumber).length !== 10} className="btn-primary flex-1">
                  {loading === 'edit' && <Loader2 size={14} className="animate-spin" />}
                  Save Changes
                </button>
                <button type="button" onClick={() => setEditingUser(null)} className="btn-secondary">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
