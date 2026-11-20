"use strict";

/* ==========================================================
   SOHTMON ERP — учёт продаж, склада, закупок, клиентов,
   расходов и финансов. Данные хранятся в браузере
   (localStorage). Делайте резервные копии в «Настройках».
   ========================================================== */

const STORAGE_KEY = "sohtmon_erp_v1";

const STATUSES = {
  new: "Новый",
  confirmed: "Подтверждён",
  shipped: "Отгружен",
  done: "Выполнен",
  cancelled: "Отменён",
};

const EXPENSE_CATEGORIES = ["Аренда", "Зарплата", "Транспорт", "Реклама", "Коммунальные", "Налоги", "Прочее"];

// ===== Утилиты =====
const $ = (id) => document.getElementById(id);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const round2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => round2(n).toLocaleString("ru-RU");
const money = (n) => `${fmt(n)} ${db.settings.currency}`;
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

function today() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function monthStart() { return today().slice(0, 8) + "01"; }
function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (k === "value") node.value = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    node.append(c instanceof Node ? c : String(c));
  }
  return node;
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove("show"), 2500);
}

function download(filename, content, type) {
  const blob = new Blob([content], { type });
  const a = el("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ===== База данных =====
function defaultDB() {
  return {
    settings: { name: "SOHTMON", phone: "+992784970007", warehouse: "Кулангир", currency: "сомони" },
    products: [
      { id: uid(), sku: "MYS-220", name: "Бетономешалка MYSALON 220 л", unit: "шт", cost: 0, price: 2500, initialStock: 0, minStock: 2, note: "Мотор 1.2 кВт" },
    ],
    clients: [],
    suppliers: [],
    sales: [],
    purchases: [],
    expenses: [],
    seq: { sale: 0, purchase: 0 },
  };
}

function loadDB() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (data && Array.isArray(data.products)) {
      const base = defaultDB();
      return { ...base, ...data, settings: { ...base.settings, ...data.settings }, seq: { ...base.seq, ...data.seq } };
    }
  } catch { /* повреждённые данные — начинаем заново */ }
  return defaultDB();
}

let db = loadDB();

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    toast("⚠️ Не удалось сохранить данные в браузере");
  }
}

// ===== Расчёты =====
const byId = (list, id) => db[list].find((x) => x.id === id);
const productName = (id) => byId("products", id)?.name || "— удалённый товар —";
const clientName = (id) => byId("clients", id)?.name || "Розничный покупатель";
const supplierName = (id) => byId("suppliers", id)?.name || "—";

const isActive = (s) => s.status !== "cancelled";
const itemsSum = (items, key) => sum(items, (i) => num(i.qty) * num(i[key]));
const saleTotal = (s) => Math.max(0, itemsSum(s.items, "price") - num(s.discount) + num(s.deliveryFee));
const saleCost = (s) => itemsSum(s.items, "cost");
const saleDebt = (s) => (isActive(s) ? Math.max(0, saleTotal(s) - num(s.paid)) : 0);
const purchaseTotal = (p) => itemsSum(p.items, "cost");
const purchaseDebt = (p) => Math.max(0, purchaseTotal(p) - num(p.paid));

function stockOf(productId, exclude = {}) {
  const p = byId("products", productId);
  let qty = num(p?.initialStock);
  for (const pu of db.purchases) {
    if (pu.id === exclude.purchaseId) continue;
    for (const i of pu.items) if (i.productId === productId) qty += num(i.qty);
  }
  for (const s of db.sales) {
    if (!isActive(s) || s.id === exclude.saleId) continue;
    for (const i of s.items) if (i.productId === productId) qty -= num(i.qty);
  }
  return round2(qty);
}

const inPeriod = (d, from, to) => (!from || d >= from) && (!to || d <= to);

function periodSummary(from, to) {
  const sales = db.sales.filter((s) => isActive(s) && inPeriod(s.date, from, to));
  const expenses = db.expenses.filter((e) => inPeriod(e.date, from, to));
  const revenue = sum(sales, saleTotal);
  const cost = sum(sales, saleCost);
  const exp = sum(expenses, (e) => num(e.amount));
  return { sales, expenses, revenue, cost, gross: revenue - cost, exp, net: revenue - cost - exp };
}

// ===== Общие элементы интерфейса =====
function table(columns, rows, opts = {}) {
  const head = el("tr", {}, columns.map((c) => el("th", { class: c.num ? "num" : null }, c.label)));
  const body = rows.length
    ? rows.map((r) => el("tr", {}, columns.map((c) => el("td", { class: c.num ? "num" : c.cls || null }, c.get(r)))))
    : [el("tr", {}, el("td", { colspan: columns.length, class: "empty" }, opts.empty || "Нет данных"))];
  const foot = opts.footer
    ? el("tfoot", {}, el("tr", {}, columns.map((c, i) => el("td", { class: c.num ? "num" : null }, opts.footer[i] ?? ""))))
    : null;
  return el("div", { class: "table-wrap" }, el("table", {}, el("thead", {}, head), el("tbody", {}, body), foot));
}

