const { test } = require('node:test')
const assert = require('node:assert/strict')
const { classifyTitle, parseNewContributors } = require('./parse-release-body.cjs')

// --- classifyTitle -----------------------------------------------------------

test('classifies conventional-commit titles (type/scope/breaking)', () => {
  assert.deepEqual(classifyTitle('fix(tests): fix flaky tests'), {
    type: 'fix', scope: 'tests', breaking: false, title: 'fix flaky tests',
  })
  assert.deepEqual(classifyTitle('feat(gemini): plumb through cache tokens'), {
    type: 'feat', scope: 'gemini', breaking: false, title: 'plumb through cache tokens',
  })
  assert.deepEqual(classifyTitle('feat!: drop legacy run()'), {
    type: 'feat', scope: null, breaking: true, title: 'drop legacy run()',
  })
})

test('maps non-changelog conventional types (build/ci/style/revert) to other', () => {
  // KNOWN_TYPES is the changelog-visible subset; everything else collapses to 'other'.
  assert.equal(classifyTitle('ci: bump runner').type, 'other')
  assert.equal(classifyTitle('build(deps): bump uuid').type, 'other')
})

test('non-conventional title falls back to type other', () => {
  assert.deepEqual(classifyTitle('just did a thing'), {
    type: 'other', scope: null, breaking: false, title: 'just did a thing',
  })
})

test('strips the "_(shared with TS/Python)_" cross-SDK annotation from the title', () => {
  assert.equal(classifyTitle('feat: add memory injection _(shared with TS)_').title, 'add memory injection')
})

// --- parseNewContributors ----------------------------------------------------

const nc = `## What's Changed
* feat: real change by @dev in https://github.com/o/r/pull/1

## New Contributors
* @senthilkumarmohan made their first contribution in https://github.com/strands-agents/harness-sdk/pull/2623
* @ianholtz made their first contribution in https://github.com/strands-agents/harness-sdk/pull/2651

**Full Changelog**: https://github.com/o/r/compare/a...b`

test('extracts structured logins + prs + prRepo', () => {
  assert.deepEqual(parseNewContributors(nc), [
    { login: 'senthilkumarmohan', pr: 2623, prRepo: 'strands-agents/harness-sdk' },
    { login: 'ianholtz', pr: 2651, prRepo: 'strands-agents/harness-sdk' },
  ])
})

test('empty/undefined body yields no contributors', () => {
  assert.deepEqual(parseNewContributors(''), [])
  assert.deepEqual(parseNewContributors(null), [])
})

test('captures bracket-suffixed bot logins (e.g. dependabot[bot])', () => {
  const body = '* @dependabot[bot] made their first contribution in https://github.com/o/r/pull/625'
  assert.deepEqual(parseNewContributors(body), [{ login: 'dependabot[bot]', pr: 625, prRepo: 'o/r' }])
})

test('handles CRLF line endings (real GitHub bodies)', () => {
  const crlf = '## New Contributors\r\n* @dev made their first contribution in https://github.com/o/r/pull/7\r\n'
  assert.deepEqual(parseNewContributors(crlf), [{ login: 'dev', pr: 7, prRepo: 'o/r' }])
})

test('ignores non-contributor bullets (regular "What\'s Changed" entries)', () => {
  // Only first-contribution lines are captured; entry bullets are derived from
  // the compare API, not this parser.
  assert.deepEqual(parseNewContributors("* feat: real change by @dev in https://github.com/o/r/pull/1"), [])
})
