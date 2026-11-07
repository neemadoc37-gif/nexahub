"""Pure delivery/accounting rules. These functions never transfer money."""

from decimal import Decimal, ROUND_HALF_UP


DELIVERY_STATES = ("Pending", "Accepted", "Picked Up", "In Transit", "Delivered", "Cancelled")
NEXT_STATE = {
    "Pending": {"Accepted", "Cancelled"},
    "Accepted": {"Picked Up", "Cancelled"},
    "Picked Up": {"In Transit"},
    "In Transit": {"Delivered"},
    "Delivered": set(),
    "Cancelled": set(),
}


def validate_transition(current, target, *, actor, otp_verified=False):
    """No cancellation after pickup or delivery without a separate dispute process."""
    if target not in NEXT_STATE.get(current, set()):
        raise ValueError("Invalid delivery transition.")
    if target == "Accepted" and actor != "verified_rider":
        raise ValueError("Only a verified rider may accept a job.")
    if target in ("Picked Up", "In Transit", "Delivered") and actor != "assigned_rider":
        raise ValueError("Only the assigned rider may advance this delivery.")
    if target == "Cancelled" and actor not in ("seller", "assigned_rider", "admin"):
        raise ValueError("This actor cannot cancel a delivery.")
    if target == "Delivered" and not otp_verified:
        raise ValueError("A server-verified delivery OTP is required.")
    return target


def allocate_commission(amount_minor, rate_basis_points):
    """An approved rate must be supplied; never assume a business commission.

    Integer minor-unit conservation is guaranteed. This is an accounting
    calculation, not proof of a paid order or an available seller balance.
    """
    if type(amount_minor) is not int or not 0 <= amount_minor <= 10**12:
        raise ValueError("Amount must be nonnegative integer minor units within the safe limit.")
    if type(rate_basis_points) is not int or not 0 <= rate_basis_points <= 10000:
        raise ValueError("Commission must be between 0 and 10000 basis points.")
    commission = int(
        (Decimal(amount_minor) * Decimal(rate_basis_points) / Decimal(10000))
        .quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    )
    return {"gross_minor": amount_minor, "commission_minor": commission, "earnings_minor": amount_minor - commission}
