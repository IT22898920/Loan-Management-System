'use client';

import { useState, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import { Plus, Pencil, Trash2, Building2, Loader2, Hash, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createClient } from '@/lib/supabase/client';
import { Center } from '@/types';
import { createCenterAction, updateCenterAction, deleteCenterAction } from '@/app/actions/centers';

export default function CentersPage() {
  const [centers, setCenters] = useState<Center[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Center | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return centers;
    return centers.filter(
      (c) => c.name.toLowerCase().includes(q) || String(c.center_number).includes(q)
    );
  }, [centers, search]);

  useEffect(() => { loadCenters(); }, []);

  async function loadCenters() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.from('centers').select('*').order('center_number');
    setCenters(data ?? []);
    setLoading(false);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const result = editing ? await updateCenterAction(editing.id, fd) : await createCenterAction(fd);
    setSaving(false);
    if (result?.error) { toast.error(result.error); return; }
    toast.success(editing ? 'Center updated!' : 'Center created!');
    setEditing(null);
    setShowForm(false);
    loadCenters();
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This will fail if it has members.`)) return;
    const result = await deleteCenterAction(id);
    if (result?.error) { toast.error(result.error); return; }
    toast.success('Center deleted.');
    loadCenters();
  }

  const colors = ['bg-blue-500','bg-violet-500','bg-emerald-500','bg-orange-500','bg-pink-500','bg-cyan-500','bg-rose-500','bg-teal-500'];

  return (
    <div className="min-h-screen bg-gray-50/50">
      {/* Header */}
      <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white px-4 md:px-8 py-6 md:py-8">
        <p className="text-blue-200 text-sm font-medium mb-1">Management</p>
        <h1 className="text-2xl md:text-3xl font-bold">Centers</h1>
        <p className="text-blue-200 text-sm mt-1">{centers.length} centers registered</p>
      </div>

      <div className="px-4 md:px-8 py-6 space-y-5">
        {/* Toolbar */}
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by center name or number…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-gray-700">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            onClick={() => { setEditing(null); setShowForm(true); }}
            className="rounded-xl shadow-sm"
          >
            <Plus className="h-4 w-4 mr-2" /> Add Center
          </Button>
        </div>

        {search && (
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-gray-900">{filtered.length}</span> of {centers.length} centers
          </p>
        )}

        {/* Form */}
        {(showForm || editing) && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 mb-4">{editing ? 'Edit Center' : 'New Center'}</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Center Name</Label>
                <Input id="name" name="name" defaultValue={editing?.name} required placeholder="e.g. Kahawathugoda" className="rounded-xl" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="center_number">Center Number</Label>
                <Input id="center_number" name="center_number" type="number" defaultValue={editing?.center_number} required placeholder="e.g. 2" className="rounded-xl" />
              </div>
              <div className="flex items-end gap-2">
                <Button type="submit" disabled={saving} className="rounded-xl">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? 'Update' : 'Create'}
                </Button>
                <Button type="button" variant="outline" className="rounded-xl" onClick={() => { setEditing(null); setShowForm(false); }}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Centers grid */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-16 text-center text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">{centers.length === 0 ? 'No centers yet' : 'No results found'}</p>
            <p className="text-sm mt-1">{centers.length === 0 ? 'Create your first center to get started.' : 'Try a different search.'}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((center, i) => (
              <div key={center.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 hover:shadow-md transition-all group">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-xl ${colors[i % colors.length]} flex items-center justify-center`}>
                      <Building2 className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900">{center.name}</h3>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Hash className="h-3 w-3" />
                        Center {center.center_number}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => { setEditing(center); setShowForm(false); }}
                      className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(center.id, center.name)}
                      className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
