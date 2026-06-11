// Enrich a parsed line from its linked PR: area-* labels, breaking flag,
// short merge-commit SHA, author. Pure given an injected fetcher (no network
// here), so it's unit-testable. Degrades to empty enrichment when the PR can't
// be fetched (deleted PR, missing permissions, old repo) — callers still emit
// the entry, just without areas/commit.

/**
 * @typedef {{labels:string[], merge_commit_sha:string|null, user:string|null}} PrData
 * @typedef {(repo:string, num:number)=>Promise<PrData|null>} PrFetcher
 */

/**
 * @param {string} repo
 * @param {number} num
 * @param {PrFetcher} fetcher
 * @returns {Promise<{areas:string[], breaking:boolean, commit:string|null, author:string|null}>}
 */
async function enrichFromPr(repo, num, fetcher) {
  const pr = await fetcher(repo, num)
  if (!pr) return { areas: [], breaking: false, commit: null, author: null }
  const areas = (pr.labels || [])
    .filter((l) => l.startsWith('area-'))
    .map((l) => l.slice('area-'.length))
  const breaking = (pr.labels || []).some((l) => l.toLowerCase() === 'breaking change')
  const commit = pr.merge_commit_sha ? pr.merge_commit_sha.slice(0, 7) : null
  return { areas, breaking, commit, author: pr.user || null }
}

module.exports = { enrichFromPr }
