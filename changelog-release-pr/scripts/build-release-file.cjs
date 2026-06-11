// Orchestrate one GitHub release into a rendered changelog file. Pure given
// injected deps (enrich + readExisting), so it's unit-testable without network.

const { tagToMeta, getPackageUrl } = require('./tag-meta.cjs')
const { parseReleaseBody, countChangelogBullets } = require('./parse-release-body.cjs')
const { renderMarkdown, mergePreserving } = require('./render-markdown.cjs')

function fileNameFor(sdk, language, version) {
  if (sdk === 'evals') return `evals/v${version}.md`
  return `harness/${language}-v${version}.md`
}

/**
 * @param {string} repo  the SOURCE repo the release belongs to
 * @param {{tag_name:string, published_at:string, html_url:string, body:string|null}} release
 * @param {{enrich:(prRepo:string,pr:number)=>Promise<{areas:string[],breaking:boolean,commit:string|null,author:string|null}>, readExisting:(path:string)=>Promise<string|null>}} deps
 * @returns {Promise<{path:string, contents:string, warning?:string}|null>}
 */
async function buildReleaseFile(repo, release, deps) {
  const meta = tagToMeta(repo, release.tag_name)
  if (!meta) return null

  const parsed = parseReleaseBody(release.body)

  // Format-drift guard: if the body clearly has changelog bullets but few/none
  // parsed, the format likely changed (or notes are hand-written). Don't fail —
  // emit the file (still links the release) and attach a warning for the PR.
  const bullets = countChangelogBullets(release.body)
  const warning =
    bullets >= 3 && parsed.length < bullets * 0.8
      ? `${release.tag_name}: parsed ${parsed.length} of ${bullets} changelog bullets — release-note format may have changed; review before merge.`
      : undefined

  const entries = []
  for (const p of parsed) {
    const prRepo = p.prRepo || repo
    const enr = p.pr
      ? await deps.enrich(prRepo, p.pr)
      : { areas: [], breaking: false, commit: null, author: null }
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

  const file = {
    sdk: meta.sdk,
    language: meta.language,
    version: meta.version,
    tag: release.tag_name,
    date: release.published_at.slice(0, 10),
    releaseUrl: release.html_url,
    packageUrl: getPackageUrl(meta.sdk, meta.language, meta.version),
    entries,
  }

  const path = `site/src/content/changelog/${fileNameFor(meta.sdk, meta.language, meta.version)}`
  const existing = await deps.readExisting(path)
  const contents = existing ? mergePreserving(file, existing) : renderMarkdown(file)
  return warning ? { path, contents, warning } : { path, contents }
}

module.exports = { buildReleaseFile }