const panel = (title, ...content) => el("section", { class: "panel" }, title ? el("h2", {}, title) : null, ...content);
const kpi = (label, value, sub, cls) => el("div", { class: "kpi" }, el("div", { class: "label" }, label), el("div", { class: "value " + (cls || "") }, value), sub ? el("div", { class: "sub" }, sub) : null);
const badge = (status) => el("span", { class: "badge " + status }, STATUSES[status] || status);
const iconBtn = (icon, title, onclick) => el("button", { type: "button", class: "icon-btn", title, "aria-label": title, onclick }, icon);

function setActions(...buttons) {
  const root = $("page-actions");
  root.innerHTML = "";
  root.append(...buttons);
}
const actionBtn = (label, onclick, cls = "btn primary") => el("button", { type: "button", class: cls, onclick }, label);

function searchBox(placeholder, onInput) {
  return el("input", { type: "search", placeholder, oninput: (e) => onInput(e.target.value.trim().toLowerCase()) });
}
const matches = (q, ...vals) => !q || vals.some((v) => String(v ?? "").toLowerCase().includes(q));

function confirmDelete(what) {
  return window.confirm(`Удалить ${what}? Это действие нельзя отменить.`);
}

// ===== Модальное окно с формой =====
let modalSubmit = null;

function openModal(title, bodyNode, onSubmit) {
  $("modal-title").textContent = title;
  $("modal-body").innerHTML = "";
  $("modal-body").append(bodyNode);
  $("modal-error").textContent = "";
  modalSubmit = onSubmit;
  $("modal").showModal();
  const first = $("modal-body").querySelector("input, select, textarea");
  if (first) first.focus();
}
function closeModal() { $("modal").close(); }

function fieldInput(f, value) {
  const common = { name: f.key, id: "f-" + f.key, required: f.required || null };
  if (f.type === "select") {
    return el("select", common, f.options.map(([v, label]) => {
      const o = el("option", { value: v }, label);
      if (String(v) === String(value ?? "")) o.selected = true;
      return o;
    }));
  }
  if (f.type === "textarea") return el("textarea", { ...common, rows: 2 }, value ?? "");
  return el("input", {
    ...common,
    type: f.type || "text",
    value: value ?? "",
    step: f.type === "number" ? "any" : null,
    min: f.min ?? null,
    placeholder: f.placeholder || null,
    list: f.list || null,
  });
}

function fieldsBlock(fields, data = {}) {
  return el("div", { class: "fields" }, fields.map((f) =>
    el("label", { class: "field" + (f.wide ? " wide" : "") }, f.label + (f.required ? " *" : ""), fieldInput(f, data[f.key] ?? f.default))
  ));
}

function readFields(fields) {
  const out = {};
  for (const f of fields) {
    const v = $("f-" + f.key).value;
    out[f.key] = f.type === "number" ? num(v) : v.trim();
  }
  return out;
}

function openForm(title, fields, data, onSave) {
  openModal(title, fieldsBlock(fields, data), () => {
    const values = readFields(fields);
    for (const f of fields) {
      if (f.required && (values[f.key] === "" || values[f.key] === undefined)) return `Заполните поле «${f.label}».`;
    }
    return onSave(values);
  });
}

// ===== Справочники (товары, клиенты, поставщики, расходы) =====
const PRODUCT_FIELDS = [
  { key: "name", label: "Название", required: true, wide: true },
  { key: "sku", label: "Артикул" },
  { key: "unit", label: "Ед. изм.", default: "шт" },
  { key: "cost", label: "Себестоимость", type: "number", min: 0, default: 0 },
  { key: "price", label: "Цена продажи", type: "number", min: 0, default: 0 },
  { key: "initialStock", label: "Начальный остаток", type: "number", default: 0 },
  { key: "minStock", label: "Мин. остаток (сигнал)", type: "number", min: 0, default: 0 },
  { key: "note", label: "Описание", type: "textarea", wide: true },
];
const CLIENT_FIELDS = [
  { key: "name", label: "Имя / компания", required: true },
  { key: "phone", label: "Телефон", type: "tel", placeholder: "+992 ..." },
  { key: "address", label: "Адрес", wide: true },
  { key: "note", label: "Заметка", type: "textarea", wide: true },
];
const SUPPLIER_FIELDS = CLIENT_FIELDS.map((f) => (f.key === "name" ? { ...f, label: "Название" } : f));
const expenseFields = () => [
  { key: "date", label: "Дата", type: "date", required: true, default: today() },
  { key: "category", label: "Категория", type: "select", options: EXPENSE_CATEGORIES.map((c) => [c, c]), default: "Прочее" },
  { key: "amount", label: "Сумма", type: "number", min: 0, required: true },
  { key: "note", label: "Описание", wide: true },
];

function editRecord(list, fields, title, record) {
  openForm(record ? `${title}: редактирование` : `${title}: новый`, fields, record || {}, (values) => {
    if (list === "expenses" && values.amount <= 0) return "Сумма должна быть больше нуля.";
    if (record) Object.assign(record, values);
    else db[list].push({ id: uid(), ...values });
    save();
    closeModal();
    render();
    toast("Сохранено");
  });
}

function deleteRecord(list, record, label) {
  if (list === "products" && (db.sales.some((s) => s.items.some((i) => i.productId === record.id)) || db.purchases.some((p) => p.items.some((i) => i.productId === record.id)))) {
    return toast("Товар используется в документах — удалить нельзя");
  }
  if (list === "clients" && db.sales.some((s) => s.clientId === record.id)) return toast("У клиента есть продажи — удалить нельзя");
  if (list === "suppliers" && db.purchases.some((p) => p.supplierId === record.id)) return toast("У поставщика есть закупки — удалить нельзя");
  if (!confirmDelete(label)) return;
  db[list] = db[list].filter((x) => x !== record);
  save();
  render();
  toast("Удалено");
}

