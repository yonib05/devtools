"""Tests for github_tools PR helpers."""
from unittest.mock import patch

from .. import github_tools


def test_get_pr_files_inlines_full_diff_under_budget():
    """A large patch (well over the old 50-line cap) is inlined in full."""
    big_patch = "\n".join(f"+line {i}" for i in range(120))
    files = [{
        "filename": "a.py", "status": "modified",
        "additions": 120, "deletions": 0, "changes": 120, "patch": big_patch,
    }]

    with patch.object(github_tools, "_github_request", lambda *a, **k: files):
        out = github_tools.get_pr_files(1, repo="o/r")

    assert "truncated" not in out
    assert "line 0" in out
    assert "line 119" in out  # tail of the diff is present, not cut at 50


def test_get_pr_files_lists_overflow_for_on_demand_fetch():
    """When the total diff blows the budget, the file is listed, not silently cut."""
    huge = "\n".join(f"+x{i}" for i in range(50000))
    files = [{
        "filename": "big.py", "status": "modified",
        "additions": 50000, "deletions": 0, "changes": 50000, "patch": huge,
    }]

    with patch.object(github_tools, "_github_request", lambda *a, **k: files):
        out = github_tools.get_pr_files(1, repo="o/r")

    assert "big.py" in out
    assert "omitted" in out.lower()
    assert "fetch" in out.lower()


def test_get_pr_files_inlines_head_of_over_budget_file():
    """A single over-budget file still shows a head slice, not zero diff."""
    huge = "\n".join(f"+line{i}" for i in range(50000))
    files = [{
        "filename": "big.py", "status": "modified",
        "additions": 50000, "deletions": 0, "changes": 50000, "patch": huge,
    }]

    with patch.object(github_tools, "_github_request", lambda *a, **k: files):
        out = github_tools.get_pr_files(1, repo="o/r")

    assert "Diff (head only):" in out
    assert "+line0" in out  # head content present
    assert "more chars omitted" in out
    assert "partially shown" in out


def test_get_pr_files_mixed_inline_and_overflow():
    """Earlier files are inlined in full while a later large file overflows."""
    small = "\n".join(f"+s{i}" for i in range(5))
    huge = "\n".join(f"+h{i}" for i in range(50000))
    files = [
        {"filename": "small.py", "status": "modified", "additions": 5,
         "deletions": 0, "changes": 5, "patch": small},
        {"filename": "huge.py", "status": "modified", "additions": 50000,
         "deletions": 0, "changes": 50000, "patch": huge},
    ]

    with patch.object(github_tools, "_github_request", lambda *a, **k: files):
        out = github_tools.get_pr_files(1, repo="o/r")

    assert "+s4" in out  # small file fully inlined
    assert "huge.py" in out
    assert "huge.py" in out.split("Some diffs were omitted")[1]  # listed in overflow


def test_get_pr_files_handles_binary_file():
    """Files without a patch (binary) are reported, not crashed on."""
    files = [{
        "filename": "logo.png", "status": "added",
        "additions": 0, "deletions": 0, "changes": 0,
    }]

    with patch.object(github_tools, "_github_request", lambda *a, **k: files):
        out = github_tools.get_pr_files(1, repo="o/r")

    assert "logo.png" in out
    assert "Binary file or no diff available" in out
