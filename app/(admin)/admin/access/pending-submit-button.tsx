'use client';

import { useFormStatus } from 'react-dom';

export default function PendingSubmitButton({ idle, pending, className }: { idle: string; pending: string; className?: string }) {
  const { pending: isPending } = useFormStatus();
  return <button type="submit" className={className} disabled={isPending} aria-busy={isPending}>{isPending ? pending : idle}</button>;
}