// ===== Документы с позициями (продажи и закупки) =====
function openDocForm(kind, doc) {
  const isSale = kind === "sale";
  if (!db.products.length) return toast("Сначала добавьте товар на склад");
  const priceKey = isSale ? "price" : "cost";
  const items = doc ? doc.items.map((i) => ({ ...i })) : [{ productId: db.products[0].id, qty: 1, [priceKey]: num(db.products[0][priceKey]) }];

  const headFields = isSale
    ? [
        { key: "date", label: "Дата", type: "date", required: true, default: today() },
        { key: "clientId", label: "Клиент", type: "select", options: [["", "Розничный покупатель"], ...db.clients.map((c) => [c.id, c.name])] },
        { key: "status", label: "Статус", type: "select", options: Object.entries(STATUSES), default: "new" },
        { key: "delivery", label: "Получение", type: "select", options: [["pickup", "Самовывоз"], ["delivery", "Доставка"]], default: "pickup" },
        { key: "address", label: "Адрес доставки", wide: true },
      ]
    : [
        { key: "date", label: "Дата", type: "date", required: true, default: today() },
        { key: "supplierId", label: "Поставщик", type: "select", options: [["", "—"], ...db.suppliers.map((s) => [s.id, s.name])] },
      ];
  const footFields = isSale
    ? [
        { key: "discount", label: "Скидка", type: "number", min: 0, default: 0 },
        { key: "deliveryFee", label: "Доставка (стоимость)", type: "number", min: 0, default: 0 },
        { key: "paid", label: "Оплачено", type: "number", min: 0, default: 0 },
        { key: "note", label: "Комментарий", type: "textarea", wide: true },
      ]
    : [
        { key: "paid", label: "Оплачено поставщику", type: "number", min: 0, default: 0 },
        { key: "note", label: "Комментарий", type: "textarea", wide: true },
      ];

  const itemsBody = el("tbody");
  const totalNode = el("div", { class: "doc-total" });

  function available(productId) {
    return stockOf(productId, isSale ? { saleId: doc?.id } : { purchaseId: doc?.id });
  }

  function recalc() {
    let total = itemsSum(items, priceKey);
    if (isSale) total = Math.max(0, total - num($("f-discount")?.value) + num($("f-deliveryFee")?.value));
    totalNode.textContent = `Итого: ${money(total)}`;
  }

  function drawItems() {
    itemsBody.innerHTML = "";
    items.forEach((it, idx) => {
      const sel = el("select", {
        onchange: (e) => {
          it.productId = e.target.value;
          delete it.cost;
          it[priceKey] = num(byId("products", it.productId)?.[priceKey]);
          drawItems();
        },
      }, db.products.map((p) => {
        const o = el("option", { value: p.id }, `${p.name}${isSale ? ` (ост. ${stockOf(p.id, { saleId: doc?.id })})` : ""}`);
        if (p.id === it.productId) o.selected = true;
        return o;
      }));
      const qty = el("input", { type: "number", class: "qty-in", min: 0, step: "any", value: it.qty, oninput: (e) => { it.qty = num(e.target.value); rowSum.textContent = fmt(num(it.qty) * num(it[priceKey])); recalc(); } });
      const price = el("input", { type: "number", class: "price-in", min: 0, step: "any", value: it[priceKey], oninput: (e) => { it[priceKey] = num(e.target.value); rowSum.textContent = fmt(num(it.qty) * num(it[priceKey])); recalc(); } });
      const rowSum = el("span", {}, fmt(num(it.qty) * num(it[priceKey])));
      itemsBody.append(el("tr", {},
        el("td", {}, sel),
        el("td", {}, qty),
        el("td", {}, price),
        el("td", { class: "num" }, rowSum),
        el("td", {}, iconBtn("🗑", "Убрать позицию", () => { items.splice(idx, 1); drawItems(); }))
      ));
    });
    recalc();
  }

  const body = el("div", {},
    fieldsBlock(headFields, doc || {}),
    el("div", { class: "items" },
      el("table", {},
        el("thead", {}, el("tr", {}, el("th", {}, "Товар"), el("th", {}, "Кол-во"), el("th", {}, isSale ? "Цена" : "Закуп. цена"), el("th", { class: "num" }, "Сумма"), el("th"))),
        itemsBody
      ),
      el("button", {
        type: "button", class: "btn small",
        onclick: () => { const p = db.products[0]; items.push({ productId: p.id, qty: 1, [priceKey]: num(p[priceKey]) }); drawItems(); },
      }, "+ Добавить позицию")
    ),
    fieldsBlock(footFields, doc || {}),
    totalNode,
    isSale ? null : el("p", { class: "muted" }, "Себестоимость товаров обновится по ценам этой закупки.")
  );

  openModal(isSale ? (doc ? `Продажа №${doc.no}` : "Новая продажа") : (doc ? `Закупка №${doc.no}` : "Новая закупка"), body, () => {
    const head = readFields(headFields);
    const foot = readFields(footFields);
    const clean = items.filter((i) => num(i.qty) > 0);
    if (!head.date) return "Укажите дату.";
    if (!clean.length) return "Добавьте хотя бы одну позицию с количеством больше нуля.";
    if (isSale && head.delivery === "delivery" && !head.address) return "Укажите адрес доставки.";

    if (isSale && head.status !== "cancelled") {
      const need = {};
      for (const i of clean) need[i.productId] = (need[i.productId] || 0) + num(i.qty);
      const short = Object.entries(need).filter(([pid, q]) => q > available(pid));
      if (short.length) {
        const list = short.map(([pid, q]) => `• ${productName(pid)}: нужно ${q}, на складе ${available(pid)}`).join("\n");
        if (!window.confirm(`Недостаточно товара на складе:\n${list}\n\nВсё равно сохранить?`)) return "Сохранение отменено: не хватает остатка.";
      }
    }

    if (isSale) {
      // Фиксируем себестоимость на момент продажи, чтобы прибыль не менялась задним числом.
      for (const i of clean) if (i.cost === undefined) i.cost = num(byId("products", i.productId)?.cost);
    } else {
      for (const i of clean) { const p = byId("products", i.productId); if (p && num(i.cost) > 0) p.cost = num(i.cost); }
    }

    const data = { ...head, ...foot, items: clean.map((i) => ({ productId: i.productId, qty: num(i.qty), [priceKey]: num(i[priceKey]), ...(isSale ? { cost: num(i.cost) } : {}) })) };
    if (doc) Object.assign(doc, data);
    else {
      const seqKey = isSale ? "sale" : "purchase";
      db.seq[seqKey] += 1;
      db[isSale ? "sales" : "purchases"].push({ id: uid(), no: db.seq[seqKey], created: new Date().toISOString(), ...data });
    }
    save();
    closeModal();
    render();
    toast("Документ сохранён");
  });

  if (isSale) ["f-discount", "f-deliveryFee"].forEach((id) => $(id).addEventListener("input", recalc));
  drawItems();
}

