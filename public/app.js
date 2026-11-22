const icons = {
  brand: '<path d="M4 8.4 12 4l8 4.4v7.2L12 20l-8-4.4z"/><path d="m4 8.4 8 4.5 8-4.5M12 13v7M8 6.3l8 4.5"/>',
  workspace: '<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M9 4.5v15"/>',
  orders: '<path d="M8 5H6a2 2 0 0 0-2 2v13h16V7a2 2 0 0 0-2-2h-2M8 12h8m-8 4h5"/><rect x="8" y="3" width="8" height="4" rx="1.5"/>',
  catalogue: '<path d="m3.5 7.5 8.5-4.5 8.5 4.5v9L12 21l-8.5-4.5zM3.5 7.5 12 12l8.5-4.5M12 12v9M8 5.1l8.5 4.5"/>',
  packed: '<path d="M3 8h18l-2-4H5L3 8Zm1 0v12h16V8m-11 4h6"/>',
  truck: '<path d="M2.5 6h12v11H9m-4 0H2.5V6Zm12 4h4l3 4v3h-3m-4 0h1"/><circle cx="7" cy="17" r="2"/><circle cx="17.5" cy="17" r="2"/>',
  ban: '<circle cx="12" cy="12" r="8.5"/><path d="m6 6 12 12"/>',
  'chevron-right': '<path d="m9 6 6 6-6 6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="5.5"/><path d="m15 15 4.5 4.5"/>',
  filter: '<path d="M4 7h16M7 12h10m-7 5h4"/>',
  check: '<path d="m5 12 4.5 4.5L19 7"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4m0 4h.01"/>',
  bag: '<path d="M5 8h14l1 13H4L5 8Zm4 2V6a3 3 0 0 1 6 0v4"/>',
};

const statuses = [
  {name: "Placed", icon: "orders", description: "Awaiting packing"},
  {name: "Packed", icon: "packed", description: "Ready to ship"},
  {name: "Shipped", icon: "truck", description: "Dispatched"},
  {name: "Cancelled", icon: "ban", description: "Stock restored"},
];

const pages = {
  orders: {title: "Orders", description: "Create orders and track fulfilment in one place."},
  catalogue: {title: "Catalogue", description: "Check availability across your product inventory."},
  "new-order": {title: "New order", description: "Add products from the catalogue and review the order total."},
};

const state = {
  page: "orders",
  counts: null,
  orders: [],
  order: null,
  selected: null,
  orderRequest: 0,
  detailRequest: 0,
  productRequest: 0,
  products: [],
  basket: new Map(),
  placing: false,
  changingStatus: false,
  basketError: "",
};

const $ = (id) => document.getElementById(id);
const search = $("order-search");
const filter = $("order-filter");
const results = $("order-results");
const detail = $("order-detail");
const grid = $("product-grid");
const basket = $("basket");
const dialog = $("cancel-dialog");

const currency = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"});
const dateTime = new Intl.DateTimeFormat("en-US", {dateStyle: "medium", timeStyle: "short"});
const date = new Intl.DateTimeFormat("en-US", {month: "short", day: "numeric", year: "numeric"});

const money = (cents) => currency.format(cents / 100);
const units = (count) => `${count} ${count === 1 ? "item" : "items"}`;
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character]);

document.querySelectorAll("[data-icon]").forEach((element) => {
  element.innerHTML = icon(element.dataset.icon);
});

function photo(item, className) {
  return `<img class="${className}" src="/catalogue/${escapeHtml(item.image)}.webp" alt="" width="416" height="416">`;
}

async function api(path, options) {
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error("The console could not reach the server. Check the connection and try again.");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The server could not complete the request.");
  return body;
}

function send(path, method, payload) {
  return api(path, {
    method,
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(payload),
  });
}

function notice(message, tone = "success") {
  $("notice").hidden = !message;
  $("notice").className = `notice ${tone}`;
  $("notice-icon").innerHTML = icon(tone === "error" ? "alert" : "check");
  $("notice-message").textContent = message;
}

function placeholder(symbol, title, description, action = "") {
  return `<div class="placeholder">
    <span class="placeholder-icon">${icon(symbol)}</span>
    <strong>${title}</strong>
    <p>${description}</p>
    ${action}
  </div>`;
}

