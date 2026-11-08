(() => {
  "use strict";
  const mount = document.getElementById("platformMount");
  const main = document.querySelector("body > main:not(#platformMount)");
  const nav = document.querySelector(".platform-nav");
  let epoch = 0;
  let readiness = null;
  let orders = [];
  let catalogCache = [];
  let activeRoute = null;
  let lastAuthUserId = currentUser?.id || null;
  let fieldSequence = 0;
  const routePaths = {
    workspaces: "/workspaces", customer: "/customer", seller: "/seller",
    rider: "/rider", delivery: "/delivery", payments: "/payments",
    admin: "/admin", catalog: "/catalog"
  };
  const allowed = new Set(Object.keys(routePaths));
  const authPaths = new Set(["/sign-in", "/register", "/forgot-password"]);
  const normalizedPath = () => location.pathname.replace(/\/$/, "") || "/";
  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };
  const button = (label, action, secondary = false) => {
    const node = el("button", "platform-btn" + (secondary ? " secondary" : ""), label);
    node.type = "button";
    if (action) node.addEventListener("click", action);
    return node;
  };
  const panel = (title, content) => {
    const box = el("section", "platform-panel");
    if (title) box.appendChild(el("h2", "", title));
    if (content) box.appendChild(content);
    return box;
  };
  const notice = (text, kind = "") => el("div", "platform-notice" + (kind ? " " + kind : ""), text);
  const empty = (text) => el("div", "platform-empty", text);
  const money = (amount, currency) => {
    if (amount === null || amount === undefined || amount === "") return "Amount unavailable";
    const value = Number(amount);
    if (!Number.isFinite(value)) return "Amount unavailable";
    if (!currency) return `${value.toLocaleString()} (currency not returned)`;
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value); }
    catch (_) { return `${currency} ${value.toLocaleString()}`; }
  };
  const date = (value) => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? "Date unavailable" : parsed.toLocaleString();
  };
  function go(route, productId, context = {}) {
    if (!allowed.has(route)) return;
    const url = new URL(location.href);
    url.pathname = routePaths[route];
    ["workspace", "product", "q", "order"].forEach(key => url.searchParams.delete(key));
    if (productId) url.searchParams.set("product", productId);
    if (context.order) url.searchParams.set("order", context.order);
    history.pushState({}, "", url.pathname + url.search + url.hash);
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function routeFromUrl() {
    const params = new URLSearchParams(location.search);
    const requested = params.get("workspace");
    if (allowed.has(requested)) return requested; // Preserve existing shared links.
    if (authPaths.has(normalizedPath())) return "customer";
    return Object.keys(routePaths).find(key => routePaths[key] === normalizedPath()) || null;
  }
  function syncNavigation(route) {
    nav.hidden = false;
    nav.querySelectorAll("a").forEach((link) => {
      const current = link.dataset.workspace === (route || "home");
      if (current) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }
  function addHero(kicker, title, description) {
    const hero = el("header", "platform-hero");
    const copy = el("div", "platform-hero-copy");
    copy.append(el("div", "platform-kicker", kicker), el("h1", "", title), el("p", "", description));
    const brandPlate = el("div", "platform-hero-brandplate");
    const brand = el("img", "platform-hero-brand");
    brand.src = "/assets/brand/nexahub-logo.webp";
    brand.alt = "NexaHub — Your World. One Hub.";
    brand.width = 1020;
    brand.height = 240;
    brandPlate.appendChild(brand);
    hero.append(copy, brandPlate);
    mount.appendChild(hero);
  }
  function stateBox(text, type = "") {
    mount.appendChild(notice(text, type));
  }
  function clearAndSetLoading() {
    mount.replaceChildren();
    mount.hidden = false;
    if (main) main.hidden = true;
    const skeleton = el("div", "platform-skeleton");
    skeleton.setAttribute("aria-label", "Loading workspace");
    skeleton.setAttribute("role", "status");
    mount.appendChild(skeleton);
  }
  async function api(path, options = {}, protectedRoute = false) {
    const headers = new Headers(options.headers || {});
    headers.set("Accept", "application/json");
    if (options.body !== undefined) headers.set("Content-Type", "application/json");
    if (protectedRoute) {
      const expectedUser = currentUser?.id;
      if (!nexahubSupabase) throw new Error("Sign in is unavailable because the existing account client did not initialize.");
      const { data, error } = await nexahubSupabase.auth.getSession();
      if (error) throw new Error("Could not verify your sign-in session. Please retry.");
      const token = data?.session?.access_token;
      if (!token) throw new Error("Sign in to access this private workspace.");
      if (!expectedUser || currentUser?.id !== expectedUser || data.session.user.id !== expectedUser) {
        throw new Error("Your account changed. Please retry from your current workspace.");
      }
      headers.set("Authorization", `Bearer ${token}`);
    }
    const response = await fetch(path, { ...options, headers, credentials: "same-origin" });
    let payload;
    try { payload = await response.json(); } catch (_) { payload = null; }
    if (!response.ok) {
      const error = payload?.error;
      const failure = new Error(error?.message || `Request could not be completed (HTTP ${response.status}).`);
      failure.status = response.status;
      failure.code = error?.code;
      throw failure;
    }
    return payload || {};
  }
  function requireSignIn() {
    if (currentUser) return true;
    const box = el("div", "platform-authbar");
    box.append(el("span", "", "This workspace is private. Sign in to load account-owned information."));
    box.appendChild(button("Sign in", () => showAccount()));
    const register = el("a", "", "Create an account");
    register.href = "/register";
    box.appendChild(register);
    mount.appendChild(box);
    return false;
  }
  function setError(message, retry) {
    mount.replaceChildren();
    addHero("NEXAHUB WORKSPACE", "We couldn’t load this view", "Your private information has not been replaced with sample data.");
    const box = notice(message, "error");
    box.appendChild(document.createTextNode(" "));
    box.appendChild(button("Retry", retry, true));
    mount.appendChild(box);
  }
  function listRows(items, renderRow, noRows) {
    if (!Array.isArray(items) || items.length === 0) return empty(noRows);
    const list = el("ul", "platform-list");
    items.forEach((item) => list.appendChild(renderRow(item)));
    return list;
  }
  function recordRow(title, detail, status, onClick, actionLabel) {
    const row = el("li");
    const left = el("div");
    left.append(el("strong", "", title), el("div", "platform-meta", detail));
    row.appendChild(left);
    if (onClick) {
      const action = button(actionLabel || status || "View", onClick, true);
      action.setAttribute("aria-label", `${actionLabel || status || "View"} ${title}`);
      row.appendChild(action);
    } else if (status) row.appendChild(el("span", "platform-status", status));
    return row;
  }
  async function readinessData() {
    if (readiness) return readiness;
    readiness = await api("/api/readiness");
    return readiness;
  }
  function showReadiness(data, key) {
    const info = data?.[key];
    if (!info) return notice("Readiness details are not available from the server.", "warn");
    const wrap = el("div");
    wrap.appendChild(notice(info.enabled ? "This capability is configured. A real action still requires an eligible record and server authorization." : "Not configured. No transaction or application will be sent unless the server explicitly enables the capability.", info.enabled ? "" : "warn"));
    if (Array.isArray(info.reasons) && info.reasons.length) {
      const list = el("ul", "platform-list");
      info.reasons.forEach((reason) => list.appendChild(el("li", "", reason)));
      wrap.appendChild(list);
    }
    return wrap;
  }
  async function loadWorkspaces() {
    addHero("NEXAHUB WORKSPACES", "Choose your workspace", "Every link opens this application. Availability below distinguishes connected readers from operations that are not yet implemented.");
    const grid = el("div", "platform-grid workspace-shortcuts");
    const entries = [
      ["customer", "Customer dashboard", "Connected readers; sign-in required", "Your profile, orders, bookings and payment records. A confirmed Supabase session is required; successful real login still needs acceptance testing."],
      ["seller", "Seller dashboard", "Read-only account connection", "View your existing store, products and order items. Applications, listing edits, delivery requests and seller accounting are not operational."],
      ["rider", "Rider registration and dashboard", "Forms only; storage unavailable", "View registration fields, account, jobs and earnings sections. Registration, verification, acceptance and earnings are not saved."],
      ["delivery", "Customer delivery tracking", "Entry form only; tracking unavailable", "Enter an order to check ownership. No real delivery milestones, rider location or secure OTP service are connected."],
      ["catalog", "Live product catalog", "Connected published-product reader", "Search published listings returned by the existing backend. An empty catalog stays empty; example storefront products are not substituted."],
      ["payments", "M-PESA readiness", "Collections and payouts disabled", "View configuration requirements and account-owned payment records. No live STK Push, settlement or payout is enabled."],
      ["admin", "Admin dashboard", "Protected entry; management disabled", "Owner access must be provisioned server-side. Approvals, suspension, fees, disputes and payout actions remain unavailable."]
    ];
    entries.forEach(([route, title, status, description]) => {
      const card = panel(title);
      card.append(el("div", "platform-status workspace-status", status), el("p", "", description));
      const link = el("a", "platform-btn workspace-directory-link", `Open ${title.toLowerCase()}`);
      link.href = routePaths[route];
      link.dataset.workspace = route;
      card.appendChild(link);
      grid.appendChild(card);
    });
    mount.appendChild(grid);
    const accounts = panel("Real customer authentication", el("p", "", "These routes use the existing Supabase project. Email confirmation and permitted return URLs are required. Google still requires a successful provider callback test."));
    const links = el("div", "platform-actions");
    [["/sign-in", "Sign in"], ["/register", "Create an account"], ["/forgot-password", "Reset password"]].forEach(([path, label]) => {
      const link = el("a", "platform-btn secondary workspace-directory-link", label); link.href = path; links.appendChild(link);
    });
    accounts.appendChild(links);
    mount.appendChild(accounts);
    mount.appendChild(panel("Not yet operational", notice("Secure digital downloads, service booking, travel and accommodation reservations, real order creation from the basket, delivery operations, seller/rider accounting and management actions are not implemented end to end. Storefront category examples are not these services.", "warn")));
    const status = panel("Current server readiness", el("div", "platform-skeleton"));
    mount.appendChild(status);
    const ticket = epoch;
    try {
      const data = await readinessData();
      if (ticket !== epoch) return;
      const content = el("div", "platform-actions");
      for (const [key, label] of [["seller_writes", "Seller applications"], ["rider_registration", "Rider applications"], ["delivery", "Delivery"], ["payments", "Payments"]]) {
        content.appendChild(el("span", "platform-status", `${label}: ${data[key]?.enabled === true ? "configured; acceptance tests required" : "disabled"}`));
      }
      status.replaceChildren(el("h2", "", "Current server readiness"), content);
    } catch (error) {
      if (ticket === epoch) status.replaceChildren(el("h2", "", "Current server readiness"), notice(error.message, "error"));
    }
  }
  async function loadCustomer(id) {
    addHero("CUSTOMER ACCOUNT", "Your NexaHub", "Orders, bookings and payments associated with your signed-in account.");
    if (!requireSignIn()) return;
    const ticket = ++epoch;
    const uid = currentUser?.id;
    const intro = el("div", "platform-authbar");
    intro.append(el("span", "", `Signed in as ${currentUser?.email || "your account"}`));
    intro.append(button("Account profile", () => showAccount(), true));
    mount.appendChild(intro);
    const loading = el("div", "platform-grid");
    for (const heading of ["Orders", "Bookings", "Payments"]) {
      const p = panel(heading, el("div", "platform-skeleton"));
      loading.appendChild(p);
    }
    mount.appendChild(loading);
    try {
      const [orderData, bookingData, paymentData] = await Promise.all([
        api("/api/customer/orders", {}, true), api("/api/customer/bookings", {}, true), api("/api/customer/payments", {}, true)
      ]);
      if (ticket !== epoch || uid !== currentUser?.id) return;
      orders = Array.isArray(orderData.orders) ? orderData.orders : [];
      const grid = el("div", "platform-grid");
      const orderRows = listRows(orders, (order) => recordRow(
        `Order ${order.id}`, `${money(order.total_amount, order.currency)} · ${date(order.created_at)}`, order.status,
        () => viewOrder(order.id), "View order"
      ), "No orders have been returned for this account.");
      grid.appendChild(panel("Orders", orderRows));
      grid.appendChild(panel("Bookings", listRows(bookingData.bookings, (booking) => recordRow(
        `Booking ${booking.id}`, `Product ${booking.product_id} · ${date(booking.created_at)}`, booking.status
      ), "No bookings have been returned for this account.")));
      grid.appendChild(panel("Payments", listRows(paymentData.payments, (payment) => recordRow(
        `Payment ${payment.id}`, `${payment.provider || "Provider unavailable"} · ${money(payment.amount, payment.currency)}`, payment.status
      ), "No payments have been returned for this account.")));
      loading.replaceWith(grid);
      const controls = el("div", "platform-actions");
      controls.append(button("Track an order", () => go("delivery")), button("M-PESA readiness", () => go("payments"), true));
      mount.appendChild(controls);
      if (id) {
        const found = orders.find((row) => row.id === id);
        if (found) await viewOrder(id, ticket);
      }
    } catch (error) {
      if (ticket === epoch && uid === currentUser?.id) setError(error.message, () => render());
    }
  }
  async function viewOrder(id, expectedTicket = epoch) {
    const url = new URL(location.href);
    url.searchParams.set("order", id);
    history.replaceState({}, "", url.pathname + url.search + url.hash);
    const target = mount.querySelector("#orderDetailPanel");
    if (target) target.remove();
    const pending = panel("Order details", el("div", "platform-skeleton"));
    pending.id = "orderDetailPanel";
    mount.appendChild(pending);
    try {
      const detail = await api(`/api/customer/orders/${encodeURIComponent(id)}`, {}, true);
      if (expectedTicket !== epoch || !currentUser) return;
      const box = el("div");
      box.append(el("p", "", `Order ${detail.order?.id || id}`), el("span", "platform-status", detail.order?.status || "Status unavailable"));
      box.appendChild(listRows(detail.items, (item) => recordRow(
        `Product ${item.product_id}`, `Quantity ${item.quantity} · ${money(item.unit_price, detail.order?.currency)}`, null
      ), "This order has no returned line items."));
      const actions = el("div", "platform-actions");
      actions.append(button("Payment readiness", () => go("payments", null, { order: id })), button("Track delivery", () => go("delivery", null, { order: id }), true));
      box.appendChild(actions);
      pending.replaceChildren(el("h2", "", "Order details"), box);
    } catch (error) {
      if (expectedTicket !== epoch) return;
      pending.replaceChildren(el("h2", "", "Order details"), notice(error.message, "error"));
    }
  }
  function formField(form, labelText, name, type = "text", required = true, attrs = {}) {
    const field = el("div", "platform-field");
    const label = el("label", "", labelText);
    let input;
    if (attrs.select) {
      input = document.createElement("select");
      attrs.select.forEach((option) => {
        const node = el("option", "", option[1]);
        node.value = option[0];
        input.appendChild(node);
      });
    } else input = document.createElement(type === "textarea" ? "textarea" : "input");
    input.name = name;
    input.id = `workspace-field-${++fieldSequence}`;
    label.htmlFor = input.id;
    input.required = required;
    if (type !== "textarea" && !attrs.select) input.type = type;
    if (attrs.maxLength) input.maxLength = attrs.maxLength;
    if (attrs.autocomplete) input.autocomplete = attrs.autocomplete;
    field.append(label, input);
    form.appendChild(field);
    return input;
  }
  function formPanel(title, description, fields, endpoint, payload, readinessGate, gateKey) {
    const box = panel(title, null);
    if (description) box.appendChild(el("p", "platform-meta", description));
    const form = el("form", "platform-form");
    form.noValidate = true;
    fields.forEach((field) => formField(form, ...field));
    const message = el("div", "platform-route-message");
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    const submit = document.createElement("button");
    submit.type = "submit"; submit.className = "platform-btn"; submit.textContent = "Validate and check readiness";
    form.append(submit, message);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      message.className = "platform-route-message";
      if (!form.reportValidity()) { message.textContent = "Check the highlighted fields. Nothing has been sent."; return; }
      if (!currentUser) { message.textContent = "Sign in first. Nothing has been sent."; showAccount(); return; }
      submit.disabled = true; submit.textContent = "Checking…";
      const submittedEpoch = epoch, submittedUser = currentUser.id;
      try {
        const state = await readinessData();
        if (submittedEpoch !== epoch || submittedUser !== currentUser?.id) throw new Error("Your account changed. The request was not sent.");
        const body = payload(form);
        const result = await api(endpoint, { method: "POST", body: JSON.stringify(body) }, true);
        message.className = "platform-route-message platform-notice";
        message.textContent = result.message || (state?.[readinessGate]?.enabled === false
          ? `The request was validated, but ${gateKey || readinessGate} is not configured.`
          : "The server accepted this request.");
      } catch (error) {
        message.className = "platform-route-message platform-notice warn";
        message.textContent = `Not saved or sent. ${error.message}`;
      } finally { submit.disabled = false; submit.textContent = "Validate and check readiness"; }
    });
    box.appendChild(form);
    return box;
  }
  async function loadSeller() {
    addHero("SELLER DESK", "A clearer view of your store", "Your seller profile and sales-related records are loaded only from your account-scoped workspace.");
    if (!requireSignIn()) {
      mount.appendChild(formPanel("Apply to sell", "Check your application details here. Sign-in and verified write policies are required before an application can be saved.", [
        ["Store name", "store_name", "text", true, { maxLength: 120 }]
      ], "/api/sellers/applications", (form) => ({ store_name: form.elements.store_name.value.trim() }), "seller_writes", "seller writes"));
      return;
    }
    const ticket = ++epoch, uid = currentUser?.id;
    const loading = panel("Seller overview", el("div", "platform-skeleton"));
    mount.appendChild(loading);
    try {
      const [data, config] = await Promise.all([api("/api/seller", {}, true), readinessData()]);
      if (ticket !== epoch || uid !== currentUser?.id) return;
      const content = el("div");
      if (!data.seller) content.appendChild(empty("No seller profile is available for this account. Submit an application below; this request is not saved unless the server confirms otherwise."));
      else {
        content.append(el("p", "", data.seller.store_name || "Store name unavailable"), el("span", "platform-status", data.seller.status || "Status unavailable"));
        content.appendChild(el("p", "platform-meta", `Created ${date(data.seller.created_at)}`));
      }
      content.appendChild(notice("Seller accounting is not enabled. No revenue, earnings or order totals are inferred.", "warn"));
      content.appendChild(el("h3", "", "Products"));
      content.appendChild(listRows(data.products, (product) => recordRow(product.title || `Product ${product.id}`, product.status || "Status unavailable", product.status), "No seller products were returned."));
      content.appendChild(el("h3", "", "Order items"));
      content.appendChild(listRows(data.items, (item) => recordRow(`Order ${item.order_id}`, `Product ${item.product_id} · Qty ${item.quantity} · ${money(item.unit_price)}`, null, () => {
        const requestForm = mount.querySelector('form [name="pickup_address"]')?.form;
        if (!requestForm) return;
        requestForm.elements.order_id.value = item.order_id;
        requestForm.scrollIntoView({ behavior: "smooth", block: "center" });
        requestForm.elements.pickup_address.focus({ preventScroll: true });
      }, "Prepare delivery request"), "No seller order items were returned."));
      loading.replaceWith(panel("Seller overview", content));
      const grid = el("div", "platform-grid");
      grid.appendChild(formPanel("Apply to sell", "A validated request reaches a server-side configuration gate. There is no local draft.", [
        ["Store name", "store_name", "text", true, { maxLength: 120 }]
      ], "/api/sellers/applications", (form) => ({ store_name: form.elements.store_name.value.trim() }), "seller_writes", "seller writes"));
      const request = panel("Request a delivery", null);
      request.appendChild(notice("Only request delivery for an order that belongs to this seller. Pickup and delivery details are private and are never stored in this browser.", "warn"));
      request.appendChild(formPanel("Delivery request", "", [
        ["Order ID", "order_id", "text", true, { maxLength: 80 }],
        ["Pickup address", "pickup_address", "textarea", true],
        ["Delivery address", "delivery_address", "textarea", true]
      ], "/api/deliveries/requests", (form) => ({
        order_id: form.elements.order_id.value.trim(),
        pickup_address: form.elements.pickup_address.value.trim(),
        delivery_address: form.elements.delivery_address.value.trim()
      }), "delivery", "delivery requests"));
      grid.appendChild(request);
      grid.appendChild(panel("Seller readiness", showReadiness(config, "seller_writes")));
      mount.appendChild(grid);
    } catch (error) { if (ticket === epoch && uid === currentUser?.id) setError(error.message, () => render()); }
  }
  async function loadRider() {
    addHero("RIDER DESK", "Independent work, responsibly", "Rider access requires backend approval. Registration documents, jobs, location and earnings are not simulated.");
    const signedIn = requireSignIn();
    const ticket = ++epoch, uid = currentUser?.id;
    const status = panel("Rider account", el("div", "platform-skeleton"));
    mount.appendChild(status);
    try {
      const [riderResult, config] = await Promise.allSettled([
        signedIn ? api("/api/rider", {}, true) : Promise.reject(new Error("Sign in to check rider approval.")),
        readinessData()
      ]);
      if (ticket !== epoch || uid !== currentUser?.id) return;
      status.replaceChildren(el("h2", "", "Rider account"));
      if (riderResult.status === "fulfilled") {
        const data = riderResult.value;
        status.appendChild(notice(data.rider?.status || "No rider status was provided."));
      } else status.appendChild(notice(`${riderResult.reason.message} No rider dashboard records are shown.`, "warn"));
      const readinessInfo = config.status === "fulfilled" ? showReadiness(config.value, "rider_registration") : notice("Registration readiness could not be checked. Retry this view.", "error");
      const grid = el("div", "platform-grid");
      grid.appendChild(panel("Registration readiness", readinessInfo));
      grid.appendChild(formPanel("Rider application", "These details remain in this page only. Applications are not saved until verified rider storage is configured. No identity documents are collected here.", [
        ["Full name", "full_name", "text", true, { maxLength: 120, autocomplete: "name" }],
        ["Phone number", "phone", "tel", true, { maxLength: 32, autocomplete: "tel" }],
        ["City", "city", "text", true, { maxLength: 80 }],
        ["Vehicle", "vehicle", "select", true, { select: [["", "Select a vehicle"], ["bicycle", "Bicycle"], ["motorcycle", "Motorcycle"], ["car", "Car"], ["van", "Van"]] }],
        ["I consent to submit these details for rider registration", "consent", "checkbox", true]
      ], "/api/riders/applications", (form) => ({
        full_name: form.elements.full_name.value.trim(), phone: form.elements.phone.value.trim(),
        city: form.elements.city.value.trim(), vehicle: form.elements.vehicle.value.trim(),
        consent: form.elements.consent.checked
      }), "rider_registration", "rider registration"));
      grid.appendChild(panel("Available jobs", empty("Job acceptance is locked until rider approval, delivery storage and atomic assignment are configured. No sample jobs are offered.")));
      grid.appendChild(panel("Rider earnings", empty("Pending, available and paid earnings will come from verified delivery accounting. No earnings or commission rates have been invented.")));
      mount.appendChild(grid);
    } catch (error) { if (ticket === epoch && uid === currentUser?.id) setError(error.message, () => render()); }
  }
  async function loadDelivery() {
    addHero("DELIVERY", "Track an order", "Delivery status is separate from payment. No map, rider location or milestone is displayed unless the service returns it.");
    requireSignIn();
    const ticket = ++epoch, uid = currentUser?.id;
    const wrap = panel("Customer tracking", null);
    const form = el("form", "platform-form");
    const orderInput = formField(form, "Order ID", "order_id", "text", true, { maxLength: 80 });
    orderInput.value = new URLSearchParams(location.search).get("order") || "";
    const track = document.createElement("button"); track.className = "platform-btn"; track.type = "submit"; track.textContent = "Check tracking";
    const output = el("div", "platform-route-message"); output.setAttribute("role", "status"); output.setAttribute("aria-live", "polite");
    form.append(track, output);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      if (!currentUser) { output.textContent = "Sign in to track your own order."; showAccount(); return; }
      output.textContent = "Checking customer-owned order…";
      try {
        const result = await api(`/api/deliveries/track?order_id=${encodeURIComponent(orderInput.value.trim())}`, {}, true);
        if (ticket !== epoch || uid !== currentUser?.id) return;
        output.replaceChildren(notice("Tracking response received. Only server-provided information is shown."));
        const data = el("pre", "platform-json");
        data.textContent = JSON.stringify(result, null, 2);
        output.appendChild(data);
      } catch (error) {
        if (ticket !== epoch || uid !== currentUser?.id) return;
        output.className = "platform-route-message platform-notice warn";
        output.textContent = `Tracking unavailable. No delivery status, map or location has been invented. ${error.message}`;
      }
    });
    wrap.appendChild(form); mount.appendChild(wrap);
    const estimatePanel = panel("Delivery estimate", notice("Checking whether an estimate is configured…"));
    mount.appendChild(estimatePanel);
    api("/api/delivery/estimate").then((result) => {
      if (ticket !== epoch || uid !== currentUser?.id) return;
      estimatePanel.replaceChildren(el("h2", "", "Delivery estimate"), notice(result.message || "Estimate response received."));
    }).catch((error) => {
      if (ticket !== epoch || uid !== currentUser?.id) return;
      estimatePanel.replaceChildren(el("h2", "", "Delivery estimate"), notice(`No delivery fee or estimate is available. ${error.message}`, "warn"));
    });
    const otp = formPanel("Delivery confirmation code", "This form never generates a code. The server must verify any submitted code and may reject the request.", [
      ["Order ID", "order_id", "text", true, { maxLength: 80 }],
      ["One-time code", "otp", "text", true, { maxLength: 6 }]
    ], "/api/deliveries/confirm", (formEl) => ({
      order_id: formEl.elements.order_id.value.trim(), otp: formEl.elements.otp.value.trim()
    }), "delivery", "delivery confirmation");
    otp.querySelector('[name="order_id"]').value = orderInput.value;
    mount.appendChild(otp);
    const guide = panel("Delivery status guide", el("p", "platform-meta", "This is the approved workflow guide, not the status of a real delivery."));
    const steps = el("ol", "platform-workflow");
    ["Pending", "Accepted", "Picked Up", "In Transit", "Delivered", "Cancelled"].forEach(step => steps.appendChild(el("li", "", step)));
    guide.appendChild(steps); mount.appendChild(guide);
  }
  async function loadPayments() {
    addHero("PAYMENT READINESS", "M-PESA, not a mock checkout", "No STK prompt is initiated here. A real order must already belong to your signed-in account and payments remain behind server-side provider approval.");
    if (!requireSignIn()) {
      const ticket = ++epoch;
      const config = await readinessData();
      if (ticket === epoch) mount.appendChild(panel("M-PESA readiness", showReadiness(config, "payments")));
      return;
    }
    const ticket = ++epoch, uid = currentUser?.id;
    const body = el("div");
    body.appendChild(el("div", "platform-skeleton"));
    mount.appendChild(panel("Provider configuration", body));
    try {
      const [config, orderData] = await Promise.all([readinessData(), api("/api/customer/orders", {}, true)]);
      if (ticket !== epoch || uid !== currentUser?.id) return;
      orders = Array.isArray(orderData.orders) ? orderData.orders : [];
      const cards = el("div", "platform-grid");
      cards.appendChild(panel("M-PESA readiness", showReadiness(config, "payments")));
      const checkout = panel("Pay for an existing order", null);
      checkout.appendChild(notice("The selected order is used only for a protected server request. This workspace does not create orders from the sample basket.", "warn"));
      if (!orders.length) checkout.appendChild(empty("No real orders are available for payment. Place an order through an enabled marketplace flow first; sample basket items are not eligible."));
      else {
        const form = el("form", "platform-form");
        const choices = [["", "Choose an order"]];
        orders.forEach((order) => choices.push([order.id, `${order.id} — ${money(order.total_amount, order.currency)} — ${order.status}`]));
        const orderSelect = formField(form, "Order", "order_id", "select", true, { select: choices });
        const requestedOrder = new URLSearchParams(location.search).get("order");
        if (orders.some(order => order.id === requestedOrder)) orderSelect.value = requestedOrder;
        formField(form, "M-PESA phone number", "phone", "tel", true, { maxLength: 32, autocomplete: "tel" });
        const message = el("div", "platform-route-message"); message.setAttribute("role", "status"); message.setAttribute("aria-live", "polite");
        const submit = document.createElement("button"); submit.className = "platform-btn"; submit.type = "submit"; submit.textContent = "Check payment readiness";
        form.append(submit, message);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!form.reportValidity()) { message.textContent = "Choose a valid order and phone. No request has been sent."; return; }
          const chosen = orders.find((item) => item.id === form.elements.order_id.value);
          if (!chosen) { message.textContent = "Choose one of your returned orders. Nothing has been sent."; return; }
          submit.disabled = true;
          try {
            const result = await api("/api/payments/mpesa/stk", { method: "POST", body: JSON.stringify({
              order_id: chosen.id, phone: form.elements.phone.value.trim()
            }) }, true);
            message.textContent = result.message || "The server returned a response. Check payment status in your account.";
          } catch (error) {
            message.className = "platform-route-message platform-notice warn";
            message.textContent = `Not paid. The request was blocked or failed; no payment success is claimed. ${error.message}`;
          } finally { submit.disabled = false; }
        });
        checkout.appendChild(form);
      }
      cards.appendChild(checkout);
      const paymentHistory = await api("/api/customer/payments", {}, true);
      if (ticket !== epoch || uid !== currentUser?.id) return;
      cards.appendChild(panel("Payment history", listRows(paymentHistory.payments, (payment) =>
        recordRow(`Payment ${payment.id}`, `${payment.provider} · ${money(payment.amount, payment.currency)}`, payment.status),
      "No payment records have been returned for this account.")));
      mount.replaceChildren(mount.firstElementChild, cards);
    } catch (error) { if (ticket === epoch && uid === currentUser?.id) setError(error.message, () => render()); }
  }
  async function loadAdmin() {
    addHero("RESTRICTED AREA", "Administration", "Access is decided by the server, never by a selected UI role or profile metadata.");
    mount.appendChild(panel("Owner management", notice("Customer, seller, rider, order, booking, delivery, fee, dispute and payout controls require a provisioned owner account. Live payouts and all admin writes remain disabled.", "warn")));
    if (!requireSignIn()) return;
    const ticket = ++epoch, uid = currentUser?.id;
    mount.appendChild(panel("Owner access check", el("div", "platform-skeleton")));
    try {
      const data = await api("/api/admin", {}, true);
      if (ticket !== epoch || uid !== currentUser?.id) return;
      mount.replaceChildren();
      addHero("RESTRICTED AREA", "Administration", "Read-only records returned by the owner-authorized endpoint.");
      const keys = ["profiles", "sellers", "products", "orders", "bookings", "payments"];
      const grid = el("div", "platform-grid");
      keys.forEach((key) => {
        const rows = data[key];
        grid.appendChild(panel(key[0].toUpperCase() + key.slice(1), listRows(rows, (record) =>
          recordRow(record.display_name || record.store_name || record.title || record.id || "Record", record.status || "", record.status),
        `No ${key} were returned.`)));
      });
      grid.appendChild(panel("Controls", notice(data.mutations_enabled === false ? "Controls are read-only. Admin writes are not enabled." : "Mutation availability is controlled by server policy.", "warn")));
      const actionForm = formPanel("Restricted action request", "No admin mutation is available in the current contract. The endpoint reports its server-side gate.", [
        ["Action", "action", "select", true, { select: [["", "Choose an action"], ["approve_rider", "Review rider approval"], ["suspend_rider", "Review rider suspension"], ["delivery_fees", "Review delivery fees"], ["resolve_dispute", "Review dispute"], ["approve_payout", "Review payout approval"]] }],
        ["Record ID", "record_id", "text", true, { maxLength: 100 }]
      ], "/api/admin/actions", (form) => ({ action: form.elements.action.value.trim(), record_id: form.elements.record_id.value.trim() }), null, "admin actions");
      grid.appendChild(actionForm);
      mount.appendChild(grid);
    } catch (error) { if (ticket === epoch && uid === currentUser?.id) setError(error.message, () => render()); }
  }
  function renderCatalogCards(products) {
    catalogCache = Array.isArray(products) ? products : [];
    const grid = el("div", "platform-products");
    if (!catalogCache.length) {
      grid.appendChild(empty("No published products are currently available. This catalog is live and does not use the storefront preview cards as fallback inventory."));
      return grid;
    }
    catalogCache.forEach((product) => {
      const card = el("article", "platform-product");
      if (product.image_url) {
        try {
          const imageUrl = new URL(product.image_url, location.origin);
          if (imageUrl.protocol === "https:" || imageUrl.protocol === "http:") {
            const image = document.createElement("img");
            image.src = imageUrl.href; image.alt = product.title || "Published product"; image.loading = "lazy";
            image.className = "platform-product-image";
            card.appendChild(image);
          }
        } catch (_) { /* Invalid image URL is omitted safely. */ }
      }
      if (product.category_id) card.appendChild(el("span", "platform-kicker", `CATEGORY ${product.category_id}`));
      card.append(el("h3", "", product.title || "Untitled product"), el("p", "", product.description || "No description supplied."));
      card.appendChild(el("strong", "", money(product.price, product.currency)));
      card.appendChild(button("View details", () => go("catalog", product.id), true));
      grid.appendChild(card);
    });
    return grid;
  }
  async function loadCatalog() {
    const params = new URLSearchParams(location.search);
    const productId = params.get("product");
    addHero("LIVE MARKETPLACE", productId ? "Product details" : "Published catalog", "Only products published through NexaHub’s live catalog endpoint appear here.");
    const form = el("form", "platform-form");
    const search = formField(form, "Search published products", "q", "search", false, { maxLength: 120 });
    search.value = params.get("q") || "";
    const submit = document.createElement("button"); submit.type = "submit"; submit.className = "platform-btn secondary"; submit.textContent = "Search catalog";
    form.appendChild(submit);
    const searchPanel = panel("Find something", form);
    mount.appendChild(searchPanel);
    const result = panel(productId ? "Product" : "Published products", el("div", "platform-skeleton"));
    mount.appendChild(result);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const url = new URL(location.href);
      if (search.value.trim()) url.searchParams.set("q", search.value.trim()); else url.searchParams.delete("q");
      history.pushState({}, "", url.pathname + url.search + url.hash);
      render();
    });
    const ticket = ++epoch;
    try {
      if (productId) {
        const response = await api(`/api/catalog/${encodeURIComponent(productId)}`);
        if (ticket !== epoch) return;
        const product = response.product;
        const detail = el("div");
        if (response.product?.image_url) {
          try {
            const imageUrl = new URL(response.product.image_url, location.origin);
            if (imageUrl.protocol === "https:" || imageUrl.protocol === "http:") {
              const image = document.createElement("img");
              image.src = imageUrl.href; image.alt = response.product.title || "Published product";
              image.className = "platform-detail-image"; image.loading = "lazy";
              detail.appendChild(image);
            }
          } catch (_) { /* Invalid image URL is omitted safely. */ }
        }
        detail.append(el("h2", "", product?.title || "Product"), el("p", "", product?.description || "No description supplied."));
        detail.append(el("p", "platform-meta", `Published listing · ${product?.status || "status unavailable"}`), el("strong", "", money(product?.price, product?.currency)));
        result.replaceChildren(el("h2", "", "Product"), detail, button("Back to catalog", () => go("catalog"), true));
      } else {
        const query = params.get("q");
        const response = await api(`/api/catalog${query ? `?q=${encodeURIComponent(query.slice(0, 120))}` : ""}`);
        if (ticket !== epoch) return;
        const productGrid = renderCatalogCards(response.products);
        result.replaceChildren(el("h2", "", "Published products"), productGrid);
        const categories = Array.isArray(response.categories) ? response.categories : [];
        if (categories.length) {
          const list = el("div", "platform-actions");
          categories.forEach((category) => list.appendChild(el("span", "platform-status", category.name || category.slug || "Category")));
          mount.appendChild(panel("Categories", list));
        }
      }
    } catch (error) {
      if (ticket !== epoch) return;
      result.replaceChildren(el("h2", "", productId ? "Product details" : "Published products"), notice(error.message, "error"), button("Retry", () => render(), true));
    }
  }
  async function render() {
    const route = routeFromUrl();
    activeRoute = route;
    syncNavigation(route);
    epoch++;
    if (!route) {
      mount.hidden = true;
      mount.replaceChildren();
      if (main) main.hidden = false;
      return;
    }
    clearAndSetLoading();
    mount.replaceChildren();
    try {
      if (route === "workspaces") await loadWorkspaces();
      else if (route === "catalog") await loadCatalog();
      else if (route === "customer") await loadCustomer(new URLSearchParams(location.search).get("order"));
      else if (route === "seller") await loadSeller();
      else if (route === "rider") await loadRider();
      else if (route === "delivery") await loadDelivery();
      else if (route === "payments") await loadPayments();
      else if (route === "admin") await loadAdmin();
    } catch (error) { setError(error.message || "Unable to load this workspace.", () => render()); }
  }
  function authChanged(user) {
    const nextUserId = user?.id || null;
    if (nextUserId === lastAuthUserId) return;
    lastAuthUserId = nextUserId;
    if (!activeRoute || activeRoute === "catalog" || activeRoute === "workspaces") return;
    epoch++;
    orders = [];
    // Rendering clears the previous account's DOM before any async reader runs.
    // Initial anonymous SDK events must not erase public forms or route titles.
    render();
  }
  document.addEventListener("click", (event) => {
    const categoryLink = event.target.closest('.footer a[href="#marketplace"]');
    if (categoryLink && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      goHome();
      filterCategory({ Shopping: "Shopping", "Digital products": "Digital", Services: "Services", Travel: "Travel" }[categoryLink.textContent.trim()] || "All");
      document.getElementById("marketplace").scrollIntoView({ behavior: "smooth" });
      return;
    }
    const link = event.target.closest("a[data-workspace]");
    if (!link || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const target = new URL(link.href);
    if (target.origin !== location.origin) return;
    event.preventDefault();
    if (link.closest("#accountModal")) closeModal("accountModal");
    const workspace = link.dataset.workspace;
    if (allowed.has(workspace)) go(workspace);
    else goHome();
  });
  function goHome() {
    const url = new URL(location.href);
    url.pathname = "/";
    ["workspace", "product", "q", "order"].forEach(key => url.searchParams.delete(key));
    history.pushState({}, "", url.pathname + url.search + url.hash);
    render();
  }
  document.querySelector(".header .nav").addEventListener("click", event => {
    if (activeRoute && event.target.closest("button") && !event.target.closest("button").getAttribute("onclick")?.includes("Platform")) goHome();
  }, true);
  function openAccountRoute() {
    if (!authPaths.has(normalizedPath())) return;
    showAccount();
    if (!currentUser && !isPasswordRecovery) {
      setAuthMode(normalizedPath() === "/register" ? "signup" : "signin");
      if (normalizedPath() === "/forgot-password") setAuthMessage("Enter your account email, then choose “Forgot password?” to request a secure reset link.");
    }
  }
  window.addEventListener("popstate", () => { render(); openAccountRoute(); });
  window.Platform = { go, home: goHome, render, authChanged };
  render();
  openAccountRoute();
  api("/api/build").then(data => {
    document.getElementById("previewBuild").textContent = `Preview build ${data.build_id} · Existing Supabase authentication · Live payments and payouts disabled`;
    document.getElementById("previewBuild").dataset.buildId = data.build_id;
  }).catch(() => {
    document.getElementById("previewBuild").textContent = "Preview build could not be verified. Reload before testing account features.";
  });
})();
