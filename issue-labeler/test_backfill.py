import sys

import backfill
import pytest

from backfill import check_native_coverage, decide_label


def test_decide_label_reuses_existing_without_classifying():
    def classify_fn():
        raise AssertionError("must not classify when a label already exists")
    label, classified = decide_label(
        ["bug", "area-tool"], {"bug", "enhancement"}, {"bug": "Bug"}, classify_fn)
    assert label == "bug"
    assert classified is False


def test_decide_label_prefers_mapped_label_over_unmapped():
    def classify_fn():
        raise AssertionError("must not classify when a label already exists")
    # `question` is allowlisted but unmapped; it must not shadow `bug`.
    label, classified = decide_label(
        ["question", "bug"], {"question", "bug"}, {"bug": "Bug"}, classify_fn)
    assert label == "bug"
    assert classified is False


def test_decide_label_classifies_when_missing():
    label, classified = decide_label(
        ["area-tool"], {"bug", "enhancement"}, {"bug": "Bug"}, lambda: ["enhancement"])
    assert label == "enhancement"
    assert classified is True


def test_decide_label_none_when_classify_empty():
    label, classified = decide_label([], {"bug"}, {"bug": "Bug"}, lambda: [])
    assert label is None
    assert classified is True


def test_check_native_coverage_reports_missing_names():
    native = {"types": {"bug": "IT_bug"}, "fields": {}}
    problems = check_native_coverage(
        native,
        {"bug": "Bug", "enhancement": "Feature"},
        {"name": "Language", "option_map": {"python": "Python"}},
    )
    assert any("Feature" in p for p in problems)
    assert any("Language" in p for p in problems)


def test_check_native_coverage_ok_when_all_resolve():
    native = {
        "types": {"bug": "IT_bug"},
        "fields": {"language": {"id": "IFSS", "options": {"python": "OPT_py"}}},
    }
    assert check_native_coverage(
        native, {"bug": "Bug"},
        {"name": "Language", "option_map": {"python": "Python"}},
    ) == []


def _run_main(monkeypatch, tmp_path, argv_extra, issues, native):
    cfg = tmp_path / "type.yml"
    cfg.write_text('labels:\n  bug:\n    description: "broken"\n    type: Bug\n')
    monkeypatch.setattr(sys, "argv",
                        ["backfill.py", "--repo", "o/r", "--type-config", str(cfg)] + argv_extra)
    monkeypatch.setattr(backfill, "list_issues", lambda repo, state: issues)
    monkeypatch.setattr(backfill, "resolve_native_ids", lambda repo: native)
    backfill.main()


_NATIVE = {"types": {"bug": "IT_bug"}, "fields": {}}


def test_dry_run_does_not_mutate(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(backfill, "apply_native_targets",
                        lambda *a, **k: pytest.fail("must not mutate in dry-run"))
    monkeypatch.setattr(backfill, "apply_labels",
                        lambda *a, **k: pytest.fail("must not label in dry-run"))
    _run_main(monkeypatch, tmp_path, ["--dry-run"],
              [{"id": "N1", "number": 1, "title": "t", "body": "b", "label_names": ["bug"]}],
              _NATIVE)
    out = capsys.readouterr().out
    assert "#1: would apply" in out
    assert "type=Bug" in out


def test_aborts_before_llm_when_native_names_missing(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(backfill, "classify_issue",
                        lambda *a, **k: pytest.fail("must not burn LLM calls when IDs are unresolvable"))
    with pytest.raises(SystemExit) as excinfo:
        _run_main(monkeypatch, tmp_path, [],
                  [{"id": "N1", "number": 1, "title": "t", "body": "b", "label_names": []}],
                  {"types": {}, "fields": {}})
    assert excinfo.value.code == 1
    assert "::error::" in capsys.readouterr().out


def test_applied_summary_reflects_mutation_result(monkeypatch, tmp_path, capsys):
    monkeypatch.setattr(backfill, "apply_native_targets", lambda *a, **k: False)
    with pytest.raises(SystemExit) as excinfo:
        _run_main(monkeypatch, tmp_path, [],
                  [{"id": "N1", "number": 1, "title": "t", "body": "b", "label_names": ["bug"]}],
                  _NATIVE)
    assert excinfo.value.code == 1
    out = capsys.readouterr().out
    assert "#1: FAILED" in out
    assert "#1: applied" not in out


def test_classified_labels_are_written_back(monkeypatch, tmp_path, capsys):
    labeled = {}
    monkeypatch.setattr(backfill, "classify_issue", lambda *a, **k: ["bug"])
    monkeypatch.setattr(backfill, "apply_labels",
                        lambda number, labels, repo: labeled.__setitem__(number, labels) or True)
    monkeypatch.setattr(backfill, "apply_native_targets", lambda *a, **k: True)
    _run_main(monkeypatch, tmp_path, [],
              [{"id": "N1", "number": 1, "title": "t", "body": "b", "label_names": []}],
              _NATIVE)
    assert labeled == {"1": ["bug"]}
    assert "#1: applied" in capsys.readouterr().out


def test_existing_labels_are_not_rewritten(monkeypatch, tmp_path):
    monkeypatch.setattr(backfill, "classify_issue",
                        lambda *a, **k: pytest.fail("must not classify a labeled issue"))
    monkeypatch.setattr(backfill, "apply_labels",
                        lambda *a, **k: pytest.fail("must not re-apply an existing label"))
    monkeypatch.setattr(backfill, "apply_native_targets", lambda *a, **k: True)
    _run_main(monkeypatch, tmp_path, [],
              [{"id": "N1", "number": 1, "title": "t", "body": "b", "label_names": ["bug"]}],
              _NATIVE)


def test_node_id_from_listing_is_passed_through(monkeypatch, tmp_path):
    seen = {}

    def fake_apply(number, repo, labels, type_map, field_config, *, native=None, node_id=None):
        seen["node_id"] = node_id
        return True

    monkeypatch.setattr(backfill, "apply_native_targets", fake_apply)
    _run_main(monkeypatch, tmp_path, [],
              [{"id": "N1", "number": 1, "title": "t", "body": "b", "label_names": ["bug"]}],
              _NATIVE)
    assert seen["node_id"] == "N1"