function badge(status) {
  return `<span class="badge ${status.toLowerCase()}">${escapeHtml(status)}</span>`;
}

function renderMetrics() {
  $("metrics").innerHTML = statuses.map(({name, icon: symbol, description}) => `
    <button class="metric ${name.toLowerCase()}" data-status="${name}" aria-pressed="${filter.value === name}">
      <span class="metric-top"><span class="metric-icon">${icon(symbol)}</span><span>${name}</span></span>
      <strong>${state.counts?.[name] ?? "—"}</strong>
      <span class="metric-description">${description}</span>
    </button>`).join("");
}

function renderOrders() {
  const rows = state.orders;
  $("list-count").textContent = rows.length;
  $("list-footer").hidden = !rows.length;
  $("list-footer").textContent = `Showing ${rows.length} ${rows.length === 1 ? "order" : "orders"}`;
  if (!rows.length) {
    const filtered = search.value.trim() || filter.value;
    results.innerHTML = filtered
      ? placeholder("search", "No matching orders", "Try a different reference or clear your filters.",
        '<button class="button secondary compact" data-action="clear-filters">Clear filters</button>')
      : placeholder("orders", "No orders yet", "Create an order to start tracking fulfilment.",
        '<a class="button secondary compact" href="#new-order">Create an order</a>');
    return;
  }
  results.innerHTML = `
    <table class="orders-table">
      <thead><tr><th scope="col">Reference</th><th scope="col">Created</th><th scope="col">Total</th><th scope="col">Status</th><th scope="col" class="row-arrow"><span class="sr-only">Open</span></th></tr></thead>
      <tbody>${rows.map((order) => `
        <tr data-order="${order.reference}" class="${state.selected === order.reference ? "selected" : ""}">
          <td><button class="order-link" data-reference="${order.reference}" aria-expanded="${state.selected === order.reference}" aria-controls="order-detail">${order.reference}</button>
              <span class="order-muted">${units(order.units)}</span></td>
          <td class="order-date"><time datetime="${escapeHtml(order.created_at)}">${date.format(new Date(order.created_at))}</time></td>
          <td class="order-amount">${money(order.total_cents)}</td>
          <td>${badge(order.status)}</td>
          <td class="row-arrow">${icon("chevron-right")}</td>
        </tr>`).join("")}
      </tbody>
    </table>`;
}

function highlightOrder() {
  results.querySelectorAll("[data-order]").forEach((row) => {
    const active = row.dataset.order === state.selected;
    row.classList.toggle("selected", active);
    row.querySelector("[data-reference]").setAttribute("aria-expanded", active);
  });
}

function fulfilment(order) {
  if (order.status === "Cancelled") {
    return '<p class="cancelled-note">This order was cancelled and its stock was restored.</p>';
  }
  const stages = statuses.slice(0, 3);
  const current = stages.findIndex((stage) => stage.name === order.status);
  return `<ol class="fulfilment" aria-label="Fulfilment progress">
    ${stages.map(({name, icon: symbol}, index) => `
      <li class="${index < current ? "completed" : index === current ? "current" : ""}" ${index === current ? 'aria-current="step"' : ""}>
        <span class="stage-icon">${icon(index < current ? "check" : symbol)}</span>
        <span>${name}</span>
      </li>`).join("")}
  </ol>`;
}

