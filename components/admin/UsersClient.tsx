'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, UserCheck, UserX, Loader2, X } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';
import { roleLabel, TEAM_ROLES } from '@/lib/utils/hierarchy';
import { toast } from 'sonner';

function normalizeRole(role: string) {
  return role === 'user' ? 'member' : role;
}

export default function UsersClient({
  users: initial,
  departments: initialDepartments,
}: {
  users: any[];
  departments: { id: string; name: string }[];
}) {
  const [users, setUsers]       = useState(initial);
  const [departments, setDepartments] = useState(initialDepartments);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [loading, setLoading]   = useState<string | null>(null);
  const [departmentName, setDepartmentName] = useState('');
  const [form, setForm] = useState({
    name:       '',
    waNumber:   '',
    role:       'member',
    department: '',
    isActive:   true,
  });

  function setF(k: string, v: any) { setForm(f => ({ ...f, [k]: v })); }

  function startEdit(user: any) {
    setEditingUser({
      uid: user.uid,
      name: user.name,
      waNumber: user.waNumber,
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

  async function deleteDepartment(id: string) {
    setLoading(`department-${id}`);
    try {
      const res = await fetch(`/api/departments?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setDepartments(ds => ds.filter(d => d.id !== id));
      setUsers(us => us.map(u => departments.find(d => d.id === id)?.name === u.department ? { ...u, department: '' } : u));
      toast.success('Department deleted');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to delete department');
    } finally {
      setLoading(null);
    }
  }

  async function clearDepartments() {
    if (!confirm('Remove all departments and clear department assignments from users?')) return;

    setLoading('departments-clear');
    try {
      const res = await fetch('/api/departments?all=true', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setDepartments([]);
      setUsers(us => us.map(u => ({ ...u, department: '' })));
      setForm(f => ({ ...f, department: '' }));
      if (editingUser) setEditF('department', '');
      toast.success('Departments cleared');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to clear departments');
    } finally {
      setLoading(null);
    }
  }

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setLoading('create');
    try {
      const res = await fetch('/api/users', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(form),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      toast.success('User created');
      setShowForm(false);
      setForm({ name: '', waNumber: '', role: 'member', department: '', isActive: true });
      window.location.reload();
    } catch (err: any) {
      toast.error(err.message ?? 'Failed');
    } finally {
      setLoading(null);
    }
  }

  async function toggleActive(uid: string, current: boolean) {
    setLoading(uid);
    try {
      const res = await fetch('/api/users', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ uid, isActive: !current }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setUsers(us => us.map(u => u.uid === uid ? { ...u, isActive: !current } : u));
      toast.success(`User ${!current ? 'activated' : 'deactivated'}`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(null);
    }
  }

  async function updateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!editingUser) return;

    setLoading('edit');
    try {
      const res = await fetch('/api/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingUser),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      const updated = data.data ?? editingUser;
      setUsers(us => us.map(u => u.uid === editingUser.uid ? { ...u, ...updated } : u));
      setEditingUser(null);
      toast.success('User updated');
    } catch (err: any) {
      toast.error(err.message ?? 'Failed to update user');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Departments</h2>
            <p className="text-xs text-gray-500 mt-0.5">{departments.length} departments available for the team</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {departments.length > 0 && (
              <button
                type="button"
                onClick={clearDepartments}
                disabled={loading === 'departments-clear'}
                className="btn-secondary shrink-0 text-red-600 hover:bg-red-50"
              >
                {loading === 'departments-clear' ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                Clear All
              </button>
            )}
            <form onSubmit={createDepartment} className="flex gap-2 md:min-w-[360px]">
              <input
                value={departmentName}
                onChange={e => setDepartmentName(e.target.value)}
                placeholder="New department name"
                className="input py-2"
                disabled={loading === 'department'}
              />
              <button type="submit" disabled={loading === 'department' || !departmentName.trim()} className="btn-primary shrink-0">
                {loading === 'department' && <Loader2 size={14} className="animate-spin" />}
                Add
              </button>
            </form>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {departments.length === 0 && (
            <p className="text-xs text-gray-400">No departments yet. Add your new department names above.</p>
          )}
          {departments.map(department => (
            <span key={department.id} className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
              {department.name}
              <button
                type="button"
                onClick={() => deleteDepartment(department.id)}
                disabled={loading === `department-${department.id}`}
                className="rounded-full p-0.5 text-gray-400 hover:bg-white hover:text-red-600"
                aria-label={`Delete ${department.name}`}
              >
                {loading === `department-${department.id}`
                  ? <Loader2 size={11} className="animate-spin" />
                  : <X size={11} />
                }
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={() => setShowForm(true)} className="btn-primary">
          <Plus size={15} /> Add User
        </button>
      </div>

      {/* Create user modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Add New User</h2>
              <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-100">
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
                <input
                  value={form.waNumber}
                  onChange={e => setF('waNumber', e.target.value)}
                  placeholder="919876543210"
                  className="input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Role</label>
                  <select value={form.role} onChange={e => setF('role', e.target.value)} className="input">
                    <option value="admin">Admin</option>
                    {TEAM_ROLES.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Department</label>
                  <select value={form.department} onChange={e => setF('department', e.target.value)} className="input" required>
                    <option value="">Select...</option>
                    {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="submit" disabled={loading === 'create'} className="btn-primary">
                  {loading === 'create' && <Loader2 size={14} className="animate-spin" />}
                  Create User
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30">
          <div className="bg-white rounded-2xl shadow-modal w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold">Edit User</h2>
              <button onClick={() => setEditingUser(null)} className="p-1.5 rounded-lg hover:bg-gray-100">
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
                <input
                  value={editingUser.waNumber}
                  onChange={e => setEditF('waNumber', e.target.value)}
                  placeholder="919876543210"
                  className="input"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Role</label>
                  <select value={editingUser.role} onChange={e => setEditF('role', e.target.value)} className="input">
                    <option value="admin">Admin</option>
                    {TEAM_ROLES.map(role => <option key={role} value={role}>{roleLabel(role)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Department</label>
                  <select value={editingUser.department} onChange={e => setEditF('department', e.target.value)} className="input" required>
                    {departments.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
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
                <button type="submit" disabled={loading === 'edit'} className="btn-primary">
                  {loading === 'edit' && <Loader2 size={14} className="animate-spin" />}
                  Save Changes
                </button>
                <button type="button" onClick={() => setEditingUser(null)} className="btn-secondary">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users table */}
      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/50">
              {['Name', 'WhatsApp', 'Department', 'Role', 'Status', 'Joined', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.uid} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold flex items-center justify-center">
                      {user.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-800">{user.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-500">{user.waNumber}</td>
                <td className="px-4 py-3 text-gray-600">{user.department}</td>
                <td className="px-4 py-3">
                  <span className={cn('badge', normalizeRole(user.role) === 'admin' ? 'bg-brand-100 text-brand-700' : 'bg-gray-100 text-gray-600')}>
                    {roleLabel(normalizeRole(user.role) as any)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn('badge', user.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
                    {user.isActive ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{formatDate(user.createdAt)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
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
                      user.isActive
                        ? 'text-red-600 hover:bg-red-50'
                        : 'text-green-600 hover:bg-green-50',
                    )}
                  >
                    {loading === user.uid
                      ? <Loader2 size={11} className="animate-spin" />
                      : user.isActive ? <UserX size={12} /> : <UserCheck size={12} />
                    }
                    {user.isActive ? 'Deactivate' : 'Activate'}
                  </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
