"use strict";

// ===== Настройки магазина =====
const SHOP = {
  name: "SOHTMON",
  phone: "+992784970007",
  warehouse: "Кулангир",
  currency: "сомони",
};

// Каталог: чтобы добавить товар, добавьте объект в этот массив.
const PRODUCTS = [
  {
    id: "mysalon-220",
    name: "Бетономешалка MYSALON",
    volume: "220 л",
    motor: "1.2 кВт",
    price: 2500,
    emoji: "🏗️",
  },
];

const HISTORY_KEY = "sohtmon_orders";

// ===== Состояние =====
let selected = null;

// ===== Утилиты =====
const $ = (id) => document.getElementById(id);
const fmt = (n) => n.toLocaleString("ru-RU");

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const c of children) node.append(c);
  return node;
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    return [];
  }
}

function saveHistory(list) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch {
    /* хранилище недоступно — просто не сохраняем */
  }
}

// ===== Каталог =====
function renderCatalog() {
  const root = $("catalog");
  root.innerHTML = "";
  for (const p of PRODUCTS) {
    root.append(
      el("article", { class: "card" },
        el("div", { class: "emoji" }, p.emoji),
        el("h3", {}, p.name),
        el("p", {}, `📦 Объём: ${p.volume}`),
        el("p", {}, `⚙️ Мотор: ${p.motor}`),
        el("p", { class: "price" }, `${fmt(p.price)} ${SHOP.currency}`),
        el("p", {}, `📍 Склад: ${SHOP.warehouse}`),
        el("button", { class: "btn primary", type: "button", onclick: () => order(p.id) }, "Заказать")
      )
    );
  }
}

// ===== Заказ =====
function order(productId) {
  selected = PRODUCTS.find((p) => p.id === productId) || PRODUCTS[0];
  $("selected").textContent = `${selected.emoji} ${selected.name} — ${fmt(selected.price)} ${SHOP.currency}`;
  $("order").classList.remove("hidden");
  updateTotal();
  $("order").scrollIntoView({ behavior: "smooth" });
}

function getQty() {
  const q = parseInt($("qty").value, 10);
  return Number.isFinite(q) ? Math.min(99, Math.max(1, q)) : 1;
}

function updateTotal() {
  if (!selected) return;
  $("total").textContent = fmt(selected.price * getQty());
}

function buildMessage(o) {
  const lines = [
    `Здравствуйте! Заказ ${SHOP.name}:`,
    `Товар: ${o.product}`,
    `Количество: ${o.qty}`,
    `Сумма: ${fmt(o.total)} ${SHOP.currency}`,
    `Получение: ${o.delivery === "delivery" ? "доставка — " + o.address : "самовывоз (" + SHOP.warehouse + ")"}`,
    `Имя: ${o.name}`,
    `Телефон: ${o.phone}`,
  ];
  if (o.comment) lines.push(`Комментарий: ${o.comment}`);
  return lines.join("\n");
}

function validate(o) {
  if (!o.name) return "Укажите имя.";
  if (o.phone.replace(/\D/g, "").length < 9) return "Укажите корректный телефон.";
  if (o.delivery === "delivery" && !o.address) return "Укажите адрес доставки.";
  return "";
}

function submitOrder(e) {
  e.preventDefault();
  const form = $("order-form");
  const o = {
    product: selected.name,
    qty: getQty(),
    total: selected.price * getQty(),
    delivery: form.delivery.value,
    address: $("address").value.trim(),
    name: $("name").value.trim(),
    phone: $("phone").value.trim(),
    comment: $("comment").value.trim(),
    date: new Date().toISOString(),
  };

  const err = validate(o);
  $("error").textContent = err;
  if (err) return;

  const history = loadHistory();
  history.unshift(o);
  saveHistory(history.slice(0, 20));
  renderHistory();

  const url = `https://wa.me/${SHOP.phone.replace(/\D/g, "")}?text=${encodeURIComponent(buildMessage(o))}`;
  window.open(url, "_blank");
}

// ===== История =====
function renderHistory() {
  const list = loadHistory();
  $("history-section").classList.toggle("hidden", list.length === 0);
  const root = $("history");
  root.innerHTML = "";
  for (const o of list) {
    const d = new Date(o.date).toLocaleString("ru-RU");
    root.append(el("li", {}, `${d} — ${o.product} × ${o.qty} = ${fmt(o.total)} ${SHOP.currency}`));
  }
}

// ===== Запуск =====
document.addEventListener("DOMContentLoaded", () => {
  renderCatalog();
  renderHistory();

  $("call").href = `tel:${SHOP.phone}`;

  $("qty").addEventListener("input", updateTotal);
  $("qty").addEventListener("change", () => { $("qty").value = getQty(); updateTotal(); });
  document.querySelectorAll(".qty button").forEach((b) =>
    b.addEventListener("click", () => {
      $("qty").value = getQty() + Number(b.dataset.step);
      $("qty").value = getQty();
      updateTotal();
    })
  );

  document.querySelectorAll('input[name="delivery"]').forEach((r) =>
    r.addEventListener("change", () =>
      $("address-field").classList.toggle("hidden", r.value !== "delivery" || !r.checked)
    )
  );

  $("order-form").addEventListener("submit", submitOrder);
  $("clear-history").addEventListener("click", () => { saveHistory([]); renderHistory(); });
});
