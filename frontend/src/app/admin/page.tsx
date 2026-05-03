'use client';

import React, { useState, useEffect } from 'react';
import { useUser } from '@/components/context/UserContext';
import {
  Users,
  Settings,
  Mail,
  Shield,
  Activity,
  Plus,
  Lock,
  Unlock,
  Trash2,
  Globe,
  PlusSquare,
  CheckCircle,
  XCircle,
  ArrowRight,
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  X,
  Filter,
} from 'lucide-react';
import { apiRequest } from '@/lib/api';
import { confirmCancel } from '@/lib/confirmAction';

type Tab = 'users' | 'labs' | 'topics' | 'templates' | 'policies' | 'logs';

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: 'users',     label: 'Users',           icon: Users },
  { id: 'labs',      label: 'Labs',            icon: Globe },
  { id: 'topics',    label: 'Topics',          icon: CheckCircle },
  { id: 'templates', label: 'Email Templates', icon: Mail },
  { id: 'policies',  label: 'System Policies', icon: Settings },
  { id: 'logs',      label: 'Audit Logs',      icon: Activity },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email: string) {
  return EMAIL_PATTERN.test(email.trim());
}

export default function AdminPage() {
  const { user } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>('users');
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user.id) return;
    fetchData();
  }, [user.id, activeTab]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const endpoints: Record<Tab, string> = {
        users:     '/admin/users',
        labs:      '/admin/labs',
        topics:    '/admin/labs',
        templates: '/admin/templates',
        policies:  '/admin/policies',
        logs:      '/admin/logs',
      };
      const result = await apiRequest<any>(endpoints[activeTab]);
      setData(result);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  if (!user.id) return null;

  if (!user.isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
        <Shield className="w-16 h-16 text-red-500/20 mb-4" />
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-slate-400">You do not have administrative privileges to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-400" />
            Admin Dashboard
          </h1>
          <p className="text-slate-400 mt-1">System-wide management and monitoring.</p>
        </div>
      </div>

      <div className="flex overflow-x-auto pb-2 gap-2 border-b border-white/5">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              if (activeTab !== tab.id) {
                setLoading(true);
                setData(null);
                setActiveTab(tab.id);
              }
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-3">
          <XCircle className="w-5 h-5" />
          <p>{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
        </div>
      ) : (
        <div className="grid gap-6">
          {activeTab === 'users'     && <UsersTab     users={data}     refresh={fetchData} />}
          {activeTab === 'labs'      && <LabsTab      labs={data}      refresh={fetchData} />}
          {activeTab === 'topics'    && <TopicsTab    labs={data} />}
          {activeTab === 'templates' && <TemplatesTab templates={data} refresh={fetchData} />}
          {activeTab === 'policies'  && <PoliciesTab  policies={data}  refresh={fetchData} />}
          {activeTab === 'logs'      && <LogsTab      logs={data} />}
        </div>
      )}
    </div>
  );
}