function renderDetail(order = state.order, message) {
  if (!order) {
    detail.innerHTML = placeholder(
      "orders", message ? "Order details" : "Select an order",
      message ? escapeHtml(message) : "Choose an order to see its items and fulfilment status."
    );
    return;
  }
  const next = {Placed: "Packed", Packed: "Shipped"}[order.status];
  detail.innerHTML = `
    <div class="detail-header">
      <div class="detail-label">${icon("orders")} <span>Order details</span></div>
      <div class="detail-title">
        <div><h2 tabindex="-1" id="detail-title">${order.reference}</h2>
          <time datetime="${escapeHtml(order.created_at)}">${dateTime.format(new Date(order.created_at))}</time></div>
        ${badge(order.status)}
      </div>
    </div>
    <div class="detail-section">
      <h3>Fulfilment</h3>
      ${fulfilment(order)}
    </div>
    <div class="detail-section lines-section">
      <div class="line-heading"><h3>Order items</h3><span>${units(order.units)}</span></div>
      <ul class="lines">
        ${order.items.map((item) => `
          <li class="detail-line">
            ${photo(item, "thumbnail")}
            <div class="line-info"><strong>${escapeHtml(item.name)}</strong><small>Qty ${item.quantity} × ${money(item.unit_cents)}</small></div>
            <strong>${money(item.subtotal_cents)}</strong>
          </li>`).join("")}
      </ul>
    </div>
    <div class="detail-total"><span>Order total</span><strong>${money(order.total_cents)}</strong></div>
    ${next ? `<div class="detail-actions">
      <button class="button primary" data-next="${next}" ${state.changingStatus ? "disabled" : ""}>
        ${icon(next === "Packed" ? "packed" : "truck")} Mark as ${next.toLowerCase()}
      </button>
      <button class="button cancel-link" data-action="confirm-cancel" ${state.changingStatus ? "disabled" : ""}>Cancel order</button>
    </div>` : ""}`;
}

