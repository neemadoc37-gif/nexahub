(() => {
  "use strict";

  const productHost = document.getElementById("liveProducts");
  const businessHost = document.getElementById("liveBusinesses");
  if (!productHost || !businessHost) return;

  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  };

  const safeImageUrl = (value) => {
    if (typeof value !== "string" || !value.trim()) return "";
    try {
      const url = new URL(value, window.location.origin);
      return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
    } catch (_) {
      return "";
    }
  };

  const textValue = (value, fallback = "") =>
    typeof value === "string" && value.trim() ? value.trim() : fallback;

  const moneyLabel = (price, currency) => {
    if (price === null || price === undefined || price === "") return "Price not provided";
    const amount = Number(price);
    if (!Number.isFinite(amount)) return "Price not provided";
    const code = textValue(currency);
    if (!code) return amount.toLocaleString();
    try {
      return new Intl.NumberFormat(undefined, { style: "currency", currency: code }).format(amount);
    } catch (_) {
      return `${code} ${amount.toLocaleString()}`;
    }
  };

  const makeState = (heading, description, retry) => {
    const state = element("div", retry ? "live-error" : "live-empty");
    state.append(element("strong", "", heading), element("p", "", description));
    if (retry) {
      const button = element("button", "", "Try again");
      button.type = "button";
      button.addEventListener("click", retry);
      state.appendChild(button);
    }
    return state;
  };

  const setBusy = (host, busy) => {
    host.setAttribute("aria-busy", busy ? "true" : "false");
  };

  const renderProducts = (payload) => {
    const products = Array.isArray(payload?.products) ? payload.products : [];
    const categories = Array.isArray(payload?.categories) ? payload.categories : [];
    const categoryNames = new Map(categories.map((category) => [String(category.id), category.name]));
    const published = products.filter((product) =>
      product && product.id && product.title && product.status === "published"
    );
    if (!published.length) {
      productHost.replaceChildren(makeState(
        "The catalog is taking shape.",
        "There are no live listings to show right now. Browse the full catalog to check again."
      ));
      return;
    }

    const cards = published.slice(0, 8).map((product) => {
      const card = element("a", "market-card");
      const target = new URL("/catalog", window.location.origin);
      target.searchParams.set("product", String(product.id));
      card.href = target.pathname + target.search;
      card.setAttribute("aria-label", `View ${product.title} in the live catalog`);

      const art = element("div", "market-card-art");
      const imageUrl = safeImageUrl(product.image_url);
      if (imageUrl) {
        const image = element("img");
        image.src = imageUrl;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.addEventListener("error", () => image.remove(), { once: true });
        art.appendChild(image);
      }

      const copy = element("div", "market-card-copy");
      const category = categoryNames.get(String(product.category_id));
      copy.appendChild(element("span", "market-card-type",
        textValue(category, textValue(product.listing_type, "Marketplace listing"))));
      copy.appendChild(element("h3", "", product.title));
      if (product.description) copy.appendChild(element("p", "market-card-description", product.description));
      copy.appendChild(element("div", "market-card-price", moneyLabel(product.price, product.currency)));
      copy.appendChild(element("span", "market-card-link", "View listing"));
      card.append(art, copy);
      return card;
    });
    productHost.replaceChildren(...cards);
  };

  const renderBusinesses = (payload) => {
    const businesses = Array.isArray(payload?.businesses) ? payload.businesses : [];
    const approved = businesses.filter((business) =>
      business && business.id && business.store_name && business.status === "approved"
    );
    if (!approved.length) {
      businessHost.replaceChildren(makeState(
        "Your next favorite is still out there.",
        "No approved businesses with published listings are available to feature yet."
      ));
      return;
    }
    const cards = approved.slice(0, 6).map((business) => {
      const card = element("a", "business-card");
      const target = new URL("/catalog", window.location.origin);
      target.searchParams.set("seller", String(business.id));
      card.href = target.pathname + target.search;
      card.setAttribute("aria-label", `Browse listings from ${business.store_name}`);
      const initials = business.store_name.trim().slice(0, 1).toLocaleUpperCase();
      const mark = element("span", "business-mark", initials);
      const copy = element("div");
      copy.appendChild(element("h3", "", business.store_name));
      if (business.description) copy.appendChild(element("p", "", business.description));
      copy.appendChild(element("span", "", "Explore this store"));
      card.append(mark, copy);
      return card;
    });
    businessHost.replaceChildren(...cards);
  };

  async function loadProducts() {
    setBusy(productHost, true);
    try {
      const response = await fetch("/api/catalog", {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
      renderProducts(await response.json());
    } catch (_) {
      productHost.replaceChildren(makeState(
        "Live listings could not be loaded.",
        "Check your connection and try again. Sample items are kept separate below.",
        loadProducts
      ));
    } finally {
      setBusy(productHost, false);
    }
  }

  async function loadBusinesses() {
    setBusy(businessHost, true);
    try {
      const response = await fetch("/api/businesses", {
        method: "GET",
        headers: { Accept: "application/json" },
        credentials: "same-origin"
      });
      if (!response.ok) throw new Error(`Business request failed (${response.status}).`);
      renderBusinesses(await response.json());
    } catch (_) {
      businessHost.replaceChildren(makeState(
        "Business profiles are unavailable just now.",
        "Please try again in a moment. No sample businesses are substituted.",
        loadBusinesses
      ));
    } finally {
      setBusy(businessHost, false);
    }
  }

  loadProducts();
  loadBusinesses();
})();
