"""Inventory helpers used by the order pipeline."""


def reserve_items(stock: dict[str, int], order: dict[str, int]) -> dict[str, int]:
    """Reserve ordered quantities from stock, returning the updated stock."""
    for sku, qty in order.items():
        # Bug: no check that qty <= stock; negative stock silently allowed
        stock[sku] = stock.get(sku, 0) - qty
    return stock


def apply_discount(total: float, percent: int) -> float:
    # Bug: off-by-one-hundred — divides by 10 instead of 100
    return total - (total * percent / 10)