function takePayment(kind, doc) {
  const debt = kind === "sale" ? saleDebt(doc) : purchaseDebt(doc);
  openForm(kind === "sale" ? `Оплата по продаже №${doc.no}` : `Оплата поставщику, закупка №${doc.no}`,
    [{ key: "amount", label: `Сумма (долг ${fmt(debt)})`, type: "number", min: 0, default: debt, required: true }],
    {},
    ({ amount }) => {
      if (amount <= 0) return "Сумма должна быть больше нуля.";
      doc.paid = round2(num(doc.paid) + amount);
      save();
      closeModal();
      render();
      toast("Оплата принята");
    });
}

function printSale(s) {
  const S = db.settings;
  const client = byId("clients", s.clientId);
  const area = $("print-area");
  area.innerHTML = "";
  area.append(
    el("div", { class: "print-head" },
      el("div", {}, el("h2", {}, S.name), el("div", {}, `Склад: ${S.warehouse}`), el("div", {}, `Тел.: ${S.phone}`)),
      el("div", {}, el("h2", {}, `Накладная №${s.no}`), el("div", {}, `от ${fmtDate(s.date)}`))
    ),
    el("p", {}, `Покупатель: ${clientName(s.clientId)}${client?.phone ? ", " + client.phone : ""}`),
    s.delivery === "delivery" ? el("p", {}, `Доставка: ${s.address}`) : el("p", {}, "Самовывоз"),
    table(
      [
        { label: "№", get: (r) => r.n },
        { label: "Товар", get: (r) => productName(r.productId) },
        { label: "Кол-во", num: true, get: (r) => fmt(r.qty) },
        { label: "Цена", num: true, get: (r) => fmt(r.price) },
        { label: "Сумма", num: true, get: (r) => fmt(r.qty * r.price) },
      ],
      s.items.map((i, n) => ({ ...i, n: n + 1 }))
    ),
    num(s.discount) ? el("p", {}, `Скидка: ${money(s.discount)}`) : null,
    num(s.deliveryFee) ? el("p", {}, `Доставка: ${money(s.deliveryFee)}`) : null,
    el("h3", {}, `Итого к оплате: ${money(saleTotal(s))}`),
    el("p", {}, `Оплачено: ${money(num(s.paid))}. Остаток: ${money(saleDebt(s))}`),
    el("div", { class: "print-sign" }, el("div", {}, "Отпустил: ____________"), el("div", {}, "Получил: ____________"))
  );
  window.print();
}

// ===== Страницы =====
const PAGES = {
  dashboard: { title: "Главная", render: renderDashboard },
  sales: { title: "Продажи", render: renderSales },
  products: { title: "Склад и товары", render: renderProducts },
  purchases: { title: "Закупки", render: renderPurchases },
  clients: { title: "Клиенты", render: renderClients },
  suppliers: { title: "Поставщики", render: renderSuppliers },
  expenses: { title: "Расходы", render: renderExpenses },
  reports: { title: "Отчёты", render: renderReports },
  settings: { title: "Настройки", render: renderSettings },
};

const pageState = { salesQ: "", salesStatus: "", productsQ: "", clientsQ: "", suppliersQ: "", purchasesQ: "", expensesQ: "", from: monthStart(), to: today() };

