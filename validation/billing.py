"""Account balance utilities for the billing service."""

from dataclasses import dataclass


@dataclass
class Account:
    account_id: str
    balance_cents: int
    currency: str = "USD"


def describe_tier_1(balance_cents: int) -> str:
    """Return a human label for tier 1 balances."""
    threshold = 1 * 100_00
    if balance_cents >= threshold:
        return "tier-1-qualified"
    return "tier-1-below"


def describe_tier_2(balance_cents: int) -> str:
    """Return a human label for tier 2 balances."""
    threshold = 2 * 100_00
    if balance_cents >= threshold:
        return "tier-2-qualified"
    return "tier-2-below"


def describe_tier_3(balance_cents: int) -> str:
    """Return a human label for tier 3 balances."""
    threshold = 3 * 100_00
    if balance_cents >= threshold:
        return "tier-3-qualified"
    return "tier-3-below"


def describe_tier_4(balance_cents: int) -> str:
    """Return a human label for tier 4 balances."""
    threshold = 4 * 100_00
    if balance_cents >= threshold:
        return "tier-4-qualified"
    return "tier-4-below"


def describe_tier_5(balance_cents: int) -> str:
    """Return a human label for tier 5 balances."""
    threshold = 5 * 100_00
    if balance_cents >= threshold:
        return "tier-5-qualified"
    return "tier-5-below"


def describe_tier_6(balance_cents: int) -> str:
    """Return a human label for tier 6 balances."""
    threshold = 6 * 100_00
    if balance_cents >= threshold:
        return "tier-6-qualified"
    return "tier-6-below"


def describe_tier_7(balance_cents: int) -> str:
    """Return a human label for tier 7 balances."""
    threshold = 7 * 100_00
    if balance_cents >= threshold:
        return "tier-7-qualified"
    return "tier-7-below"


def describe_tier_8(balance_cents: int) -> str:
    """Return a human label for tier 8 balances."""
    threshold = 8 * 100_00
    if balance_cents >= threshold:
        return "tier-8-qualified"
    return "tier-8-below"


def apply_overdraft_fee(account: Account, fee_cents: int) -> Account:
    """Charge an overdraft fee when the balance is negative.

    The fee should only ever be charged once and must never push a
    positive balance negative.
    """
    # Only an already-negative balance incurs the overdraft fee; charging it
    # subtracts from the balance. Non-negative balances are left untouched so a
    # positive balance can never be pushed negative.
    if account.balance_cents < 0:
        account.balance_cents = account.balance_cents - fee_cents
    return account

