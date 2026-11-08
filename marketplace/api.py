"""Verified, ownership-scoped reads and explicitly disabled unconfigured writes."""

import os
import re
from urllib.parse import parse_qs, urlsplit
from uuid import UUID

from .supabase_client import ApiError, SupabaseClient


PRODUCT_FIELDS = "id,title,description,listing_type,price,currency,image_url,category_id,seller_id,status"
ORDER_FIELDS = "id,order_number,status,total_amount,currency,created_at"
ITEM_FIELDS = "id,order_id,seller_id,product_id,quantity,unit_price"
SELLER_FIELDS = "id,user_id,store_name,description,status,created_at"
PAYMENT_FIELDS = "id,order_id,customer_id,provider,provider_reference,amount,currency,status,created_at"
BOOKING_FIELDS = "id,product_id,seller_id,start_at,notes,status,created_at"
PROFILE_FIELDS = "id,display_name,phone,country_code,created_at"


def identifier(value):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise ApiError(400, "invalid_identifier", "Enter a valid order or record ID.") from None


def required_text(body, name, minimum=1, maximum=120):
    value = body.get(name)
    if not isinstance(value, str) or not minimum <= len(value.strip()) <= maximum:
        raise ApiError(400, "invalid_input", f"{name.replace('_', ' ').capitalize()} must be between {minimum} and {maximum} characters.")
    return value.strip()


def phone_number(body):
    value = re.sub(r"[\s()+-]", "", required_text(body, "phone", maximum=24))
    if value.startswith("0"):
        value = "254" + value[1:]
    if not re.fullmatch(r"254[17]\d{8}", value):
        raise ApiError(400, "invalid_phone", "Enter a valid Kenyan M-PESA mobile number.")
    return value