function renderDashboard(view) {
  setActions(actionBtn("+ Продажа", () => openDocForm("sale")), actionBtn("+ Закупка", () => openDocForm("purchase"), "btn"));
  const m = periodSummary(monthStart(), today());
  const debts = sum(db.sales, saleDebt);
  const stockValue = sum(db.products, (p) => Math.max(0, stockOf(p.id)) * num(p.cost));
  const open = db.sales.filter((s) => ["new", "confirmed", "shipped"].includes(s.status));
  const low = db.products.filter((p) => stockOf(p.id) <= num(p.minStock));

  view.append(
    el("div", { class: "kpis" },
      kpi("Выручка за месяц", money(m.revenue), `${m.sales.length} продаж`),
      kpi("Чистая прибыль за месяц", money(m.net), `расходы ${money(m.exp)}`, m.net < 0 ? "text-red" : "text-green"),
      kpi("Долги клиентов", money(debts), null, debts > 0 ? "text-amber" : ""),
      kpi("Склад по себестоимости", money(stockValue), `${db.products.length} товаров`),
      kpi("Заказы в работе", String(open.length))
    ),
    ...(db.products.some((p) => !num(p.cost))
      ? [panel(null, el("p", { class: "hint" }, "⚠️ У некоторых товаров не указана себестоимость — прибыль будет завышена. Укажите её в разделе «Склад» или проведите закупку."))]
      : []),
    el("div", { class: "grid2" },
      panel("Заказы в работе", table(
        [
          { label: "№", get: (s) => s.no },
          { label: "Клиент", get: (s) => clientName(s.clientId) },
          { label: "Статус", get: (s) => badge(s.status) },
          { label: "Сумма", num: true, get: (s) => fmt(saleTotal(s)) },
        ],
        open.slice().reverse().slice(0, 8),
        { empty: "Нет открытых заказов" }
      )),
      panel("Заканчивается на складе", table(
        [
          { label: "Товар", get: (p) => p.name },
          { label: "Остаток", num: true, get: (p) => el("span", { class: "text-red" }, `${stockOf(p.id)} ${p.unit}`) },
          { label: "Мин.", num: true, get: (p) => fmt(p.minStock) },
        ],
        low,
        { empty: "Все остатки в норме ✅" }
      ))
    ),
    panel("Последние продажи", salesTable(db.sales.slice().reverse().slice(0, 10)))
  );
}

function salesTable(rows) {
  return table(
    [
      { label: "№", get: (s) => s.no },
      { label: "Дата", get: (s) => fmtDate(s.date) },
      { label: "Клиент", get: (s) => clientName(s.clientId) },
      { label: "Товары", get: (s) => s.items.map((i) => `${productName(i.productId)} × ${fmt(i.qty)}`).join(", ") },
      { label: "Статус", get: (s) => badge(s.status) },
      { label: "Сумма", num: true, get: (s) => fmt(saleTotal(s)) },
      { label: "Долг", num: true, get: (s) => { const d = saleDebt(s); return d ? el("span", { class: "text-amber" }, fmt(d)) : "—"; } },
      {
        label: "", cls: "row-actions", get: (s) => [
          saleDebt(s) ? iconBtn("💵", "Принять оплату", () => takePayment("sale", s)) : null,
          iconBtn("🖨", "Печать накладной", () => printSale(s)),
          iconBtn("✏️", "Изменить", () => openDocForm("sale", s)),
          iconBtn("🗑", "Удалить", () => { if (confirmDelete(`продажу №${s.no}`)) { db.sales = db.sales.filter((x) => x !== s); save(); render(); } }),
        ],
      },
    ],
    rows,
    { empty: "Продаж пока нет" }
  );
}

function renderSales(view) {
  setActions(actionBtn("+ Новая продажа", () => openDocForm("sale")), actionBtn("Экспорт CSV", exportSalesCSV, "btn"));
  const list = el("div");
  const draw = () => {
    const q = pageState.salesQ;
    const rows = db.sales
      .filter((s) => (!pageState.salesStatus || (pageState.salesStatus === "debt" ? saleDebt(s) > 0 : s.status === pageState.salesStatus)))
      .filter((s) => matches(q, s.no, clientName(s.clientId), s.note, s.address, ...s.items.map((i) => productName(i.productId))))
      .slice().reverse();
    list.innerHTML = "";
    list.append(salesTable(rows));
  };
  const status = el("select", { onchange: (e) => { pageState.salesStatus = e.target.value; draw(); } },
    [["", "Все статусы"], ...Object.entries(STATUSES), ["debt", "С долгом"]].map(([v, l]) => {
      const o = el("option", { value: v }, l);
      if (v === pageState.salesStatus) o.selected = true;
      return o;
    }));
  const search = searchBox("Поиск: клиент, товар, №…", (q) => { pageState.salesQ = q; draw(); });
  search.value = pageState.salesQ;
  view.append(panel(null, el("div", { class: "toolbar" }, search, status), list));
  draw();
}