function UsersTab({ users, refresh }: { users: any[]; refresh: () => void }) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const handleCreateUser = async () => {
    if (!newName.trim() || !newEmail.trim()) {
      setErrorMsg('Name and email are required');
      return;
    }
    if (!newPassword) {
      setErrorMsg('Password is required');
      return;
    }
    setIsSubmitting(true);
    setErrorMsg('');
    try {
      await apiRequest('/admin/users', {
        method: 'POST',
        body: { name: newName, email: newEmail, role: 'LabMember', password: newPassword }
      });
      setShowCreateModal(false);
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      refresh();
    } catch (e: any) {
      setErrorMsg(e.message || 'Failed to create user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredUsers = (users ?? []).filter((u: any) =>
    u.role !== 'Admin' && (
      u.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const handleLock = async (id: string, isLocked: boolean) => {
    try {
      await apiRequest(`/admin/users/${id}/${isLocked ? 'unlock' : 'lock'}`, { method: 'POST' });
      refresh();
    } catch (err: any) { alert(err.message); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    try {
      await apiRequest(`/admin/users/${id}`, { method: 'DELETE' });
      refresh();
    } catch (err: any) { alert(err.message); }
  };

  return (
    <>
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl relative">
            <button
              onClick={() => setShowCreateModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors"
            >
              <XCircle className="w-5 h-5" />
            </button>
            <h3 className="text-xl font-bold text-white mb-2">Create Lab Member</h3>
            <p className="text-sm text-slate-400 mb-6">Create a new Lab Member account. To create a Coordinator, use the Labs tab.</p>

            {errorMsg && (
              <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {errorMsg}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter a secure password"
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={isSubmitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Creating...' : 'Create User'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="glass rounded-2xl border border-white/10 overflow-hidden">
        <div className="p-6 border-b border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">System Users</h2>
          <button 
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
          >
            <PlusSquare className="w-4 h-4" />
            Create Lab Member
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5">
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">User</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredUsers.map((u: any) => (
              <tr key={u.id} className="hover:bg-white/[0.02] transition-colors">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center text-blue-400 font-bold border border-white/10">
                      {u.name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">{u.name}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                    u.role === 'Admin'       ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' :
                    u.role === 'Coordinator' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                              'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                  }`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-6 py-4">
                  {u.lockedUntil ? (
                    <span className="flex items-center gap-1.5 text-red-400 text-xs"><Lock className="w-3 h-3" /> Locked</span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-green-400 text-xs"><CheckCircle className="w-3 h-3" /> Active</span>
                  )}
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleLock(u.id, !!u.lockedUntil)}
                      className="p-2 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                      title={u.lockedUntil ? 'Unlock' : 'Lock'}
                    >
                      {u.lockedUntil ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                    </button>
                    {u.role !== 'Coordinator' && (
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="p-2 rounded-lg hover:bg-red-500/10 text-slate-400 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}

function LabsTab({ labs, refresh }: { labs: any[]; refresh: () => void }) {
  const [isCreating, setIsCreating] = useState(false);
  const [newLabName, setNewLabName] = useState('');
  const [newLabDesc, setNewLabDesc] = useState('');
  const [coordName, setCoordName] = useState('');
  const [coordEmail, setCoordEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreate = async () => {
    if (isSubmitting) return;
    if (!newLabName.trim()) { alert('Lab name is required'); return; }
    if (!coordName.trim()) { alert('Coordinator name is required'); return; }
    if (!coordEmail.trim()) { alert('Coordinator email is required'); return; }
    if (!isValidEmail(coordEmail)) { alert('Enter a valid coordinator email address'); return; }
    
    setIsSubmitting(true);
    try {
      await apiRequest('/admin/labs', { 
        method: 'POST', 
        body: { 
          name: newLabName, 
          description: newLabDesc,
          coordinatorName: coordName,
          coordinatorEmail: coordEmail.trim() 
        } 
      });
      setNewLabName('');
      setNewLabDesc('');
      setCoordName('');
      setCoordEmail('');
      setIsCreating(false);
      refresh();
    } catch (err: any) { 
      alert(err.message); 
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this lab?')) return;
    try {
      await apiRequest(`/admin/labs/${id}`, { method: 'DELETE' });
      refresh();
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="space-y-6">

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <div className="glass rounded-2xl border-2 border-dashed border-white/10 flex flex-col items-center justify-center p-8 text-center hover:border-blue-500/50 transition-all group">
          {!isCreating ? (
            <>
              <div className="w-12 h-12 rounded-full bg-blue-600/10 text-blue-400 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <Plus className="w-6 h-6" />
              </div>
              <h3 className="text-white font-semibold mb-2">Create New Lab</h3>
              <p className="text-sm text-slate-500 mb-6">Set up a new isolated research environment.</p>
              <button
                onClick={() => setIsCreating(true)}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                Get Started
              </button>
            </>
          ) : (
            <div className="w-full space-y-4 text-left">
              <input
                type="text"
                placeholder="Lab Name"
                value={newLabName}
                onChange={(e) => setNewLabName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
              />
              <input
                type="text"
                placeholder="Lab Description (Optional)"
                value={newLabDesc}
                onChange={(e) => setNewLabDesc(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="text"
                placeholder="Coordinator Name"
                value={coordName}
                onChange={(e) => setCoordName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <input
                type="email"
                placeholder="Coordinator Email"
                value={coordEmail}
                onChange={(e) => setCoordEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex gap-2 pt-2">
                <button 
                  disabled={isSubmitting}
                  onClick={handleCreate} 
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Creating...' : 'Create'}
                </button>
                <button 
                  disabled={isSubmitting}
                  onClick={() => setIsCreating(false)} 
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {labs?.map((lab: any) => (
          <div key={lab.id} className="glass rounded-2xl border border-white/10 p-6 hover:shadow-xl hover:shadow-blue-600/5 transition-all group">
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-blue-600/10 text-blue-400 flex items-center justify-center">
                <Globe className="w-6 h-6" />
              </div>
              <button
                onClick={() => handleDelete(lab.id)}
                className="p-2 rounded-lg hover:bg-red-500/10 text-slate-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <h3 className="text-white font-semibold text-lg">{lab.name}</h3>
            <p className="text-sm text-slate-500 mt-1 line-clamp-2">{lab.description || 'No description provided.'}</p>

            <div className="mt-6 pt-6 border-t border-white/5">
              <div className="flex items-center justify-between text-xs mb-3">
                <span className="text-slate-500 uppercase tracking-wider font-bold">Coordinator</span>
                {lab.coordinator ? (
                  <span className="text-blue-400 font-medium">{lab.coordinator.name}</span>
                ) : (
                  <span className="text-red-400/70 font-medium italic">Unassigned</span>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopicsTab({ labs }: { labs: any[] }) {
  const [selectedLabId, setSelectedLabId] = useState(labs?.[0]?.id || '');
  const [topics, setTopics] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [newTopicName, setNewTopicName] = useState('');

  const fetchTopics = async () => {
    setLoading(true);
    try {
      const result = await apiRequest<any[]>(`/labs/${selectedLabId}/topics`);
      setTopics(result);
    } catch { alert('Failed to fetch topics'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (selectedLabId) fetchTopics();
  }, [selectedLabId]);

  const handleAdd = async () => {
    if (!newTopicName.trim()) return;
    try {
      await apiRequest(`/labs/${selectedLabId}/topics`, { method: 'POST', body: { name: newTopicName } });
      setNewTopicName('');
      fetchTopics();
    } catch (err: any) { alert(err.message); }
  };

  const handleRemove = async (topicId: string) => {
    try {
      await apiRequest(`/labs/${selectedLabId}/topics/${topicId}`, { method: 'DELETE' });
      fetchTopics();
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="glass rounded-2xl border border-white/10 p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-lg font-semibold text-white">Lab Topics</h2>
          <p className="text-sm text-slate-500">Manage research interests for any lab.</p>
        </div>
        <select
          value={selectedLabId}
          onChange={(e) => setSelectedLabId(e.target.value)}
          className="bg-slate-900 border border-white/10 rounded-xl px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {labs?.map(lab => (
            <option key={lab.id} value={lab.id} className="bg-slate-900 text-slate-100">
              {lab.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="New topic name..."
          value={newTopicName}
          onChange={(e) => setNewTopicName(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none"
        />
        <button
          onClick={handleAdd}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center"><Activity className="w-6 h-6 text-blue-500 animate-spin" /></div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {topics.map(t => (
            <div key={t.id} className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-sm text-slate-300">
              {t.name}
              <button
                onClick={() => handleRemove(t.id)}
                className="p-1 rounded-full hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
              >
                <XCircle className="w-3 h-3" />
              </button>
            </div>
          ))}
          {topics.length === 0 && <p className="text-slate-500 italic py-4">No topics found for this lab.</p>}
        </div>
      )}
    </div>
  );
}

function TemplatesTab({ templates, refresh }: { templates: any[]; refresh: () => void }) {
  const [editing, setEditing] = useState<any>(null);

  const handleUpdate = async () => {
    try {
      await apiRequest(`/admin/templates/${editing.id}`, { method: 'PUT', body: editing });
      setEditing(null);
      refresh();
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="glass rounded-2xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/5"><h2 className="text-lg font-semibold text-white">Email Templates</h2></div>
      <div className="divide-y divide-white/5">
        {templates?.map((t: any) => (
          <div key={t.id} className="p-6">
            {editing?.id === t.id ? (
              <div className="space-y-4">
                <input
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white"
                  value={editing.subject}
                  onChange={(e) => setEditing({ ...editing, subject: e.target.value })}
                />
                <textarea
                  className="w-full h-32 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white"
                  value={editing.body}
                  onChange={(e) => setEditing({ ...editing, body: e.target.value })}
                />
                <div className="flex gap-2">
                  <button onClick={handleUpdate} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium">Save</button>
                  <button onClick={async () => { if (await confirmCancel()) setEditing(null); }} className="px-4 py-2 bg-white/5 text-slate-300 rounded-xl text-sm font-medium">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between group">
                <div>
                  <h3 className="text-white font-medium mb-1">{t.name}</h3>
                  <p className="text-xs text-slate-500 mb-2">Subject: {t.subject}</p>
                  <p className="text-sm text-slate-400 line-clamp-2">{t.body}</p>
                </div>
                <button
                  onClick={() => setEditing(t)}
                  className="p-2 rounded-lg hover:bg-blue-600/10 text-slate-500 hover:text-blue-400 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PoliciesTab({ policies, refresh }: { policies: any[]; refresh: () => void }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const handleUpdate = async (id: string) => {
    try {
      await apiRequest(`/admin/policies/${id}`, { method: 'PUT', body: { value: editingValue } });
      setEditingId(null);
      refresh();
    } catch (err: any) { alert(err.message); }
  };

  return (
    <div className="glass rounded-2xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/5"><h2 className="text-lg font-semibold text-white">System Policies</h2></div>
      <div className="divide-y divide-white/5">
        {policies?.map((p: any) => (
          <div key={p.id} className="p-6 flex items-center justify-between">
            <div>
              <h3 className="text-white font-medium mb-1">{p.key}</h3>
              <p className="text-xs text-slate-500">{p.lab ? `Lab: ${p.lab.name}` : 'Global Default'}</p>
            </div>
            {editingId === p.id ? (
              <div className="flex gap-2">
                <input
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-1 text-white text-sm"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  autoFocus
                />
                <button onClick={() => handleUpdate(p.id)} className="p-2 text-blue-400 hover:text-blue-300"><Plus className="w-4 h-4" /></button>
                <button onClick={() => setEditingId(null)} className="p-2 text-slate-500 hover:text-slate-400"><XCircle className="w-4 h-4" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <span className="text-blue-400 font-mono bg-blue-400/5 px-2 py-1 rounded border border-blue-400/20">{p.value}</span>
                <button
                  onClick={() => { setEditingId(p.id); setEditingValue(p.value); }}
                  className="p-2 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"
                >
                  <Settings className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function actionBadgeClass(action: string) {
  if (action?.includes('DELETE')) return 'bg-red-500/10 text-red-400';
  if (action?.includes('CREATE') || action?.includes('SIGNUP')) return 'bg-green-500/10 text-green-400';
  if (action?.includes('LOCK')) return 'bg-amber-500/10 text-amber-400';
  if (action?.includes('LOGIN')) return 'bg-purple-500/10 text-purple-400';
  return 'bg-blue-500/10 text-blue-400';
}

function LogsTab({ logs }: { logs: any[] }) {
  const [actionFilter, setActionFilter] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  const uniqueActions = Array.from(new Set((logs ?? []).map((l: any) => l.action).filter(Boolean))).sort();

  const hasFilters = actionFilter || dateFrom || dateTo;

  const filtered = (logs ?? [])
    .filter((log: any) => {
      if (actionFilter && log.action !== actionFilter) return false;
      if (dateFrom && new Date(log.createdAt) < new Date(dateFrom)) return false;
      if (dateTo) {
        const to = new Date(dateTo);
        to.setHours(23, 59, 59, 999);
        if (new Date(log.createdAt) > to) return false;
      }
      return true;
    })
    .sort((a: any, b: any) => {
      const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sortOrder === 'desc' ? -diff : diff;
    });

  const clearFilters = () => { setActionFilter(''); setDateFrom(''); setDateTo(''); };

  return (
    <div className="glass rounded-2xl border border-white/10 overflow-hidden">
      <div className="p-6 border-b border-white/5 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Audit Logs</h2>
        <span className="text-xs text-slate-500 uppercase tracking-wider">Latest 200 Actions</span>
      </div>

      {/* Filter & sort bar */}
      <div className="px-6 py-4 border-b border-white/5 flex flex-wrap items-end gap-3 bg-white/[0.01]">
        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="text-xs text-slate-500 uppercase tracking-wider">Filter</span>
        </div>

        {/* Action type */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">Action type</label>
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50 min-w-[180px]"
          >
            <option value="">All actions</option>
            {uniqueActions.map(a => (
              <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </div>

        {/* Date from */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>

        {/* Date to */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          />
        </div>

        {/* Sort direction */}
        <div className="flex flex-col gap-1 ml-auto">
          <label className="text-[10px] text-slate-500 uppercase tracking-wider">Sort by date</label>
          <button
            onClick={() => setSortOrder(o => o === 'desc' ? 'asc' : 'desc')}
            className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white hover:bg-white/10 transition-colors"
          >
            {sortOrder === 'desc'
              ? <><ArrowDown className="w-3.5 h-3.5 text-slate-400" /> Newest first</>
              : <><ArrowUp className="w-3.5 h-3.5 text-slate-400" /> Oldest first</>
            }
          </button>
        </div>

        {/* Clear */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-white/10 rounded-lg hover:bg-white/5 transition-colors self-end"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}
      </div>

      {/* Result count */}
      <div className="px-6 py-2 bg-white/[0.01] border-b border-white/5">
        <span className="text-xs text-slate-500">
          Showing <span className="text-slate-300 font-medium">{filtered.length}</span> of <span className="text-slate-300 font-medium">{(logs ?? []).length}</span> entries
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/5">
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Time</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actor</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Action</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-sm text-slate-500">No entries match the current filters.</td>
              </tr>
            ) : (
              filtered.map((log: any) => (
                <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-6 py-4 text-xs text-slate-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-white">{log.actor?.name || 'System'}</div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">{log.actor?.role || 'Service'}</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${actionBadgeClass(log.action)}`}>
                      {log.action?.replace(/_/g, ' ') || 'UNKNOWN'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {log.details || `${log.entityType || 'Entity'} (${log.entityId?.slice(0, 8) || 'N/A'}...)`}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
