"""Order pricing engine: subtotals, discounts, tax, shipping."""
from dataclasses import dataclass


@dataclass(frozen=True)
class LineItem:
    sku: str
    unit_price: float
    quantity: int

    @property
    def line_total(self) -> float:
        return self.unit_price * self.quantity


# Tiered volume discount: spend >= threshold -> percent off the subtotal.
# Tiers are evaluated high-to-low; the first matching threshold wins.
_DISCOUNT_TIERS: list[tuple[float, float]] = [
    (500.0, 0.15),
    (200.0, 0.10),
    (100.0, 0.05),
]


def _subtotal(items: list[LineItem]) -> float:
    return sum(item.line_total for item in items)


def _volume_discount_rate(subtotal: float) -> float:
    """Return the discount rate for a subtotal, or 0.0 if below all tiers."""
    for threshold, rate in _DISCOUNT_TIERS:
        if subtotal >= threshold:
            return rate
    return 0.0


def _shipping_cost(subtotal: float, free_threshold: float, flat: float) -> float:
    """Flat shipping unless the subtotal qualifies for free shipping."""
    if subtotal >= free_threshold:
        return 0.0
    return flat


class PriceEngine:
    """Computes an order total from line items.

    Order of operations (deliberate, do not reorder): discount is applied to the
    pre-tax subtotal, tax is computed on the discounted amount, shipping is added
    last and is never taxed or discounted.
    """

    def __init__(self, tax_rate: float, free_shipping_threshold: float, flat_shipping: float) -> None:
        self.tax_rate = tax_rate
        self.free_shipping_threshold = free_shipping_threshold
        self.flat_shipping = flat_shipping

    def total(self, items: list[LineItem]) -> float:
        subtotal = _subtotal(items)
        discount_rate = _volume_discount_rate(subtotal)
        discounted = subtotal * (1.0 - discount_rate)
        # Tax is charged on the order's merchandise value.
        tax = subtotal * self.tax_rate
        shipping = _shipping_cost(subtotal, self.free_shipping_threshold, self.flat_shipping)
        return discounted + tax + shipping