class MarketplaceAPI:
    def __init__(self, client=None):
        self.client = client or SupabaseClient()

    @staticmethod
    def owners():
        # Configured by trusted server environment only. Not user metadata.
        return {item.strip() for item in os.environ.get("NEXAHUB_ADMIN_USER_IDS", "").split(",") if item.strip()}

    def authenticate(self, authorization):
        if not authorization or not authorization.startswith("Bearer "):
            raise ApiError(401, "sign_in_required", "Sign in to access your private workspace.")
        token = authorization[7:]
        if len(token) > 8192 or not re.fullmatch(r"[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", token):
            raise ApiError(401, "invalid_session", "Your session is invalid. Please sign in again.")
        user = self.client.get("/auth/v1/user", token=token)
        if not isinstance(user, dict) or not user.get("id"):
            raise ApiError(401, "invalid_session", "Your session could not be verified.")
        return identifier(user["id"]), token

    def rows(self, table, fields, token=None, **filters):
        result = self.client.get("/rest/v1/" + table, token, {
            "select": fields, "limit": "50", **filters,
        })
        if not isinstance(result, list) or any(not isinstance(row, dict) for row in result):
            raise ApiError(502, "unexpected_response", "The database returned an unexpected response.")
        return result

    def owned(self, table, fields, owner_field, owner_id, token, **filters):
        selected = fields.split(",")
        checked_fields = fields if owner_field in selected else fields + "," + owner_field
        rows = self.rows(table, checked_fields, token, **{owner_field: "eq." + owner_id, **filters})
        if any(str(row.get(owner_field)) != owner_id for row in rows):
            raise ApiError(502, "ownership_check_failed", "The database ownership check failed. No records were returned.")
        return [{key: row.get(key) for key in selected} for row in rows]

    def order(self, order_id, user_id, token):
        requested_id = identifier(order_id)
        rows = self.owned("orders", ORDER_FIELDS, "customer_id", user_id, token, id="eq." + requested_id)
        if not rows:
            raise ApiError(404, "order_not_found", "This order is unavailable or does not belong to your account.")
        if len(rows) != 1 or str(rows[0].get("id")) != requested_id:
            raise ApiError(502, "order_identity_check_failed", "The requested order could not be matched safely. No order was returned.")
        return rows[0]

    def seller(self, user_id, token):
        rows = self.owned("seller_profiles", SELLER_FIELDS, "user_id", user_id, token)
        if len(rows) > 1:
            raise ApiError(503, "seller_mapping_ambiguous", "More than one seller profile is linked to this account. Owner review is required.")
        return rows[0] if rows else None

    def require_owner(self, user_id):
        if user_id not in self.owners():
            raise ApiError(403, "owner_access_required", "Owner access must be provisioned on the server. No private admin records were loaded.")

    @staticmethod
    def blocked(code, message):
        raise ApiError(503, code, message)

    def dispatch(self, method, target, authorization=None, body=None):
        url = urlsplit(target)
        path, query = url.path.rstrip("/"), parse_qs(url.query)
        body = body if isinstance(body, dict) else {}
        if method == "GET" and path == "/api/health":
            return {"status": "ok", "scope": "application_process_only",
                    "checkout_enabled": False, "live_money_enabled": False}
        if method == "GET" and path == "/api/readiness":
            return {
                "payments": {"enabled": False, "reasons": [
                    "Daraja sandbox credentials, callback verification and real-order settlement are not configured.",
                    "Live collections and payouts are locked pending successful testing and explicit approval.",
                ]},
                "delivery": {"enabled": False, "reasons": [
                    "Existing delivery schema, access policies and OTP channel need verification and approval.",
                    "Delivery fee, rider commission and service-area policies are not configured.",
                ]},
                "rider_registration": {"enabled": False, "reasons": [
                    "Private verification storage and the rider application schema are not configured. Applications cannot be saved yet.",
                ]},
                "seller_writes": {"enabled": False, "reasons": [
                    "Seller application defaults, verification rules and write policies require inspection before saving.",
                ]},
                "admin": {"configured": bool(self.owners())},
                "live_money_enabled": False,
            }
        if method == "GET" and path == "/api/delivery/estimate":
            self.blocked("delivery_fees_not_configured", "Delivery areas, charges and commission rules require approval. No fee has been quoted.")
        if method == "GET" and path == "/api/businesses":
            products = self.rows("products", "id,seller_id,status",
                                 status="eq.published", order="created_at.desc")
            if any(row.get("status") != "published" for row in products):
                raise ApiError(502, "publication_check_failed", "Published business listings could not be verified.")
            seller_ids = {identifier(row["seller_id"]) for row in products}
            businesses = self.rows(
                "seller_profiles", "id,store_name,description,status",
                status="eq.approved", id="in.(" + ",".join(sorted(seller_ids)) + ")",
            ) if seller_ids else []
            if any(row.get("status") != "approved" or row.get("id") not in seller_ids for row in businesses):
                raise ApiError(502, "business_scope_check_failed", "Business approval checks failed. No businesses were returned.")
            return {"businesses": businesses, "limit": 50}
        if method == "GET" and (path == "/api/catalog" or path.startswith("/api/catalog/")):
            filters = {"status": "eq.published", "order": "created_at.desc"}
            if path != "/api/catalog":
                filters["id"] = "eq." + identifier(path.rsplit("/", 1)[1])
            else:
                category_unavailable = False
                q = query.get("q", [""])[0].strip()
                if len(q) > 120:
                    raise ApiError(400, "invalid_search", "Search must be 120 characters or fewer.")
                listing_type = query.get("listing_type", [""])[0].strip()
                if len(listing_type) > 80 or any(ord(c) < 32 for c in listing_type):
                    raise ApiError(400, "invalid_listing_type", "Choose a listing type of at most 80 characters.")
                category = query.get("category", [""])[0].strip()
                if category:
                    try:
                        category_id = identifier(category)
                    except ApiError:
                        if not re.fullmatch(r"[a-z0-9-]{1,80}", category):
                            raise ApiError(400, "invalid_category", "Choose a valid marketplace category.") from None
                        matches = self.rows("categories", "id,name,slug", slug="eq." + category)
                        if len(matches) > 1 or any(row.get("slug") != category for row in matches):
                            raise ApiError(502, "category_mapping_ambiguous", "The category could not be matched safely.")
                        category_id = identifier(matches[0]["id"]) if matches else None
                        category_unavailable = category_id is None
                    if category_id:
                        filters["category_id"] = "eq." + category_id
                seller_id = query.get("seller", [""])[0].strip()
                if seller_id:
                    filters["seller_id"] = "eq." + identifier(seller_id)
                if listing_type:
                    filters["listing_type"] = "eq." + listing_type
            products = [] if path == "/api/catalog" and category_unavailable else self.rows("products", PRODUCT_FIELDS, **filters)
            # Defense in depth: do not return drafts even if upstream filters fail.
            if any(row.get("status") != "published" for row in products):
                raise ApiError(502, "publication_check_failed", "Publication checks failed. No catalog records were returned.")
            if any(
                (filters.get("category_id") and row.get("category_id") != filters["category_id"][3:])
                or (filters.get("listing_type") and row.get("listing_type") != filters["listing_type"][3:])
                or (filters.get("seller_id") and row.get("seller_id") != filters["seller_id"][3:])
                for row in products
            ):
                raise ApiError(502, "catalog_filter_check_failed", "Catalog filters could not be verified. No listings were returned.")
            if path != "/api/catalog":
                if not products:
                    raise ApiError(404, "product_not_found", "This published product is unavailable.")
                if len(products) != 1 or str(products[0].get("id")) != filters["id"][3:]:
                    raise ApiError(502, "product_identity_check_failed", "The requested product could not be matched safely.")
                return {"product": products[0]}
            if q:
                products = [p for p in products if q.casefold() in str(p.get("title", "")).casefold()]
            return {"products": products, "categories": self.rows("categories", "id,name,slug"), "limit": 50,
                    "selected_category_id": filters.get("category_id", "")[3:] or None,
                    "category_unavailable": category_unavailable}
        if method == "POST" and path == "/api/payments/mpesa/callback":
            self.blocked("callbacks_disabled", "Payment callbacks are not configured. No payment state was changed.")

        known_get = {"/api/account/access", "/api/customer/profile", "/api/customer/orders", "/api/customer/bookings", "/api/customer/payments",
                     "/api/seller", "/api/rider", "/api/admin", "/api/deliveries/track"}
        known_post = {"/api/riders/applications", "/api/sellers/applications", "/api/deliveries/requests",
                      "/api/payments/mpesa/stk", "/api/deliveries/confirm", "/api/admin/actions"}
        is_order_detail = path.startswith("/api/customer/orders/")
        if not ((method == "GET" and (path in known_get or is_order_detail)) or
                (method == "POST" and path in known_post)):
            raise ApiError(404, "route_not_found", "This API route is unavailable.")
        user_id, token = self.authenticate(authorization)
        if method == "GET":
            if path == "/api/account/access":
                return {"admin": user_id in self.owners()}
            if path == "/api/customer/profile":
                profiles = self.owned("profiles", PROFILE_FIELDS, "id", user_id, token)
                if len(profiles) > 1:
                    raise ApiError(502, "profile_mapping_ambiguous", "The customer profile could not be matched safely.")
                return {"profile": profiles[0] if profiles else None}
            if path == "/api/customer/orders":
                return {"orders": self.owned("orders", ORDER_FIELDS, "customer_id", user_id, token, order="created_at.desc"), "limit": 50}
            if is_order_detail:
                order = self.order(path.rsplit("/", 1)[1], user_id, token)
                items = self.owned("order_items", ITEM_FIELDS, "order_id", order["id"], token)
                return {"order": order, "items": items}
            if path == "/api/customer/bookings":
                return {"bookings": self.owned("bookings", BOOKING_FIELDS, "customer_id", user_id, token, order="created_at.desc"), "limit": 50}
            if path == "/api/customer/payments":
                payments = self.owned("payment_transactions", PAYMENT_FIELDS, "customer_id", user_id, token,
                                      order="created_at.desc")
                # Validate parents of the returned payments, not just the first
                # page of recent orders. An older order can have a new payment.
                payment_order_ids = {identifier(row["order_id"]) for row in payments}
                orders = self.owned("orders", "id", "customer_id", user_id, token,
                                    id="in.(" + ",".join(sorted(payment_order_ids)) + ")") if payment_order_ids else []
                order_ids = {identifier(row["id"]) for row in orders}
                if payment_order_ids != order_ids:
                    raise ApiError(502, "ownership_check_failed", "Payment ownership checks failed. No payment records were returned.")
                return {"payments": payments, "limit": 50, "scope": "most_recent_50_payments"}
            if path == "/api/seller":
                seller = self.seller(user_id, token)
                return {"seller": seller,
                        "products": self.owned("products", PRODUCT_FIELDS, "seller_id", identifier(seller["id"]), token) if seller else [],
                        "items": self.owned("order_items", ITEM_FIELDS, "seller_id", identifier(seller["id"]), token) if seller else [],
                        "accounting_enabled": False}
            if path == "/api/admin":
                self.require_owner(user_id)
                return {
                    "profiles": self.rows("profiles", "id,display_name", token),
                    "sellers": self.rows("seller_profiles", SELLER_FIELDS, token),
                    "products": self.rows("products", PRODUCT_FIELDS, token),
                    "orders": self.rows("orders", ORDER_FIELDS, token),
                    "bookings": self.rows("bookings", BOOKING_FIELDS, token),
                    "payments": self.rows("payment_transactions", PAYMENT_FIELDS, token),
                    "mutations_enabled": False,
                }
            if path == "/api/rider":
                self.blocked("rider_not_configured", "Rider verification, job assignment and earnings storage are not configured. No rider status or earnings are being simulated.")
            if path == "/api/deliveries/track":
                self.order(query.get("order_id", [""])[0], user_id, token)
                self.blocked("delivery_not_configured", "Your order was found, but delivery tracking and rider assignment are not configured. No delivery status is being simulated.")

        if path == "/api/admin/actions":
            self.require_owner(user_id)
            self.blocked("admin_writes_disabled", "Admin mutations and payout execution remain locked pending schema review and approval.")
        if path == "/api/riders/applications":
            required_text(body, "full_name", maximum=120)
            phone_number(body)
            required_text(body, "city", maximum=80)
            if body.get("vehicle") not in ("bicycle", "motorcycle", "car", "van"):
                raise ApiError(400, "invalid_vehicle", "Select a supported vehicle type.")
            if body.get("consent") is not True:
                raise ApiError(400, "consent_required", "Consent to verification is required.")
            self.blocked("rider_registration_not_configured", "Your application was not saved. Rider storage, private verification documents and approval policies must be configured first.")
        if path == "/api/sellers/applications":
            required_text(body, "store_name", minimum=2)
            self.blocked("seller_registration_not_configured", "Your application was not saved. Existing seller write policies and approval defaults need verification.")
        if path == "/api/deliveries/requests":
            order_id = identifier(body.get("order_id"))
            required_text(body, "pickup_address", minimum=5, maximum=500)
            required_text(body, "delivery_address", minimum=5, maximum=500)
            seller = self.seller(user_id, token)
            if not seller:
                raise ApiError(403, "seller_access_required", "An existing seller profile is required.")
            items = self.owned("order_items", ITEM_FIELDS, "seller_id", identifier(seller["id"]), token, order_id="eq." + order_id)
            if not items:
                raise ApiError(404, "seller_order_not_found", "This order does not contain items belonging to your seller profile.")
            self.blocked("delivery_not_configured", "The delivery request was not saved. Delivery schema, confirmation rules, charges and OTP configuration require approval.")
        if path == "/api/payments/mpesa/stk":
            phone_number(body)
            self.order(body.get("order_id"), user_id, token)
            self.blocked("payments_disabled", "No STK prompt was sent. Daraja credentials, verified settlement and sandbox acceptance are required. Live money remains disabled.")
        if path == "/api/deliveries/confirm":
            self.order(body.get("order_id"), user_id, token)
            otp = required_text(body, "otp", minimum=6, maximum=6)
            if not otp.isascii() or not otp.isdigit():
                raise ApiError(400, "invalid_otp", "The delivery code must contain six digits.")
            self.blocked("delivery_confirmation_disabled", "No delivery was confirmed. Secure OTP issuance, verification and delivery storage are not configured.")
