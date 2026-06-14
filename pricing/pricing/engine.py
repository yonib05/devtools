"""Order pricing engine: subtotals, discounts, tax, shipping."""
from dataclasses import dataclass


@dataclass
class LineItem:
    sku: str
    unit_price: float
    quantity: int


# Tiered volume discount: spend >= threshold -> percent off the subtotal.
# Tiers are evaluated high-to-low; the first matching threshold wins.
_DISCOUNT_TIERS = [
    (500.0, 0.15),
    (200.0, 0.10),
    (100.0, 0.05),
]


def _subtotal(items: list[LineItem]) -> float:
    return sum(i.unit_price * i.quantity for i in items)


def _volume_discount_rate(subtotal: float) -> float:
    for threshold, rate in _DISCOUNT_TIERS:
        if subtotal >= threshold:
            return rate
    return 0.0


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
        tax = discounted * self.tax_rate
        shipping = 0.0 if subtotal >= self.free_shipping_threshold else self.flat_shipping
        return discounted + tax + shipping
