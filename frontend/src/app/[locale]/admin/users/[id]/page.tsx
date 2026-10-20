'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import apiClient from '@/lib/api-client';

interface AdminUser {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_staff: boolean;
  is_superuser: boolean;
  is_active: boolean;
  is_banned: boolean;
  banned_until: string | null;
  login_disabled: boolean;
}

export default function EditUser() {
  const params = useParams(); // id is a string
  const userId = params.id as string;
  const router = useRouter();

  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    is_staff: false,
    is_superuser: false,
    is_active: true,
    is_banned: false,
    banned_until: '',
    login_disabled: false,
  });

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await apiClient.get(`/api/accounts/admin/users/${userId}/`);
        const u = res.data;
        setUser(u);
        setForm({
          is_staff: u.is_staff,
          is_superuser: u.is_superuser,
          is_active: u.is_active,
          is_banned: u.is_banned,
          banned_until: u.banned_until || '',
          login_disabled: u.login_disabled,
        });
      } catch (err) {
        setError('Failed to load user.');
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiClient.patch(`/api/accounts/admin/users/${userId}/`, form);
      router.push('/admin/users');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p>Loading user...</p>;
  if (!user) return <p className="text-red-500">User not found.</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Edit User: {user.email}</h1>
      {error && <p className="text-red-600 mb-4">{error}</p>}
      <form onSubmit={handleSubmit} className="space-y-4 max-w-md bg-white p-6 rounded shadow">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={form.is_staff}
            onChange={(e) => setForm({ ...form, is_staff: e.target.checked })}
          />
          <span>Is Staff</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={form.is_superuser}
            onChange={(e) => setForm({ ...form, is_superuser: e.target.checked })}
          />
          <span>Is Superuser</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
          />
          <span>Is Active</span>
        </label>

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={form.is_banned}
            onChange={(e) => setForm({ ...form, is_banned: e.target.checked })}
          />
          <span>Is Banned</span>
        </label>

        {form.is_banned && (
          <div>
            <label className="block text-sm font-medium">Banned Until (optional)</label>
            <input
              type="datetime-local"
              value={form.banned_until}
              onChange={(e) => setForm({ ...form, banned_until: e.target.value })}
              className="border p-1 rounded w-full"
            />
          </div>
        )}

        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={form.login_disabled}
            onChange={(e) => setForm({ ...form, login_disabled: e.target.checked })}
          />
          <span>Login Disabled</span>
        </label>

        <button
          type="submit"
          disabled={saving}
          className="bg-brand-ink text-brand-paper px-4 py-2 rounded hover:bg-brand-hover disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