function renderProducts(view) {
  setActions(actionBtn("+ Товар", () => editRecord("products", PRODUCT_FIELDS, "Товар")), actionBtn("+ Закупка", () => openDocForm("purchase"), "btn"));
  const list = el("div");
  const draw = () => {
    const rows = db.products.filter((p) => matches(pageState.productsQ, p.name, p.sku, p.note));
    list.innerHTML = "";
    list.append(table(
      [
        { label: "Артикул", get: (p) => p.sku || "—" },
        { label: "Товар", get: (p) => [p.name, p.note ? el("div", { class: "muted" }, p.note) : null] },
        { label: "Остаток", num: true, get: (p) => { const s = stockOf(p.id); return el("span", { class: s <= num(p.minStock) ? "text-red" : "" }, `${fmt(s)} ${p.unit}`); } },
        { label: "Себест.", num: true, get: (p) => fmt(p.cost) },
        { label: "Цена", num: true, get: (p) => fmt(p.price) },
        { label: "Наценка", num: true, get: (p) => (num(p.cost) ? `${Math.round(((p.price - p.cost) / p.cost) * 100)}%` : "—") },
        { label: "Сумма склада", num: true, get: (p) => fmt(Math.max(0, stockOf(p.id)) * num(p.cost)) },
        {
          label: "", cls: "row-actions", get: (p) => [
            iconBtn("✏️", "Изменить", () => editRecord("products", PRODUCT_FIELDS, "Товар", p)),
            iconBtn("🗑", "Удалить", () => deleteRecord("products", p, `товар «${p.name}»`)),
          ],
        },
      ],
      rows,
      { empty: "Товаров нет", footer: ["", "Итого", "", "", "", "", fmt(sum(rows, (p) => Math.max(0, stockOf(p.id)) * num(p.cost))), ""] }
    ));
  };
  const search = searchBox("Поиск товара…", (q) => { pageState.productsQ = q; draw(); });
  search.value = pageState.productsQ;
  view.append(panel(null, el("div", { class: "toolbar" }, search), list));
  draw();
}

function renderPurchases(view) {
  setActions(actionBtn("+ Новая закупка", () => openDocForm("purchase")));
  const list = el("div");
  const draw = () => {
    const rows = db.purchases
      .filter((p) => matches(pageState.purchasesQ, p.no, supplierName(p.supplierId), p.note, ...p.items.map((i) => productName(i.productId))))
      .slice().reverse();
    list.innerHTML = "";
    list.append(table(
      [
        { label: "№", get: (p) => p.no },
        { label: "Дата", get: (p) => fmtDate(p.date) },
        { label: "Поставщик", get: (p) => supplierName(p.supplierId) },
        { label: "Товары", get: (p) => p.items.map((i) => `${productName(i.productId)} × ${fmt(i.qty)}`).join(", ") },
        { label: "Сумма", num: true, get: (p) => fmt(purchaseTotal(p)) },
        { label: "Долг", num: true, get: (p) => { const d = purchaseDebt(p); return d ? el("span", { class: "text-amber" }, fmt(d)) : "—"; } },
        {
          label: "", cls: "row-actions", get: (p) => [
            purchaseDebt(p) ? iconBtn("💵", "Оплатить", () => takePayment("purchase", p)) : null,
            iconBtn("✏️", "Изменить", () => openDocForm("purchase", p)),
            iconBtn("🗑", "Удалить", () => { if (confirmDelete(`закупку №${p.no}`)) { db.purchases = db.purchases.filter((x) => x !== p); save(); render(); } }),
          ],
        },
      ],
      rows,
      { empty: "Закупок пока нет. Закупка увеличивает остаток на складе." }
    ));
  };
  const search = searchBox("Поиск: поставщик, товар, №…", (q) => { pageState.purchasesQ = q; draw(); });
  search.value = pageState.purchasesQ;
  view.append(panel(null, el("div", { class: "toolbar" }, search), list));
  draw();
}

function partyPage(view, kind) {
  const isClient = kind === "clients";
  const fields = isClient ? CLIENT_FIELDS : SUPPLIER_FIELDS;
  const title = isClient ? "Клиент" : "Поставщик";
  const qKey = kind + "Q";
  setActions(actionBtn(`+ ${title}`, () => editRecord(kind, fields, title)));
  const docs = (r) => (isClient ? db.sales.filter((s) => s.clientId === r.id && isActive(s)) : db.purchases.filter((p) => p.supplierId === r.id));
  const list = el("div");
  const draw = () => {
    const rows = db[kind].filter((r) => matches(pageState[qKey], r.name, r.phone, r.address, r.note));
    list.innerHTML = "";
    list.append(table(
      [
        { label: isClient ? "Имя" : "Название", get: (r) => [r.name, r.note ? el("div", { class: "muted" }, r.note) : null] },
        { label: "Телефон", get: (r) => (r.phone ? el("a", { href: `tel:${r.phone}` }, r.phone) : "—") },
        { label: "Адрес", get: (r) => r.address || "—" },
        { label: isClient ? "Продаж" : "Закупок", num: true, get: (r) => docs(r).length },
        { label: "Оборот", num: true, get: (r) => fmt(sum(docs(r), isClient ? saleTotal : purchaseTotal)) },
        { label: isClient ? "Долг клиента" : "Наш долг", num: true, get: (r) => { const d = sum(docs(r), isClient ? saleDebt : purchaseDebt); return d ? el("span", { class: "text-amber" }, fmt(d)) : "—"; } },
        {
          label: "", cls: "row-actions", get: (r) => [
            iconBtn("✏️", "Изменить", () => editRecord(kind, fields, title, r)),
            iconBtn("🗑", "Удалить", () => deleteRecord(kind, r, `«${r.name}»`)),
          ],
        },
      ],
      rows,
      { empty: isClient ? "Клиентов пока нет" : "Поставщиков пока нет" }
    ));
  };
  const search = searchBox("Поиск: имя, телефон…", (q) => { pageState[qKey] = q; draw(); });
  search.value = pageState[qKey];
  view.append(panel(null, el("div", { class: "toolbar" }, search), list));
  draw();
}
function renderClients(view) { partyPage(view, "clients"); }
function renderSuppliers(view) { partyPage(view, "suppliers"); }

