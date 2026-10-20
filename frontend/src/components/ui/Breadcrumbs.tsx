import { Link } from '@/i18n/navigation';

export default function Breadcrumbs({ items }: { items: { name: string; href?: string }[] }) {
  return (
    <nav className="text-sm text-gray-500 mb-4">
      {items.map((item, i) => (
        <span key={i}>
          {item.href ? <Link href={item.href} className="hover:underline">{item.name}</Link> : item.name}
          {i < items.length - 1 && ' / '}
        </span>
      ))}
    </nav>
  );
}
