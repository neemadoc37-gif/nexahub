"""Isolated test fixtures only: never create Supabase users or transactions."""

import os
import unittest
from unittest.mock import patch

from marketplace.api import MarketplaceAPI
from marketplace.rules import allocate_commission, validate_transition
from marketplace.supabase_client import ApiError


USER = "11111111-1111-4111-8111-111111111111"
OTHER = "22222222-2222-4222-8222-222222222222"
ORDER = "33333333-3333-4333-8333-333333333333"
SELLER = "44444444-4444-4444-8444-444444444444"
AUTH = "Bearer header.payload.signature"


class FixtureClient:
    def __init__(self, results=None):
        self.results = results or {}
        self.calls = []

    def get(self, path, token=None, params=None):
        self.calls.append((path, token, params))
        if path == "/auth/v1/user":
            return {"id": USER, "user_metadata": {"role": "admin"}}
        return self.results.get(path, [])


class APITests(unittest.TestCase):
    def api_error(self, api, method, route, status, code, auth=AUTH, body=None):
        with self.assertRaises(ApiError) as raised:
            api.dispatch(method, route, auth, body)
        self.assertEqual(raised.exception.status, status)
        self.assertEqual(raised.exception.code, code)

    def test_missing_and_malformed_auth_never_query_private_tables(self):
        for auth in (None, "Bearer invalid", "Basic header.payload.signature"):
            client = FixtureClient()
            api = MarketplaceAPI(client)
            with self.assertRaises(ApiError):
                api.dispatch("GET", "/api/customer/orders", auth)
            self.assertEqual(client.calls, [])

    def test_customer_scope_is_derived_from_verified_auth_not_url(self):
        client = FixtureClient({"/rest/v1/orders": [{"id": ORDER, "customer_id": USER, "status": "pending"}]})
        result = MarketplaceAPI(client).dispatch("GET", "/api/customer/orders?customer_id=" + OTHER, AUTH)
        self.assertEqual(result["orders"][0]["id"], ORDER)
        self.assertEqual(client.calls[-1][2]["customer_id"], "eq." + USER)
        self.assertEqual(client.calls[-1][1], AUTH[7:])

    def test_upstream_ownership_mismatch_fails_closed(self):
        client = FixtureClient({"/rest/v1/orders": [{"id": ORDER, "customer_id": OTHER}]})
        self.api_error(MarketplaceAPI(client), "GET", "/api/customer/orders", 502, "ownership_check_failed")

    def test_foreign_order_is_not_exposed(self):
        client = FixtureClient()
        self.api_error(MarketplaceAPI(client), "GET", "/api/customer/orders/" + ORDER, 404, "order_not_found")
        self.assertFalse(any(call[0] == "/rest/v1/order_items" for call in client.calls))

    def test_items_load_only_after_owned_parent_order(self):
        client = FixtureClient({
            "/rest/v1/orders": [{"id": ORDER, "customer_id": USER}],
            "/rest/v1/order_items": [{"id": OTHER, "order_id": ORDER}],
        })
        MarketplaceAPI(client).dispatch("GET", "/api/customer/orders/" + ORDER, AUTH)
        self.assertEqual(client.calls[-1][2]["order_id"], "eq." + ORDER)

    def test_seller_rows_are_scoped_to_verified_profile(self):
        client = FixtureClient({"/rest/v1/seller_profiles": [{"id": SELLER, "user_id": USER, "status": "pending"}]})
        result = MarketplaceAPI(client).dispatch("GET", "/api/seller", AUTH)
        self.assertFalse(result["accounting_enabled"])
        for table, token, params in client.calls:
            if table in ("/rest/v1/products", "/rest/v1/order_items"):
                self.assertEqual(params["seller_id"], "eq." + SELLER)

    def test_customer_payment_rows_cannot_escape_owned_orders(self):
        client = FixtureClient({
            "/rest/v1/orders": [{"id": ORDER, "customer_id": USER}],
            "/rest/v1/payment_transactions": [{"id": SELLER, "order_id": OTHER}],
        })
        self.api_error(MarketplaceAPI(client), "GET", "/api/customer/payments", 502, "ownership_check_failed")

    @patch.dict(os.environ, {"NEXAHUB_ADMIN_USER_IDS": ""})
    def test_user_editable_admin_metadata_does_not_authorize(self):
        client = FixtureClient()
        self.api_error(MarketplaceAPI(client), "GET", "/api/admin?role=admin", 403, "owner_access_required")
        self.assertEqual(len(client.calls), 1)
        self.api_error(MarketplaceAPI(client), "POST", "/api/admin/actions", 403, "owner_access_required", body={"role": "admin"})

    @patch.dict(os.environ, {"NEXAHUB_ADMIN_USER_IDS": USER})
    def test_owner_admin_writes_still_cannot_enable_payouts(self):
        client = FixtureClient()
        self.api_error(MarketplaceAPI(client), "POST", "/api/admin/actions", 503, "admin_writes_disabled", body={"action": "pay"})
        self.assertEqual([c[0] for c in client.calls], ["/auth/v1/user"])

    def test_published_catalog_is_explicitly_filtered(self):
        client = FixtureClient({"/rest/v1/products": [{"id": ORDER, "status": "published", "title": "Real listing"}]})
        result = MarketplaceAPI(client).dispatch("GET", "/api/catalog?q=listing")
        self.assertEqual(len(result["products"]), 1)
        self.assertEqual(client.calls[0][2]["status"], "eq.published")
        client.results["/rest/v1/products"][0]["status"] = "draft"
        self.api_error(MarketplaceAPI(client), "GET", "/api/catalog", 502, "publication_check_failed")

    def test_no_stk_or_callback_can_settle_payment(self):
        client = FixtureClient({"/rest/v1/orders": [{"id": ORDER, "customer_id": USER}]})
        api = MarketplaceAPI(client)
        self.api_error(api, "POST", "/api/payments/mpesa/stk", 503, "payments_disabled",
                       body={"order_id": ORDER, "phone": "0712345678", "amount": 1, "paid": True})
        self.api_error(api, "POST", "/api/payments/mpesa/callback", 503, "callbacks_disabled",
                       auth=None, body={"ResultCode": 0})
        self.assertTrue(all(call[0].startswith(("/rest/v1/", "/auth/v1/")) for call in client.calls))
        self.assertFalse(api.dispatch("GET", "/api/readiness")["live_money_enabled"])

    def test_rider_application_validates_without_claiming_persistence(self):
        api = MarketplaceAPI(FixtureClient())
        body = {"full_name": "Test Fixture", "phone": "0712345678", "city": "Test Zone", "vehicle": "bicycle", "consent": True}
        self.api_error(api, "POST", "/api/riders/applications", 503, "rider_registration_not_configured", body=body)
        body["consent"] = False
        self.api_error(api, "POST", "/api/riders/applications", 400, "consent_required", body=body)

    def test_delivery_tracking_checks_order_first(self):
        self.api_error(MarketplaceAPI(FixtureClient()), "GET",
                       "/api/deliveries/track?order_id=" + ORDER, 404, "order_not_found")
        client = FixtureClient({"/rest/v1/orders": [{"id": ORDER, "customer_id": USER}]})
        self.api_error(MarketplaceAPI(client), "GET", "/api/deliveries/track?order_id=" + ORDER, 503, "delivery_not_configured")

    def test_unknown_routes_and_invalid_ids_rejected(self):
        self.api_error(MarketplaceAPI(FixtureClient()), "GET", "/api/unknown", 404, "route_not_found")
        self.api_error(MarketplaceAPI(FixtureClient()), "GET", "/api/customer/orders/not-a-uuid", 400, "invalid_identifier")


