'use client';

import React, { useState, useEffect } from 'react';
import { Plus, XCircle, Activity, CheckCircle, Edit3 } from 'lucide-react';
import { apiRequest } from '@/lib/api';

interface Topic {
  id: string;
  name: string;
}

interface LabTopicManagerProps {
  labId: string;
  labName: string;
}

export function LabTopicManager({ labId, labName }: LabTopicManagerProps) {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTopicName, setNewTopicName] = useState('');
  const [editingTopic, setEditingTopic] = useState<Topic | null>(null);
  const [editingName, setEditingName] = useState('');

  const fetchTopics = React.useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiRequest<Topic[]>(`/labs/${labId}/topics`);
      setTopics(result);
    } catch {
      console.error('Failed to fetch topics');
    } finally {
      setLoading(false);
    }
  }, [labId]);

  useEffect(() => {
    fetchTopics();
  }, [fetchTopics]);

  const handleAdd = async () => {
    if (!newTopicName.trim()) return;
    try {
      await apiRequest(`/labs/${labId}/topics`, { 
        method: 'POST', 
        body: { name: newTopicName } 
      });
      setNewTopicName('');
      fetchTopics();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleRemove = async (topicId: string) => {
    if (!confirm('Remove this topic from your lab?')) return;
    try {
      await apiRequest(`/labs/${labId}/topics/${topicId}`, { method: 'DELETE' });
      fetchTopics();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleUpdate = async () => {
    if (!editingTopic || !editingName.trim()) return;
    try {
      await apiRequest(`/labs/${labId}/topics/${editingTopic.id}`, { 
        method: 'PUT', 
        body: { newName: editingName } 
      });
      setEditingTopic(null);
      fetchTopics();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  return (
    <div className="glass rounded-2xl border border-white/10 p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-blue-400" />
            {labName} Topics
          </h2>
          <p className="text-sm text-slate-500">Manage the research interest pool for your lab.</p>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        <input 
          type="text" 
          placeholder="Add new topic..." 
          value={newTopicName}
          onChange={(e) => setNewTopicName(e.target.value)}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
        />
        <button 
          onClick={handleAdd}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-medium transition-colors flex items-center gap-2 shadow-lg shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center">
          <Activity className="w-6 h-6 text-blue-500 animate-spin" />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {topics.map(t => (
            <div key={t.id} className="group flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/10 rounded-full text-sm text-slate-300 hover:bg-white/10 transition-colors">
              {editingTopic?.id === t.id ? (
                <div className="flex items-center gap-1 animate-in zoom-in-95 duration-200">
                  <input 
                    className="bg-transparent border-none p-0 text-white text-sm focus:outline-none w-24"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    autoFocus
                    onBlur={handleUpdate}
                    onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
                  />
                </div>
              ) : (
                <>
                  <span className="cursor-default">{t.name}</span>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => { setEditingTopic(t); setEditingName(t.name); }}
                      className="p-1 rounded-full hover:bg-blue-500/20 text-slate-500 hover:text-blue-400 transition-colors"
                    >
                      <Edit3 className="w-3 h-3" />
                    </button>
                    <button 
                      onClick={() => handleRemove(t.id)}
                      className="p-1 rounded-full hover:bg-red-500/20 text-slate-500 hover:text-red-400 transition-colors"
                    >
                      <XCircle className="w-3 h-3" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {topics.length === 0 && <p className="text-slate-500 italic py-4">No topics assigned to this lab yet.</p>}
        </div>
      )}
    </div>
  );
}
