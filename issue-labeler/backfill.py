#!/usr/bin/env python3
"""One-time backfill of native issue type + language field on existing issues.

Reuses the classification logic from classify.py. For each issue:
- If it already carries a label from the relevant allowlist (e.g. `bug`,
  `python`), map directly from that label -- no LLM call.
- Otherwise classify the issue with the same config the action uses, and apply
  the classified label to the issue so re-runs reuse it instead of paying for
  another LLM call.

Run locally with `gh` authenticated and AWS credentials available for Bedrock.

Examples:
  python3 backfill.py --repo strands-agents/harness-sdk \\
    --type-config /path/to/type.yml --language-config /path/to/language.yml --dry-run
  python3 backfill.py --repo strands-agents/evals --type-config /path/to/type.yml
"""

import argparse
import json
import subprocess
import sys

from classify import (
    apply_labels,
    apply_native_targets,
    build_system_prompt,
    classify_issue,
    load_config,
    parse_field_config,
    parse_label_type_map,
    resolve_native_ids,
    sanitize,
    select_native_targets,
)

LIST_LIMIT = 10000


def decide_label(existing_labels, allowlist, mapping, classify_fn):
    """Pick the label that drives the native mapping for one dimension.

    Prefers an existing label that actually maps to a native target (an
    unmapped allowlisted label like `question` must not shadow a mapped one),
    then any allowlisted label (already classified, nothing to map), and only
    calls the LLM when the issue has no allowlisted label at all.

    Returns (label, classified) where classified is True when the label came
    from the LLM rather than an existing label.
    """
    for label in existing_labels:
        if label in mapping:
            return label, False
    for label in existing_labels:
        if label in allowlist:
            return label, False
    classified = classify_fn()
    return (classified[0] if classified else None), True


def list_issues(repo, state):
    """Return all issues (number, node id, title, body, label names) for the repo."""
    result = subprocess.run(
        ["gh", "issue", "list", "--repo", repo, "--state", state,
         "--limit", str(LIST_LIMIT), "--json", "id,number,title,body,labels"],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print(f"::error::Failed to list issues: {result.stderr}")
        sys.exit(1)
    issues = json.loads(result.stdout)
    if len(issues) >= LIST_LIMIT:
        print(f"::warning::Hit the {LIST_LIMIT}-issue list limit; issues beyond it were NOT fetched.")
    for issue in issues:
        issue["label_names"] = [lbl["name"] for lbl in issue.get("labels", [])]
    return issues


def check_native_coverage(native, type_map, field_config):
    """Fail fast when configured mappings cannot resolve to native IDs.

    Without this, a failed/underprivileged resolution burns an LLM call per
    issue and mutates nothing while the per-issue warnings scroll by.
    """
    problems = []
    if type_map:
        missing = sorted({t for t in type_map.values() if t.lower() not in native["types"]})
        if missing:
            problems.append(f"issue type(s) not found on repo: {', '.join(missing)}")
    if field_config:
        field = native["fields"].get(field_config["name"].lower())
        if field is None:
            problems.append(f"single-select field '{field_config['name']}' not found on repo")
        else:
            missing = sorted({o for o in field_config["option_map"].values()
                              if o.lower() not in field["options"]})
            if missing:
                problems.append(f"option(s) not on field '{field_config['name']}': {', '.join(missing)}")
    return problems


def main():
    parser = argparse.ArgumentParser(description="Backfill native issue type/field.")
    parser.add_argument("--repo", required=True, help="OWNER/NAME")
    parser.add_argument("--type-config", help="Path to type labeler config (sets native type).")
    parser.add_argument("--language-config", help="Path to language labeler config (sets field).")
    parser.add_argument("--state", choices=["all", "open", "closed"], default="all")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not args.type_config and not args.language_config:
        parser.error("at least one of --type-config / --language-config is required")

    # Load configs and derive the mappings + classification prompts.
    type_map = {}
    field_config = None
    dimensions = []  # (dimension_name, allowlist, mapping, prompt)
    if args.type_config:
        config = load_config(args.type_config)
        type_map = parse_label_type_map(config)
        dimensions.append(("type", frozenset(config["labels"].keys()), type_map,
                           build_system_prompt(config, max_labels=1)))
    if args.language_config:
        config = load_config(args.language_config)
        try:
            field_config = parse_field_config(config)
        except ValueError as e:
            print(f"::error::{e}")
            sys.exit(1)
        option_map = field_config["option_map"] if field_config else {}
        dimensions.append(("language", frozenset(config["labels"].keys()), option_map,
                           build_system_prompt(config, max_labels=1)))

    issues = list_issues(args.repo, args.state)
    print(f"Backfilling {len(issues)} issue(s) on {args.repo} (dry_run={args.dry_run})")

    # Resolve native type/field IDs once for the whole run (same for every
    # issue) and fail fast if the configured names don't resolve -- otherwise
    # every issue would burn an LLM call only to warn and mutate nothing.
    native = resolve_native_ids(args.repo)
    problems = check_native_coverage(native, type_map, field_config)
    if problems:
        for problem in problems:
            print(f"::error::{problem}")
        sys.exit(1)

    failed = []
    for issue in issues:
        number = str(issue["number"])
        title = sanitize(issue.get("title", ""), 200)
        body = sanitize(issue.get("body", ""), 1000)
        existing = issue["label_names"]

        # Determine the effective type/language labels (reuse or classify).
        effective_labels = []
        classified_labels = []
        for _, allowlist, mapping, prompt in dimensions:
            label, classified = decide_label(
                existing, allowlist, mapping,
                lambda: classify_issue(title, body, prompt, allowlist),
            )
            if label:
                effective_labels.append(label)
                if classified:
                    classified_labels.append(label)

        if not effective_labels:
            print(f"#{number}: no type/language signal, skipping")
            continue

        wanted_type, wanted_option = select_native_targets(effective_labels, type_map, field_config)

        if args.dry_run:
            print(f"#{number}: would apply labels={effective_labels} "
                  f"type={wanted_type} field={wanted_option}")
            continue

        # Apply freshly classified labels so the issue matches action-labeled
        # issues and re-runs reuse the label instead of re-classifying.
        ok = True
        if classified_labels:
            ok = apply_labels(number, classified_labels, args.repo)
        ok = apply_native_targets(
            number, args.repo, effective_labels, type_map, field_config,
            native=native, node_id=issue.get("id"),
        ) and ok

        if ok:
            print(f"#{number}: applied labels={effective_labels} "
                  f"type={wanted_type} field={wanted_option}")
        else:
            failed.append(number)
            print(f"#{number}: FAILED (see warnings above)")

    if failed:
        print(f"::error::{len(failed)} issue(s) failed: {', '.join(failed)}")
        sys.exit(1)


if __name__ == "__main__":
    main()
