'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';

export default function PointsPage() {
  const [transactions, setTransactions] = useState<any[]>([]);
  const [balance, setBalance] = useState(0);

  useEffect(() => {
    apiClient.get('/api/accounts/points/').then((res) => setTransactions(res.data));
    apiClient.get('/api/accounts/points/balance/').then((res) => setBalance(res.data.total_points));
  }, []);

  return (
    <div className="max-w-2xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-4">Beauty Bag Points</h1>
      <p className="text-lg">Balance: {balance} pts</p>
      <div className="mt-4">
        {transactions.map((tx: any) => (
          <div key={tx.id} className="border-b py-2 flex justify-between">
            <span>{tx.description}</span>
            <span className={tx.type === 'earn' ? 'text-green-600' : 'text-red-600'}>
              {tx.type === 'earn' ? '+' : '-'}{tx.points}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}