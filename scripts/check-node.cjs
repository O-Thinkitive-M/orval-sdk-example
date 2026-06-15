/*
 * Node version guard.
 * --------------------
 * Runs automatically on `npm install` (via the "preinstall" script) BEFORE any
 * dependency is downloaded. If the local Node is too old for our toolchain
 * (Vite 8 needs >=22.12, Orval 8 needs >=22.18), it stops the install with a
 * clear, actionable message instead of a cryptic crash deep inside Vite/Orval.
 *
 * Kept in plain ES5 (no const/arrow/optional-chaining) so it executes even on
 * very old Node versions — the whole point is to run on the wrong version.
 */
var REQUIRED_MAJOR = 22;
var REQUIRED_MINOR = 18; // 22.18.0 — the strictest dep (Orval 8)

var current = process.versions.node; // e.g. "20.11.1"
var parts = current.split('.');
var major = parseInt(parts[0], 10);
var minor = parseInt(parts[1], 10);

var ok = major > REQUIRED_MAJOR || (major === REQUIRED_MAJOR && minor >= REQUIRED_MINOR);

if (!ok) {
  var red = '[31m';
  var yellow = '[33m';
  var reset = '[0m';

  console.error('');
  console.error(red + '  X  Your Node version (' + current + ') is too old for this project.' + reset);
  console.error('     Required: Node >= ' + REQUIRED_MAJOR + '.' + REQUIRED_MINOR + '.0  (Vite 8 + Orval 8).');
  console.error('');
  console.error(yellow + '  How to fix (recommended - using nvm):' + reset);
  console.error('     nvm install      # installs the version pinned in .nvmrc');
  console.error('     nvm use');
  console.error('     npm install');
  console.error('');
  console.error('  No nvm? Download the latest LTS from https://nodejs.org, then re-run `npm install`.');
  console.error('');
  process.exit(1);
}
