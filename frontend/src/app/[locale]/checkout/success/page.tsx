import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function SuccessContent() {
  const searchParams = useSearchParams();
  return <p>Order {searchParams.get('order')} placed successfully!</p>;
}

export default function SuccessPage() {
  return (
    <div className="max-w-2xl mx-auto py-20 text-center">
      <Suspense fallback={<p>Loading...</p>}>
        <SuccessContent />
      </Suspense>
    </div>
  );
}