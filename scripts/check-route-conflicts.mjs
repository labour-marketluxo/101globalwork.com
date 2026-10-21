#!/usr/bin/env node
/**
 * Route-conflict check.
 *
 * ⚠️ THIS EXISTS BECAUSE THE FAILURE IS INVISIBLE UNTIL SOMEBODY RUNS `next dev`. Two dynamic segments at the
 * same URL position with different names — `[id]` beside `[requestId]` — make Turbopack refuse to start with
 * "You cannot use different slug names for the same dynamic path", while `next build --webpack` compiled the
 * same tree happily for four sessions. A rule that only one of two build paths enforces is a rule that gets
 * discovered by whoever happens to type `npm run dev` first, so it is checked here instead.
 *
 * WHY A SCRIPT AND NOT A TEST: there is no test runner for the application in this repository, and this is a
 * property of the filesystem rather than of any module. Same reasoning as the migration forward-reference
 * scanner this repo already wrote — a structural rule deserves a structural check.
 *
 * TWO RULES, both of which Next enforces at runtime and neither of which the typechecker can see:
 *
 *   1. ONE SLUG NAME PER DYNAMIC POSITION. `app/x/[id]` and `app/x/[requestId]` are the same URL shape with two
 *      names, and Next cannot tell which one a request means.
 *   2. ONE ROUTE FILE PER URL. Two `page.tsx` files that resolve to the same path (usually through route groups,
 *      which are transparent) are a collision, and so is a `page.tsx` beside a `route.ts`.
 *
 * ROUTE GROUPS ARE STRIPPED BEFORE COMPARING, because `(app)` and `(marketing)` do not appear in a URL — which is
 * exactly why the conflict in rule 1 can hide two directories apart in the tree.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const appDir = join(root, 'app');

const ROUTE_FILE = /^(page|route)\.(tsx|ts|jsx|js)$/;
const ROUTE_GROUP = /^\(.+\)$/;
/**
 * ⚠️ `_folder` IS A PRIVATE FOLDER: THE ROUTER NEVER SERVES ANYTHING INSIDE IT, so nothing inside it can
 * conflict with anything. This was a bug in the first version of this script, found by pointing it at a probe
 * directory that happened to start with an underscore: it walked in, took the dynamic segments to be siblings of
 * the parent's other routes, and reported a conflict that did not exist. A checker that cries wolf is worse
 * than no checker, so private folders are skipped rather than walked.
 */
const PRIVATE = /^_/;
const DYNAMIC = /^\[[^\]]+\]$/;
const CATCH_ALL = /^\[\[?\.\.\.[^\]]+\]\]?$/;

const pages = [];
/** parent URL -> the set of dynamic segment names declared directly under it. */
const dynamicNames = new Map();

function walk(dir, urlParts, fsParts) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);

    if (stat.isDirectory()) {
      // A private folder is not routable at all: skip it entirely rather than walking into it.
      if (PRIVATE.test(entry)) continue;
      // A route group is transparent: walk through it without adding a URL segment.
      if (ROUTE_GROUP.test(entry)) {
        walk(full, urlParts, [...fsParts, entry]);
        continue;
      }
      if (DYNAMIC.test(entry) || CATCH_ALL.test(entry)) {
        const parent = urlParts.join('/');
        if (!dynamicNames.has(parent)) dynamicNames.set(parent, new Set());
        dynamicNames.get(parent).add(entry);
      }
      walk(full, [...urlParts, entry], [...fsParts, entry]);
      continue;
    }

    if (ROUTE_FILE.test(entry)) {
      pages.push({ urlParts, fsParts, file: entry });
    }
  }
}

walk(appDir, [], []);

const problems = [];

for (const [parent, names] of dynamicNames) {
  if (names.size > 1) {
    problems.push(
      `different slug names for the same dynamic path at /${parent || ''}: ${[...names].sort().join(' and ')}`,
    );
  }
}

const byUrl = new Map();
for (const page of pages) {
  const url = `/${page.urlParts.join('/')}`;
  const where = `app/${[...page.fsParts, page.file].join('/')}`;
  if (!byUrl.has(url)) byUrl.set(url, []);
  byUrl.get(url).push(where);
}

for (const [url, where] of byUrl) {
  if (where.length > 1) {
    problems.push(`${url} is defined ${where.length} times: ${where.join(', ')}`);
  }
}

if (problems.length > 0) {
  console.error(`\nRoute conflicts found (${problems.length}):\n`);
  for (const problem of problems) console.error(`  • ${problem}`);
  console.error(
    '\nNext refuses to start with these. Rename the segment so one URL position has one slug name, or move one of\n' +
      'the route files so one URL has one route.\n',
  );
  process.exit(1);
}

console.log(
  `route conflicts: none (${pages.length} route files, ${dynamicNames.size} dynamic positions, app root ${relative(root, appDir) || 'app'})`,
);
