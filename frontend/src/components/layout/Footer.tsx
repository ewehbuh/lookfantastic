import { Link } from '@/i18n/navigation';

export default function Footer() {
  return (
    <footer className="bg-brand-surface text-brand-ink border-t border-brand-border p-8">
      <div className="max-w-7xl mx-auto text-center">
        <Link href="/orders/access" className="block underline mb-4">Access a guest order</Link>
        © {new Date().getFullYear()} Lookfantastic Clone
      </div>
    </footer>
  );
}
