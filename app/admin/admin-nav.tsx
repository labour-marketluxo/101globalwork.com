'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type AdminNavItem = { href: string; label: string };

export default function AdminNav({ items }: { items: AdminNavItem[] }) {
  const pathname = usePathname();

  return <nav aria-label="Admin sections">
    {items.map(item => {
      const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href);
      return <Link key={item.href} href={item.href} className={active ? 'active' : undefined} aria-current={active ? 'page' : undefined}>
        {item.label}
      </Link>;
    })}
  </nav>;
}
