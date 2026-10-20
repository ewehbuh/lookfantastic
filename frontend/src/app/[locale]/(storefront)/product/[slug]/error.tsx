'use client';

export default function ProductError({reset}: {reset: () => void}) {
  return <section className="max-w-7xl mx-auto p-8">
    <h1 className="text-2xl font-bold">Product temporarily unavailable</h1>
    <p role="alert" className="my-4">We could not load this product. Please try again.</p>
    <button onClick={reset} className="bg-brand-ink text-brand-paper px-4 py-2">Try again</button>
  </section>;
}
