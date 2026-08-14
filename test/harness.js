// Minimal zero-dependency test harness.
//
// The project ships no npm dependencies, and the test suite keeps that promise:
// it runs on plain `node`, nothing to install. Suites register cases with
// `test()` and assert with the helpers below; `run()` prints a report and sets
// the exit code.
//
// Why this exists (brief §13): a syntax check cannot catch a wrong object key.
// The bug that plagued the previous prototype — reading `rooms["coque"]`, a
// *system* name, where a *room* key was expected — was a data mistake, not a
// code mistake. So the suites here validate DATA, not just code paths.

const cases = [];
let currentSuite = 'general';

export function suite(name) {
  currentSuite = name;
}

export function test(name, fn) {
  cases.push({ suite: currentSuite, name, fn });
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

export function equal(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'not equal'}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`);
  }
}

// Asserts a list is empty, printing every offending entry. Used constantly by
// the data suites: collect all violations, then report them at once, so one run
// surfaces every bad key instead of only the first.
export function empty(list, msg) {
  if (list.length) {
    throw new Error(`${msg} (${list.length})\n    - ${list.join('\n    - ')}`);
  }
}

export async function run() {
  let passed = 0;
  const failures = [];
  let shown = null;

  for (const c of cases) {
    if (c.suite !== shown) {
      shown = c.suite;
      console.log(`\n  ${c.suite}`);
    }
    try {
      await c.fn();
      passed++;
      console.log(`    \x1b[32m✓\x1b[0m ${c.name}`);
    } catch (e) {
      failures.push({ ...c, error: e });
      console.log(`    \x1b[31m✗\x1b[0m ${c.name}`);
      console.log(`      \x1b[31m${e.message.split('\n').join('\n      ')}\x1b[0m`);
    }
  }

  console.log(
    `\n  ${passed}/${cases.length} passed` +
      (failures.length ? `, \x1b[31m${failures.length} failed\x1b[0m` : '') +
      '\n'
  );
  process.exitCode = failures.length ? 1 : 0;
  return failures.length === 0;
}