function renderExpenses(view) {
  setActions(actionBtn("+ Расход", () => editRecord("expenses", expenseFields(), "Расход")));
  const list = el("div");
  const draw = () => {
    const rows = db.expenses
      .filter((e) => matches(pageState.expensesQ, e.category, e.note))
      .slice().sort((a, b) => b.date.localeCompare(a.date));
    list.innerHTML = "";
    list.append(table(
      [
        { label: "Дата", get: (e) => fmtDate(e.date) },
        { label: "Категория", get: (e) => e.category },
        { label: "Описание", get: (e) => e.note || "—" },
        { label: "Сумма", num: true, get: (e) => fmt(e.amount) },
        {
          label: "", cls: "row-actions", get: (e) => [
            iconBtn("✏️", "Изменить", () => editRecord("expenses", expenseFields(), "Расход", e)),
            iconBtn("🗑", "Удалить", () => deleteRecord("expenses", e, "расход")),
          ],
        },
      ],
      rows,
      { empty: "Расходов пока нет", footer: ["", "", "Итого", fmt(sum(rows, (e) => num(e.amount))), ""] }
    ));
  };
  const search = searchBox("Поиск: категория, описание…", (q) => { pageState.expensesQ = q; draw(); });
  search.value = pageState.expensesQ;
  view.append(panel(null, el("div", { class: "toolbar" }, search), list));
  draw();
}

function renderReports(view) {
  setActions(actionBtn("Экспорт продаж CSV", exportSalesCSV, "btn"));
  const from = el("input", { type: "date", value: pageState.from, onchange: (e) => { pageState.from = e.target.value; render(); } });
  const to = el("input", { type: "date", value: pageState.to, onchange: (e) => { pageState.to = e.target.value; render(); } });
  const preset = (label, f, t) => actionBtn(label, () => { pageState.from = f; pageState.to = t; render(); }, "btn small");
  const y = today().slice(0, 4);

  const r = periodSummary(pageState.from, pageState.to);

  const byProduct = {};
  for (const s of r.sales) for (const i of s.items) {
    const row = (byProduct[i.productId] ||= { productId: i.productId, qty: 0, revenue: 0, cost: 0 });
    row.qty += num(i.qty);
    row.revenue += num(i.qty) * num(i.price);
    row.cost += num(i.qty) * num(i.cost);
  }
  const prodRows = Object.values(byProduct).sort((a, b) => b.revenue - a.revenue);

  const byCat = {};
  for (const e of r.expenses) byCat[e.category] = (byCat[e.category] || 0) + num(e.amount);
  const catRows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  const byMonth = {};
  for (const s of r.sales) {
    const m = s.date.slice(0, 7);
    const row = (byMonth[m] ||= { m, count: 0, revenue: 0, profit: 0 });
    row.count += 1;
    row.revenue += saleTotal(s);
    row.profit += saleTotal(s) - saleCost(s);
  }
  const monthRows = Object.values(byMonth).sort((a, b) => a.m.localeCompare(b.m));

  const debtors = db.clients.map((c) => ({ c, debt: sum(db.sales.filter((s) => s.clientId === c.id), saleDebt) })).filter((x) => x.debt > 0);
  const retailDebt = sum(db.sales.filter((s) => !s.clientId), saleDebt);
  if (retailDebt > 0) debtors.push({ c: { name: "Розничные покупатели" }, debt: retailDebt });

  view.append(
    panel(null, el("div", { class: "toolbar" },
      "Период:", from, "—", to,
      preset("Этот месяц", monthStart(), today()),
      preset("Этот год", `${y}-01-01`, today()),
      preset("Всё время", "", "")
    )),
    el("div", { class: "kpis" },
      kpi("Выручка", money(r.revenue), `${r.sales.length} продаж`),
      kpi("Себестоимость", money(r.cost)),
      kpi("Валовая прибыль", money(r.gross), r.revenue ? `маржа ${Math.round((r.gross / r.revenue) * 100)}%` : null),
      kpi("Расходы", money(r.exp)),
      kpi("Чистая прибыль", money(r.net), null, r.net < 0 ? "text-red" : "text-green")
    ),
    el("div", { class: "grid2" },
      panel("Продажи по товарам", table(
        [
          { label: "Товар", get: (x) => productName(x.productId) },
          { label: "Кол-во", num: true, get: (x) => fmt(x.qty) },
          { label: "Выручка", num: true, get: (x) => fmt(x.revenue) },
          { label: "Прибыль", num: true, get: (x) => fmt(x.revenue - x.cost) },
        ],
        prodRows
      )),
      panel("Расходы по категориям", table(
        [
          { label: "Категория", get: (x) => x[0] },
          { label: "Сумма", num: true, get: (x) => fmt(x[1]) },
          { label: "Доля", num: true, get: (x) => (r.exp ? `${Math.round((x[1] / r.exp) * 100)}%` : "—") },
        ],
        catRows
      ))
    ),
    el("div", { class: "grid2" },
      panel("По месяцам", table(
        [
          { label: "Месяц", get: (x) => { const [yy, mm] = x.m.split("-"); return `${mm}.${yy}`; } },
          { label: "Продаж", num: true, get: (x) => x.count },
          { label: "Выручка", num: true, get: (x) => fmt(x.revenue) },
          { label: "Вал. прибыль", num: true, get: (x) => fmt(x.profit) },
        ],
        monthRows
      )),
      panel("Должники (на сегодня)", table(
        [
          { label: "Клиент", get: (x) => x.c.name },
          { label: "Телефон", get: (x) => x.c.phone || "—" },
          { label: "Долг", num: true, get: (x) => el("span", { class: "text-amber" }, fmt(x.debt)) },
        ],
        debtors,
        { empty: "Долгов нет ✅" }
      ))
    )
  );
}

