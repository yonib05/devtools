// Orchestrate one GitHub release into a rendered changelog file. Pure given
// injected deps (enrich + readExisting), so it's unit-testable without network.

const { tagToMeta, getPackageUrl } = require('./tag-meta.cjs')
const { parseNewContributors } = require('./parse-release-body.cjs')
const { renderMarkdown, mergePreserving } = require('./render-markdown.cjs')

function fileNameFor(sdk, language, version) {
  if (sdk === 'evals') return `evals/v${version}.md`
  return `harness/${language}-v${version}.md`
}

/**
 * @param {string} repo  the SOURCE repo the release belongs to
 * @param {{tag_name:string, published_at:string, html_url:string, body:string|null}} release
 * @param {{deriveEntries:(repo:string,release:object)=>Promise<{entries:Array,warning?:string}>, enrich:(prRepo:string,pr:number)=>Promise<{areas:string[],breaking:boolean,commit:string|null,author:string|null,languages:string[]|null,docsOnly:boolean}>, readExisting:(path:string)=>Promise<string|null>, skipExisting?:boolean}} deps
 * @returns {Promise<{path:string, contents:string, warning?:string}|null>}
 */
async function buildReleaseFile(repo, release, deps) {
  const meta = tagToMeta(repo, release.tag_name)
  if (!meta) return null

  const path = `site/src/content/changelog/${fileNameFor(meta.sdk, meta.language, meta.version)}`
  const existing = await deps.readExisting(path)

  // skipExisting (used by the daily cron backstop): only generate files for
  // releases that don't have one yet. Checked BEFORE enrichment so a skipped
  // release costs zero PR API calls, and existing files (possibly carrying
  // richer enrichment from when labels were fresher) are never regressed by a
  // rate-limited re-run. A full refresh is an explicit backfill dispatch.
  if (deps.skipExisting && existing) return null

  // Entries come from the GitHub compare API (every merged PR between the prior
  // tag and this one) — deterministic and independent of release-note format.
  // The release body is NOT parsed for entries; it's preserved as curated
  // narrative via mergePreserving below.
  const { entries: parsed, warning } = await deps.deriveEntries(repo, release)

  // Two gates apply to every entry:
  //
  // 1. Docs-only (ALL streams): a PR confined to docs/blog/website dirs never
  //    lines up with an SDK+language, so it's dropped everywhere — including
  //    pre-monorepo bare-`v` and evals, which are otherwise unfiltered. This
  //    keeps the changelog focused on SDK+language work (a blog-only PR or a
  //    pure docs change won't appear in any stream).
  // 2. Language (monorepo prefixed tags only): those releases list every merged
  //    PR regardless of language, so gate by which SDK dirs the PR touched —
  //    python stream keeps python-touching PRs, ts keeps ts-touching, both →
  //    both. Unknown file info → kept (degrade open).
  //
  //    CRUCIAL: only gate when the PR has a POSITIVE dir signal — i.e. it
  //    touches strands-py/ and/or strands-ts/. A PR with EMPTY languages
  //    (touches neither: root config/CI, or a pre-monorepo flat-layout PR whose
  //    code lived under src/ before the strands-py/ dir existed) must be KEPT,
  //    not dropped. Gating on empty languages would wrongly empty pre-monorepo
  //    releases whose tags were re-applied as python/v* in the monorepo.
  //    Pre-monorepo bare-`v` and evals are single-language: no language gate.
  const isMonorepoStream =
    meta.sdk === 'harness' &&
    (release.tag_name.startsWith('python/') || release.tag_name.startsWith('typescript/'))

  const entries = []
  for (const p of parsed) {
    const prRepo = p.prRepo || repo
    const enr = p.pr
      ? await deps.enrich(prRepo, p.pr)
      : { areas: [], breaking: false, commit: null, author: null, languages: null, docsOnly: false }
    if (enr.docsOnly) continue
    if (isMonorepoStream && Array.isArray(enr.languages) && enr.languages.length > 0 && !enr.languages.includes(meta.language)) {
      continue
    }
    const breaking = p.breaking || enr.breaking
    entries.push({
      type: breaking && p.type === 'other' ? 'breaking' : p.type,
      breaking,
      scope: p.scope,
      areas: enr.areas,
      title: p.title,
      pr: p.pr,
      prUrl: p.pr ? `https://github.com/${prRepo}/pull/${p.pr}` : null,
      commit: enr.commit,
      commitUrl: enr.commit ? `https://github.com/${prRepo}/commit/${enr.commit}` : null,
      author: enr.author || p.author,
    })
  }

  // New contributors gate. A docs-only first PR (blog/site/docs) is dropped on
  // every stream — same focus rule as entries; a blog-only contributor doesn't
  // belong in an SDK+language changelog. Beyond that, on monorepo streams we
  // language-gate, with one deliberate softness: a first PR that touches NO sdk
  // dir but isn't docs-only (e.g. ci) is still celebrated in BOTH streams, and
  // unknown file info is kept (people aren't noise). Pre-monorepo/evals streams
  // keep everyone who isn't docs-only.
  const rawContributors = parseNewContributors(release.body)
  const newContributors = []
  for (const c of rawContributors) {
    // Use the PR's own repo (mirrors the entries path) — first-contribution
    // links can point at the pre-monorepo repos.
    const prRepo = c.prRepo || repo
    const enr = await deps.enrich(prRepo, c.pr)
    if (enr.docsOnly) continue
    // Mirror the entries gate: only drop when the PR has a positive dir signal
    // for the OTHER language. Empty/unknown languages (no dir signal, or a
    // first PR touching only root/ci) are kept — people aren't noise.
    const langs = enr.languages
    if (isMonorepoStream && Array.isArray(langs) && langs.length > 0 && !langs.includes(meta.language)) {
      continue
    }
    newContributors.push(c)
  }

  const file = {
    sdk: meta.sdk,
    language: meta.language,
    version: meta.version,
    tag: release.tag_name,
    date: release.published_at.slice(0, 10),
    releaseUrl: release.html_url,
    packageUrl: getPackageUrl(meta.sdk, meta.language, meta.version),
    entries,
    newContributors,
  }

  const contents = existing ? mergePreserving(file, existing) : renderMarkdown(file)
  return warning ? { path, contents, warning } : { path, contents }
}

module.exports = { buildReleaseFile }
