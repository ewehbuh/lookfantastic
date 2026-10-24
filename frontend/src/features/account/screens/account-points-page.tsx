'use client';
import { customerTools } from '../api/customer-tools';
import { useAccountPage } from '../hooks/use-account-page';

export default function PointsPage() {
  const {current, setPage, refresh} = useAccountPage(customerTools.points, 'Unable to load your points. Please try again.');
  return <section className="max-w-3xl mx-auto p-4 py-10"><h1 className="text-2xl font-bold mb-6">Beauty Bag Points</h1>
    {!current && <p role="status">Loading points…</p>}
    {current?.error && <p role="alert">{current.error}</p>}
    {current?.data && <><p className="text-xl font-semibold">Balance: {current.data.balance} points</p>
      {current.data.results.length === 0 && <p>No points transactions yet.</p>}
      <ul>{current.data.results.map(transaction => <li key={transaction.id} className="border-b py-3"><p>{transaction.description}</p><p>{transaction.type === 'earn' ? '+' : '−'}{transaction.points} points · {transaction.type === 'earn' ? 'Earned' : 'Spent'}</p></li>)}</ul>
      <nav aria-label="Points pagination" className="flex gap-4 my-6">{current.data.previous && <button onClick={() => setPage(value => value-1)}>Previous transactions</button>}{current.data.next && <button onClick={() => setPage(value => value+1)}>Next transactions</button>}</nav>
    </>}
    <button disabled={!current} className="underline" onClick={refresh}>Reload points</button>
  </section>;
}
