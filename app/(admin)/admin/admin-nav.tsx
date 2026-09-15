'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type AdminNavItem = { href: string; label: string };

export default function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();

  return <nav aria-label="Admin sections">
    {items.map(item => {
      const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
      return <Link
        key={item.href}
        href={item.href}
        aria-current={active ? 'page' : undefined}
        style={active ? { background: 'rgba(220,233,228,.12)', color: '#fff', fontWeight: 700 } : undefined}
      >
        {item.label}
      </Link>;
    })}
  </nav>;
}
