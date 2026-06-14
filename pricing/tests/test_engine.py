from pricing import PriceEngine, LineItem


def _engine():
    return PriceEngine(tax_rate=0.10, free_shipping_threshold=250.0, flat_shipping=12.0)


def test_no_discount_below_first_tier():
    e = _engine()
    # subtotal 80 -> no discount, +10% tax, + flat shipping 12
    total = e.total([LineItem("a", 40.0, 2)])
    assert total == 80.0 * 1.10 + 12.0


def test_tiered_discount_and_free_shipping():
    e = _engine()
    # subtotal 300 -> 10% tier, free shipping (>=250)
    # tax is computed on merchandise value (300), discount applied after
    total = e.total([LineItem("a", 100.0, 3)])
    assert total == 300.0 * 0.90 + 300.0 * 0.10
