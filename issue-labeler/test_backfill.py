from backfill import decide_label


def test_decide_label_reuses_existing_without_classifying():
    def classify_fn():
        raise AssertionError("must not classify when a label already exists")
    assert decide_label(["bug", "area-tool"], {"bug", "enhancement"}, classify_fn) == "bug"


def test_decide_label_classifies_when_missing():
    assert decide_label(["area-tool"], {"bug", "enhancement"}, lambda: ["enhancement"]) == "enhancement"


def test_decide_label_none_when_classify_empty():
    assert decide_label([], {"bug"}, lambda: []) is None
