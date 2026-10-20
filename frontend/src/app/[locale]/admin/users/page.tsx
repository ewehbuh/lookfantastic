'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import apiClient from '@/lib/api-client';
import { useAppSelector } from '@/store/hooks';

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

export default function UsersList() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const token = useAppSelector((state) => state.auth.accessToken);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiClient.get('/api/accounts/admin/users/');
        setUsers(res.data.results || res.data); // handle pagination if any
      } catch (err) {
        console.error('Failed to fetch users', err);
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  if (loading) return <p>Loading users...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">User Management</h1>
      <table className="min-w-full bg-white border rounded">
        <thead>
          <tr className="bg-gray-100 text-left">
            <th className="p-2">Email</th>
            <th className="p-2">Name</th>
            <th className="p-2">Staff</th>
            <th className="p-2">Superuser</th>
            <th className="p-2">Active</th>
            <th className="p-2">Banned</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id} className="border-t hover:bg-gray-50">
              <td className="p-2">{user.email}</td>
              <td className="p-2">{user.first_name} {user.last_name}</td>
              <td className="p-2">{user.is_staff ? '✅' : '❌'}</td>
              <td className="p-2">{user.is_superuser ? '✅' : '❌'}</td>
              <td className="p-2">{user.is_active ? '✅' : '❌'}</td>
              <td className="p-2">{user.is_banned ? 'Yes' : 'No'}</td>
              <td className="p-2">
                <Link
                  href={`/admin/users/${user.id}`}
                  className="text-blue-600 underline"
                >
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}