async function selectOrder(reference, scroll = false) {
  const request = ++state.detailRequest;
  state.selected = reference;
  state.order = null;
  highlightOrder();
  if (!reference) {
    renderDetail();
    return;
  }
  renderDetail(null, "Loading order details…");
  try {
    const order = await api(`/api/orders/${reference}`);
    if (request !== state.detailRequest) return;
    state.order = order;
    renderDetail();
    if (scroll && state.page === "orders" && window.matchMedia("(max-width: 1120px)").matches) {
      $("detail-title").focus({preventScroll: true});
      detail.scrollIntoView({block: "start", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
    }
  } catch (error) {
    if (request === state.detailRequest) renderDetail(null, error.message);
  }
}

async function loadOrders({keepDetail = false} = {}) {
  const request = ++state.orderRequest;
  results.setAttribute("aria-busy", "true");
  const query = new URLSearchParams({q: search.value, status: filter.value});
  try {
    const data = await api(`/api/orders?${query}`);
    if (request !== state.orderRequest) return;
    state.orders = data.orders;
    state.counts = data.counts;
    renderMetrics();
    renderOrders();
    if (keepDetail && state.order) return;
    const reference = data.orders.find((order) => order.reference === state.selected)?.reference ??
      data.orders[0]?.reference ?? null;
    if (state.selected !== reference || !state.order) await selectOrder(reference);
  } catch (error) {
    if (request !== state.orderRequest) return;
    $("list-count").textContent = "";
    $("list-footer").hidden = true;
    results.innerHTML = placeholder("alert", "Could not load orders", escapeHtml(error.message),
      '<button class="button secondary compact" data-action="retry-orders">Retry</button>');
  } finally {
    if (request === state.orderRequest) results.setAttribute("aria-busy", "false");
  }
}

function updateFilter(status) {
  filter.value = status;
  renderMetrics();
  loadOrders();
}

function stockLabel(stock) {
  if (!stock) return '<span class="stock out">Out of stock</span>';
  return `<span class="stock ${stock <= 5 ? "low" : "in"}">${stock} in stock</span>`;
}

function renderProducts() {
  $("product-count").textContent = state.products.length || "";
  grid.innerHTML = state.products.map((product) => {
    const quantity = state.basket.get(product.id) || 0;
    const limit = quantity >= product.stock;
    return `<article class="product-card">
      <div class="product-image">
        ${photo(product, "catalogue-photo")}
        ${stockLabel(product.stock)}
      </div>
      <div class="product-content">
        <div class="product-meta">${escapeHtml(product.sku)} <span aria-hidden="true">·</span> ${escapeHtml(product.category)}</div>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="product-action">
          <strong>${money(product.unit_cents)}</strong>
          <button class="button secondary compact" data-add="${product.id}" aria-label="Add ${escapeHtml(product.name)}" ${limit || state.placing ? "disabled" : ""}>
            ${limit ? (product.stock ? "Max added" : "Unavailable") : `${icon("plus")} Add`}
          </button>
        </div>
      </div>
    </article>`;
  }).join("");
}

function renderBasket() {
  let total = 0;
  let count = 0;
  let overStock = false;
  const lines = state.products.filter((product) => state.basket.has(product.id)).map((product) => {
    const quantity = state.basket.get(product.id);
    const shortage = quantity > product.stock;
    overStock ||= shortage;
    count += quantity;
    total += product.unit_cents * quantity;
    return `<li class="basket-line">
      ${photo(product, "thumbnail")}
      <div class="line-info"><strong>${escapeHtml(product.name)}</strong><small>${money(product.unit_cents)} each</small>
        ${shortage ? `<small class="line-error">Only ${product.stock} available</small>` : ""}
      </div>
      <strong>${money(product.unit_cents * quantity)}</strong>
      <div class="quantity" aria-label="Quantity for ${escapeHtml(product.name)}">
        <button class="icon-button" data-remove="${product.id}" aria-label="${quantity === 1 ? "Remove" : "Decrease"} ${escapeHtml(product.name)}" ${state.placing ? "disabled" : ""}>${icon("minus")}</button>
        <span aria-label="Quantity">${quantity}</span>
        <button class="icon-button" data-increase="${product.id}" aria-label="Increase ${escapeHtml(product.name)}" ${quantity >= product.stock || state.placing ? "disabled" : ""}>${icon("plus")}</button>
      </div>
    </li>`;
  });
  basket.innerHTML = `
    <div class="basket-header">
      <span class="metric-icon">${icon("bag")}</span>
      <div><h2 id="basket-title" tabindex="-1">Order summary</h2><p>${units(count)}</p></div>
    </div>
    ${lines.length ? `<ul class="lines basket-lines">${lines.join("")}</ul>` :
      placeholder("catalogue", "Your order is empty", "Add products to start building the order.")}
    <div class="basket-submit">
      <div class="detail-total"><span>Order total</span><strong>${money(total)}</strong></div>
      ${state.basketError ? `<p class="line-error basket-error" role="alert">${escapeHtml(state.basketError)}</p>` : ""}
      <button class="button primary" data-action="place-order" ${!lines.length || state.placing || overStock ? "disabled" : ""}>
        ${icon("check")} ${state.placing ? "Placing order…" : "Place order"}
      </button>
    </div>`;
  const summaryButton = $("mobile-summary");
  summaryButton.hidden = !count || state.page !== "new-order";
  summaryButton.textContent = `View order · ${units(count)}`;
}

async function loadProducts() {
  const request = ++state.productRequest;
  try {
    const data = await api("/api/products");
    if (request !== state.productRequest) return;
    state.products = data.products;
    renderProducts();
    renderBasket();
  } catch (error) {
    if (request !== state.productRequest) return;
    grid.innerHTML = placeholder("alert", "Could not load products", escapeHtml(error.message),
      '<button class="button secondary compact" data-action="retry-products">Retry</button>');
  }
}

function updateBasket(productId, delta, control) {
  if (state.placing) return;
  const product = state.products.find((item) => item.id === productId);
  const quantity = (state.basket.get(productId) || 0) + delta;
  if (delta > 0 && quantity > product.stock) return;
  if (quantity < 1) state.basket.delete(productId);
  else state.basket.set(productId, quantity);
  state.basketError = "";
  notice("");
  renderProducts();
  renderBasket();
  if (state.page === "catalogue") {
    location.hash = "new-order";
  } else {
    const replacement = document.querySelector(`[data-${control}="${productId}"]:enabled`);
    const focusTarget = replacement ?? document.querySelector(`[data-remove="${productId}"]:enabled, [data-add="${productId}"]:enabled`);
    focusTarget?.focus({preventScroll: true});
  }
}

function resetFilters() {
  search.value = "";
  filter.value = "";
}

function resetPage() {
  const hash = location.hash.slice(1);
  if (hash === "main") return;
  const previous = state.page;
  state.page = Object.hasOwn(pages, hash) ? hash : "orders";
  const page = pages[state.page];
  const ordersPage = state.page === "orders";
  const building = state.page === "new-order";

  document.title = `${page.title} · Dispatch`;
  $("page-title").textContent = page.title;
  $("page-description").textContent = page.description;
  $("breadcrumb-current").textContent = page.title;
  $("nav-orders").setAttribute("aria-current", ordersPage ? "page" : building ? "location" : "false");
  $("nav-catalogue").setAttribute("aria-current", state.page === "catalogue" ? "page" : "false");
  $("new-order").hidden = building;
  $("back-orders").hidden = !building;
  $("orders-view").hidden = !ordersPage;
  $("products-view").hidden = ordersPage;
  $("product-layout").classList.toggle("with-basket", building);
  basket.hidden = !building;

  if (ordersPage) {
    renderMetrics();
    loadOrders();
  } else {
    renderBasket();
    if (!state.products.length) grid.innerHTML = placeholder("catalogue", "Loading catalogue…", "");
    loadProducts();
  }
  if (previous !== state.page) {
    $("main").focus({preventScroll: true});
    window.scrollTo(0, 0);
  }
}

async function place() {
  if (state.placing || !state.basket.size) return;
  state.placing = true;
  state.basketError = "";
  notice("");
  renderBasket();
  renderProducts();
  try {
    const items = Array.from(state.basket, ([product_id, quantity]) => ({product_id, quantity}));
    const order = await send("/api/orders", "POST", {items});
    state.basket.clear();
    resetFilters();
    state.selected = order.reference;
    state.order = order;
    ++state.detailRequest;
    renderDetail();
    notice(`Order ${order.reference} placed. Inventory updated.`);
    if (state.page === "orders") {
      renderMetrics();
      loadOrders();
    } else {
      location.hash = "orders";
    }
  } catch (error) {
    state.basketError = error.message;
    notice(error.message, "error");
    await loadProducts();
  } finally {
    state.placing = false;
    renderProducts();
    renderBasket();
  }
}

async function setStatus(reference, status) {
  if (state.changingStatus || !reference) return;
  state.changingStatus = true;
  notice("");
  renderDetail();
  try {
    const order = await send(`/api/orders/${reference}/status`, "PATCH", {status});
    if (state.selected === reference) state.order = order;
    notice(status === "Cancelled"
      ? `Order ${reference} cancelled. Stock restored.`
      : `Order ${reference} marked as ${status.toLowerCase()}.`);
  } catch (error) {
    notice(error.message, "error");
    if (state.selected === reference) await selectOrder(reference);
  } finally {
    state.changingStatus = false;
    renderDetail();
    loadOrders({keepDetail: true});
    if (state.page !== "orders") loadProducts();
  }
}

let searchTimer;
search.addEventListener("input", () => {
  clearTimeout(searchTimer);
  ++state.orderRequest;
  searchTimer = setTimeout(() => loadOrders(), 140);
});
filter.addEventListener("change", () => updateFilter(filter.value));
$("metrics").addEventListener("click", (event) => {
  const button = event.target.closest("[data-status]");
  if (button) {
    const status = button.dataset.status;
    updateFilter(filter.value === status ? "" : status);
    $("metrics").querySelector(`[data-status="${status}"]`).focus({preventScroll: true});
  }
});
results.addEventListener("click", (event) => {
  const row = event.target.closest("[data-order]");
  if (row) selectOrder(row.dataset.order, true);
});
$("dismiss-notice").addEventListener("click", () => notice(""));
$("mobile-summary").addEventListener("click", () => {
  $("basket-title").focus();
});
let cancellationReference;
dialog.addEventListener("close", () => {
  if (dialog.returnValue === "cancel") setStatus(cancellationReference, "Cancelled");
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button || button.disabled) return;
  const {add, increase, remove, next, action} = button.dataset;
  if (add) updateBasket(Number(add), 1, "add");
  if (increase) updateBasket(Number(increase), 1, "increase");
  if (remove) updateBasket(Number(remove), -1, "remove");
  if (next) setStatus(state.selected, next);
  if (action === "clear-filters") {
    resetFilters();
    updateFilter("");
    search.focus();
  }
  if (action === "retry-orders") loadOrders();
  if (action === "retry-products") loadProducts();
  if (action === "place-order") place();
  if (action === "confirm-cancel") {
    cancellationReference = state.selected;
    dialog.returnValue = "";
    $("cancel-description").textContent = `Cancel ${cancellationReference} and return its items to available inventory?`;
    dialog.showModal();
  }
});

window.addEventListener("hashchange", resetPage);
renderDetail();
results.innerHTML = placeholder("orders", "Loading orders…", "");
resetPage();
