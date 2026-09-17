'use client';

import Image from 'next/image';
import { MapPin, Search } from 'lucide-react';
import { useMemo, useState } from 'react';

/**
 * SearchWizard — the two-stage [ Location | Service ] gateway.
 *
 * This is a CLIENT component ('use client') and lives outside app/ so the
 * homepage stays a server component. That split is deliberate: a page.tsx with
 * 'use client' would push the whole route onto the client, which the codebase
 * avoids everywhere.
 *
 * Submission model: a plain GET form to /search with `location` and `q` — the
 * same contract the rest of the app already uses, so no router call is needed
 * and the result is a normal navigable URL (/search?location=…&q=…).
 *
 * The suggestion thumbnails double as the "micro-thumbnail image slots" from
 * the design. Every photo ID here was verified to return 200 image/jpeg.
 */

type Suggestion = {
  /** Value written into the input. */
  value: string;
  label: string;
  hint?: string;
  /** Unsplash photo id; locations have none and fall back to a pin icon. */
  photo?: string;
};

const thumb = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=120&q=70`;

/** Locations mirror the coverage the discovery hubs actually describe. */
const LOCATIONS: Suggestion[] = [
  { value: 'Gwarinpa, Abuja', label: 'Gwarinpa', hint: 'Abuja' },
  { value: 'Maitama, Abuja', label: 'Maitama', hint: 'Abuja' },
  { value: 'Wuse, Abuja', label: 'Wuse', hint: 'Abuja' },
  { value: 'Ikeja, Lagos', label: 'Ikeja', hint: 'Lagos' },
  { value: 'Lekki, Lagos', label: 'Lekki', hint: 'Lagos' },
  { value: 'Victoria Island, Lagos', label: 'Victoria Island', hint: 'Lagos' },
  { value: 'GRA, Port Harcourt', label: 'GRA', hint: 'Port Harcourt' },
];

const SERVICES: Suggestion[] = [
  {
    value: 'Plumbing',
    label: 'Plumbing',
    hint: 'Leaks, pipework, fittings',
    photo: thumb('photo-1517646287270-a5a9ca602e5c'),
  },
  {
    value: 'Electrical Systems',
    label: 'Electrical Systems',
    hint: 'Rewiring, faults, inverters',
    photo: thumb('photo-1555963966-b7ae5404b6ed'),
  },
  {
    value: 'Air Conditioning & HVAC',
    label: 'Air Conditioning & HVAC',
    hint: 'Install, service, gas refill',
    photo: thumb('photo-1612836639523-2ed74bc0209e'),
  },
  {
    value: 'Home Cleaning',
    label: 'Home Cleaning',
    hint: 'Deep clean, move-out, offices',
    photo: thumb('photo-1527515637462-cff94eecc1ac'),
  },
];

/** Case-insensitive contains match on label, value and hint. */
function matches(items: Suggestion[], query: string): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.value.toLowerCase().includes(q) ||
      (item.hint ?? '').toLowerCase().includes(q),
  );
}

export default function SearchWizard() {
  const [location, setLocation] = useState('');
  const [service, setService] = useState('');
  const [open, setOpen] = useState<'location' | 'service' | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const options = useMemo(
    () => (open === 'location' ? matches(LOCATIONS, location) : matches(SERVICES, service)),
    [open, location, service],
  );

  const choose = (item: Suggestion) => {
    if (open === 'location') {
      setLocation(item.value);
      // Stage two: hand focus straight to the service field.
      setOpen('service');
    } else {
      setService(item.value);
      setOpen(null);
    }
    setActiveIndex(0);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter') {
      const chosen = options[activeIndex];
      if (chosen) {
        event.preventDefault();
        choose(chosen);
      }
    } else if (event.key === 'Escape') {
      setOpen(null);
    }
  };

  const fieldClass = (stage: 'location' | 'service') =>
    [
      'flex flex-1 items-center gap-2 rounded-xl border px-3 transition-all',
      // The brief's tinted -> white + dark ring treatment, driven by CSS
      // focus-within so the highlight can never drift from real focus.
      'bg-slate-50 focus-within:bg-white focus-within:ring-2 focus-within:ring-slate-900',
      open === stage ? 'border-slate-300' : 'border-slate-200',
    ].join(' ');

  const renderList = (stage: 'location' | 'service') => {
    if (open !== stage) return null;
    if (options.length === 0) {
      return (
        <ul
          role="listbox"
          className="absolute top-full right-0 left-0 z-20 mt-2 list-none overflow-hidden rounded-xl border border-slate-200/80 bg-white p-1 text-left shadow-xl"
        >
          <li className="px-3 py-2 text-sm text-slate-500">No matches yet.</li>
        </ul>
      );
    }
    return (
      <ul
        role="listbox"
        className="absolute top-full right-0 left-0 z-20 mt-2 list-none overflow-hidden rounded-xl border border-slate-200/80 bg-white p-1 text-left shadow-xl"
      >
        {options.map((item, index) => (
          <li key={item.value}>
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              // mousedown fires before the input's blur, so the click lands.
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(item)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-center gap-3 rounded-md px-2 py-2 text-left transition-colors ${
                index === activeIndex ? 'bg-slate-100' : 'bg-transparent'
              }`}
            >
              {/* micro-thumbnail slot */}
              {item.photo ? (
                <Image
                  src={item.photo}
                  alt=""
                  width={40}
                  height={40}
                  className="h-10 w-10 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                  <MapPin className="h-4 w-4" />
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">
                  {item.label}
                </span>
                {item.hint ? (
                  <span className="block truncate text-xs text-slate-500">{item.hint}</span>
                ) : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    );
  };

  return (
    <form
      action="/search"
      method="get"
      role="search"
      aria-label="Find an expert"
      className="mx-auto max-w-2xl rounded-2xl border border-slate-200/80 bg-white p-2 shadow-xl md:p-3"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {/* Stage 1 — location */}
        <div className={`relative ${fieldClass('location')}`}>
          <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            name="location"
            value={location}
            onChange={(event) => {
              setLocation(event.target.value);
              setOpen('location');
              setActiveIndex(0);
            }}
            onFocus={() => {
              setOpen('location');
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            aria-label="Your area or city"
            aria-autocomplete="list"
            aria-expanded={open === 'location'}
            placeholder="Where do you need work done?"
            className="w-full border-0 bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          {renderList('location')}
        </div>

        {/* Stage 2 — service */}
        <div className={`relative ${fieldClass('service')}`}>
          <Search className="h-4 w-4 shrink-0 text-slate-400" />
          <input
            name="q"
            value={service}
            onChange={(event) => {
              setService(event.target.value);
              setOpen('service');
              setActiveIndex(0);
            }}
            onFocus={() => {
              setOpen('service');
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            autoComplete="off"
            aria-label="What do you need done?"
            aria-autocomplete="list"
            aria-expanded={open === 'service'}
            placeholder="What do you need done?"
            className="w-full border-0 bg-transparent py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
          {renderList('service')}
        </div>

        <button
          type="submit"
          className="rounded-xl bg-primary px-6 py-3 text-sm font-medium text-white shadow-md transition-all hover:bg-primary-dark"
        >
          Find experts
        </button>
      </div>
    </form>
  );
}