function renderSettings(view) {
  setActions();
  const fields = [
    { key: "name", label: "Название компании", required: true },
    { key: "phone", label: "Телефон", type: "tel" },
    { key: "warehouse", label: "Склад / адрес" },
    { key: "currency", label: "Валюта", required: true },
  ];
  const fileInput = el("input", { type: "file", accept: "application/json,.json", class: "hidden", onchange: importBackup });
  view.append(
    panel("Компания",
      fieldsBlock(fields, db.settings),
      el("p", {}, actionBtn("Сохранить", () => {
        const v = readFields(fields);
        if (!v.name || !v.currency) return toast("Заполните название и валюту");
        db.settings = { ...db.settings, ...v };
        save();
        render();
        toast("Настройки сохранены");
      }))
    ),
    panel("Резервная копия",
      el("p", { class: "muted" }, "Все данные хранятся в этом браузере. Регулярно скачивайте копию — так вы не потеряете учёт и сможете перенести его на другой компьютер."),
      el("div", { class: "toolbar" },
        actionBtn("⬇️ Скачать копию", () => download(`sohtmon-erp-${today()}.json`, JSON.stringify(db, null, 2), "application/json")),
        actionBtn("⬆️ Загрузить копию", () => fileInput.click(), "btn"),
        fileInput
      )
    ),
    panel("Опасная зона",
      el("p", { class: "muted" }, "Удалить все данные ERP из этого браузера."),
      actionBtn("Очистить все данные", () => {
        if (!window.confirm("Удалить ВСЕ данные ERP? Сначала скачайте резервную копию.")) return;
        if (!window.confirm("Точно удалить? Восстановить будет нельзя.")) return;
        db = defaultDB();
        save();
        render();
        toast("Данные очищены");
      }, "btn danger")
    )
  );
}

function importBackup(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!data || !Array.isArray(data.products) || !Array.isArray(data.sales)) throw new Error("bad");
      if (!window.confirm("Заменить текущие данные данными из файла?")) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      db = loadDB();
      render();
      toast("Копия загружена");
    } catch {
      toast("Файл не похож на резервную копию SOHTMON ERP");
    }
  };
  reader.readAsText(file);
}

function exportSalesCSV() {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const header = ["№", "Дата", "Клиент", "Телефон", "Товары", "Статус", "Сумма", "Себестоимость", "Оплачено", "Долг", "Получение", "Адрес", "Комментарий"];
  const lines = db.sales.map((s) => {
    const c = byId("clients", s.clientId);
    return [
      s.no, fmtDate(s.date), clientName(s.clientId), c?.phone || "",
      s.items.map((i) => `${productName(i.productId)} x ${i.qty} по ${i.price}`).join("; "),
      STATUSES[s.status], round2(saleTotal(s)), round2(saleCost(s)), round2(num(s.paid)), round2(saleDebt(s)),
      s.delivery === "delivery" ? "Доставка" : "Самовывоз", s.address || "", s.note || "",
    ].map(esc).join(";");
  });
  // BOM, чтобы Excel правильно открыл кириллицу
  download(`sohtmon-sales-${today()}.csv`, "﻿" + [header.map(esc).join(";"), ...lines].join("\r\n"), "text/csv;charset=utf-8");
}

// ===== Роутинг и запуск =====
function currentPage() {
  const p = location.hash.slice(1);
  return PAGES[p] ? p : "dashboard";
}

function render() {
  const page = currentPage();
  $("page-title").textContent = PAGES[page].title;
  $("brand-name").textContent = db.settings.name;
  document.title = `${PAGES[page].title} — ${db.settings.name} ERP`;
  document.querySelectorAll("#nav a").forEach((a) => a.classList.toggle("active", a.dataset.page === page));
  const view = $("view");
  view.innerHTML = "";
  PAGES[page].render(view);
}

document.addEventListener("DOMContentLoaded", () => {
  $("modal-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!modalSubmit) return;
    const err = modalSubmit();
    if (err) $("modal-error").textContent = err;
  });
  $("modal").addEventListener("close", () => { $("modal-body").innerHTML = ""; modalSubmit = null; });
  $("modal-close").addEventListener("click", closeModal);
  $("modal-cancel").addEventListener("click", closeModal);
  window.addEventListener("hashchange", render);
  window.addEventListener("storage", (e) => { if (e.key === STORAGE_KEY) { db = loadDB(); render(); } });
  render();
});
