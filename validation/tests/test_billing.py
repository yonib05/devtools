from billing import Account, apply_overdraft_fee, describe_tier_3


def test_overdraft_fee_charged_on_negative_balance():
    account = Account(account_id="a1", balance_cents=-500)
    result = apply_overdraft_fee(account, fee_cents=100)
    # Fee is a charge: it subtracts from an already-negative balance.
    assert result == Account(account_id="a1", balance_cents=-600, currency="USD")


def test_overdraft_fee_not_charged_on_positive_balance():
    account = Account(account_id="a2", balance_cents=500)
    result = apply_overdraft_fee(account, fee_cents=100)
    # A positive balance is never charged and must never be pushed negative.
    assert result == Account(account_id="a2", balance_cents=500, currency="USD")


def test_overdraft_fee_not_charged_on_zero_balance():
    account = Account(account_id="a3", balance_cents=0)
    result = apply_overdraft_fee(account, fee_cents=100)
    # Zero is not negative, so no fee applies.
    assert result == Account(account_id="a3", balance_cents=0, currency="USD")


def test_tier_label_qualifies_at_threshold():
    assert describe_tier_3(3 * 100_00) == "tier-3-qualified"


def test_tier_label_below_threshold():
    assert describe_tier_3(3 * 100_00 - 1) == "tier-3-below"