class ObjectIdentityTests(unittest.TestCase):
    def test_owned_but_wrong_order_is_not_used_for_payment_or_tracking(self):
        client = FixtureClient({"/rest/v1/orders": [{"id": OTHER, "customer_id": USER}]})
        api = MarketplaceAPI(client)
        for method, route, body in [
            ("GET", "/api/customer/orders/" + ORDER, None),
            ("GET", "/api/deliveries/track?order_id=" + ORDER, None),
            ("POST", "/api/payments/mpesa/stk", {"order_id": ORDER, "phone": "0712345678"}),
        ]:
            with self.assertRaises(ApiError) as raised:
                api.dispatch(method, route, AUTH, body)
            self.assertEqual(raised.exception.code, "order_identity_check_failed")

    def test_published_but_wrong_product_is_not_returned_as_requested_product(self):
        client = FixtureClient({"/rest/v1/products": [{"id": OTHER, "status": "published"}]})
        with self.assertRaises(ApiError) as raised:
            MarketplaceAPI(client).dispatch("GET", "/api/catalog/" + ORDER)
        self.assertEqual(raised.exception.code, "product_identity_check_failed")


class RuleTests(unittest.TestCase):
    def test_commission_conservation_and_explicit_rounding(self):
        self.assertEqual(allocate_commission(10001, 1000), {"gross_minor": 10001, "commission_minor": 1000, "earnings_minor": 9001})
        self.assertEqual(allocate_commission(5, 1000)["commission_minor"], 1)
        for amount in (0, 1, 99, 10000, 999999):
            for rate in (0, 1, 500, 10000):
                result = allocate_commission(amount, rate)
                self.assertEqual(result["commission_minor"] + result["earnings_minor"], amount)

    def test_unapproved_or_invalid_numeric_values_rejected(self):
        for amount, rate in ((-1, 1000), (1, None), (True, 500), (1, 10001), (1.5, 500)):
            with self.assertRaises(ValueError):
                allocate_commission(amount, rate)

    def test_delivery_cannot_skip_steps_or_confirm_without_otp(self):
        with self.assertRaises(ValueError):
            validate_transition("Pending", "Delivered", actor="assigned_rider", otp_verified=True)
        with self.assertRaises(ValueError):
            validate_transition("In Transit", "Delivered", actor="assigned_rider")
        self.assertEqual(validate_transition("In Transit", "Delivered", actor="assigned_rider", otp_verified=True), "Delivered")
        with self.assertRaises(ValueError):
            validate_transition("Picked Up", "Cancelled", actor="admin")
        with self.assertRaises(ValueError):
            validate_transition("Pending", "Accepted", actor="customer")


if __name__ == "__main__":
    unittest.main()
