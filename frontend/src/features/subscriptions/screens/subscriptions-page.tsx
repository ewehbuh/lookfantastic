'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api/client';
import { useAppSelector } from '@/store/hooks';
import { Link } from '@/i18n/navigation';
import { formatCurrency } from '@/lib/utils';

export default function SubscriptionsPage() {
  const { accessToken } = useAppSelector((s) => s.auth);
  const [plans, setPlans] = useState<any[]>([]);
  const [mySubs, setMySubs] = useState<any[]>([]);

  useEffect(() => {
    apiClient.get('/api/subscriptions/plans/').then((res) => setPlans(res.data));
    if (accessToken) {
      apiClient.get('/api/subscriptions/my/').then((res) => setMySubs(res.data));
    }
  }, [accessToken]);

  const handleSubscribe = async (planId: number) => {
    try {
      await apiClient.post('/api/subscriptions/my/subscribe/', { plan_id: planId });
      alert('Subscribed!');
      // refresh my subs
      const res = await apiClient.get('/api/subscriptions/my/');
      setMySubs(res.data);
    } catch (err) {
      alert('Subscription failed');
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-10">
      <h1 className="text-2xl font-bold mb-6">Beauty Box Subscription</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan: any) => (
          <div key={plan.id} className="border p-4 rounded">
            <h2 className="font-bold text-lg">{plan.name}</h2>
            <p className="text-2xl font-bold my-2">{formatCurrency(plan.price)} / {plan.interval}</p>
            <button onClick={() => handleSubscribe(plan.id)} className="w-full bg-brand-ink text-brand-paper py-2 rounded">
              Subscribe
            </button>
          </div>
        ))}
      </div>
      {mySubs.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-bold mb-4">Your Subscriptions</h2>
          {mySubs.map((sub: any) => (
            <div key={sub.id} className="border-b py-2 flex justify-between">
              <span>{sub.plan.name} – {sub.status}</span>
              <span>Next billing: {new Date(sub.next_billing_date).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
