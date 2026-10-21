// Life Medx: isolated cloud DEMO UI. No service_role keys, no offline fallback.
// All reads use Supabase PostgREST + RLS; writes use guarded public RPCs.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
const PROJECT_URL = "https://bbauvsugsiskbsgbpbwk.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_HjbZk-2bAjFuZ3eSALo4OA_l-Po9CnE";
const sb = createClient(PROJECT_URL, PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
});
const $ = (id) => document.getElementById(id);
const activeTabs = [
  ["overview", "نظرة عامة", "⌂"],
  ["products", "الأصناف", "▦"],
  ["stock", "المخزون والصلاحية", "▤"],
  ["movements", "أذون المخزن", "⇄"],
  ["orders", "أوامر البيع", "▣"],
  ["cases", "العمليات الجراحية", "✚"],
  ["customers", "المستشفيات", "♧"],
  ["reps", "المندوبون", "♙"]
];
const tabDetails = {
  overview: "كل مؤشرات المخزون والطلبات في مكان واحد.",
  products: "كتالوج الأصناف بالأسعار والأرصدة التجريبية.",
  stock: "متابعة التشغيلات والكميات وتواريخ الصلاحية.",
  movements: "سجل أذون الاستلام وحركات المخزن.",
  orders: "متابعة أوامر البيع وحالات الاعتماد.",
  cases: "جدول العمليات الجراحية التجريبية.",
  customers: "قائمة المستشفيات والعملاء المسجلين.",
  reps: "بيانات مندوبي المبيعات التجريبيين."
};
const fields = {
  products: "id,sku,barcode,name_ar,category,brand,unit,price,min_stock,active",
  warehouses: "id,name,code,city",
  lots: "id,product_id,warehouse_id,lot_no,qty,expiry",
  stock_movements: "id,no,type,status,warehouse_id,created_at",
  customers: "id,name,city,type,rep_id",
  reps: "id,name,region",
  sales_orders: "id,no,customer_id,rep_id,status,created_at",
  surgery_cases: "id,no,customer_id,rep_id,procedure,status,scheduled_at",
  product_costs: "product_id,cost"
};
let snapshot = null;
let tab = "overview";
let currentUser = null;
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Cairo" });
const money = (x) => Number(x || 0).toLocaleString("ar-EG") + " ج.م";
const quantity = (x) => Number(x || 0).toLocaleString("ar-EG");
const date = (x) => x ? new Date(x).toLocaleDateString("ar-EG") : "—";
function node(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined && text !== null) e.textContent = String(text);
  if (className) e.className = className;
  return e;
}
function clear(e) { e.replaceChildren(); return e; }
function add(parent, child) { parent.append(child); return child; }
function btn(label, fn, cls) { const b = node("button", label, "btn" + (cls ? " " + cls : "")); b.type = "button"; b.addEventListener("click", fn); return b; }
function info(message, isError) {
  const f = clear($("feedback"));
  if (message) add(f, node("div", message, isError ? "error" : "good"));
}
function named(table, id, field) {
  const found = snapshot[table].find((x) => x.id === id);
  return found ? found[field] : "—";
}
function rowTable(parent, headers, rows) {
  const wrapper = add(parent, node("div", null, "tablewrap"));
  const table = add(wrapper, node("table"));
  const thead = add(table, node("thead"));
  const head = add(thead, node("tr"));
  headers.forEach((h) => add(head, node("th", h)));
  const body = add(table, node("tbody"));
  if (!rows.length) {
    const tr = add(body, node("tr")); const td = add(tr, node("td", "لا توجد نتائج"));
    td.colSpan = headers.length;
  }
  rows.forEach((cells) => {
    const tr = add(body, node("tr"));
    cells.forEach((value) => {
      const td = add(tr, node("td"));
      if (value instanceof Node) td.append(value);
      else td.textContent = String(value ?? "—");
    });
  });
}
function panel(title) {
  const p = add($("content"), node("section", null, "panel"));
  add(p, node("h2", title));
  return p;
}
function tally(productId) {
  return snapshot.lots.filter((x) => x.product_id === productId).reduce((v, x) => v + Number(x.qty), 0);
}
function kpi(name, count) {
  const card = node("div", null, "card");
  add(card, node("span", name, "muted"));
  add(card, node("span", count, "num"));
  return card;
}
async function fetchData() {
  const entries = await Promise.all(Object.entries(fields).map(async ([table, columns]) => {
    const { data, error } = await sb.from(table).select(columns).limit(1000);
    if (error) throw new Error("تعذر قراءة " + table + ": " + error.message);
    return [table, data || []];
  }));
  snapshot = Object.fromEntries(entries);
}
async function verifyAdmin() {
  const { data: auth, error: authError } = await sb.auth.getUser();
  if (authError || !auth?.user) return false;
  const { data: profile, error } = await sb.from("profiles")
    .select("id,full_name,role,active").eq("id", auth.user.id).single();
  if (error || !profile || !profile.active || profile.role !== "admin") {
    throw new Error("الحساب لا يملك صلاحية مدير نشط على هذا المشروع");
  }
  currentUser = profile;
  return true;
}
function showLogin(message) {
  currentUser = null; snapshot = null;
  $("dashboard").classList.add("hidden");
  $("sidebar").classList.add("hidden");
  $("topbar").classList.add("hidden");
  $("login").classList.remove("hidden");
  $("status").textContent = "في انتظار تسجيل الدخول";
  $("loginError").replaceChildren();
  if (message) add($("loginError"), node("div", message, "error"));
}
async function enterDashboard() {
  if (!await verifyAdmin()) { showLogin(); return; }
  $("status").textContent = "تحميل قاعدة البيانات…";
  await fetchData();
  $("login").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  $("sidebar").classList.remove("hidden");
  $("topbar").classList.remove("hidden");
  $("welcome").textContent = "مرحباً " + currentUser.full_name + " · مدير النسخة التجريبية";
  $("status").textContent = "متصل · آخر تحديث " + new Date().toLocaleTimeString("ar-EG");
  render();
}
function filtered(items, search, f) {
  const term = search.trim().toLocaleLowerCase("ar");
  return !term ? items : items.filter((x) => f(x).toLocaleLowerCase("ar").includes(term));
}
function renderOverview() {
  const cards = add($("content"), node("div", null, "cards"));
  [
    ["الأصناف", snapshot.products.length],
    ["رصيد المخزون", quantity(snapshot.lots.reduce((v, l) => v + Number(l.qty), 0))],
    ["المخازن", snapshot.warehouses.length],
    ["المستشفيات", snapshot.customers.length],
    ["أوامر البيع", snapshot.sales_orders.length],
    ["العمليات الجراحية", snapshot.surgery_cases.length],
    ["التشغيلات", snapshot.lots.length],
    ["أوامر بانتظار الاعتماد", snapshot.sales_orders.filter((x) => x.status === "pending").length]
  ].forEach(([label, v]) => add(cards, kpi(label, v)));
  const warning = snapshot.products.filter((p) => tally(p.id) < Number(p.min_stock));
  const p = panel("تنبيهات نقص المخزون");
  add(p, node("p", "تُحسب الكميات من التشغيلات المخزنة في Supabase. الكمية الفعلية المتاحة للصرف تستبعد المنتهي، وفق قواعد قاعدة البيانات.", "muted"));
  rowTable(p, ["الصنف", "الرصيد", "حد الطلب"], warning.slice(0, 12).map((x) => [x.name_ar, quantity(tally(x.id)), quantity(x.min_stock)]));
}
function renderTableScreen(section, title, headers, items, rowFn, termFn) {
  const p = panel(title);
  const bar = add(p, node("div", null, "controls"));
  add(bar, node("span", "عدد السجلات: " + items.length, "muted"));
  const search = add(bar, node("input"));
  search.placeholder = "بحث في " + title;
  search.setAttribute("aria-label", "بحث في " + title);
  const list = add(p, node("div"));
  const draw = () => { clear(list); rowTable(list, headers, filtered(items, search.value, termFn).map(rowFn)); };
  search.addEventListener("input", draw);
  draw();
}

/* Claude-original integration: searchable catalogue, detailed product drawer,
   per-warehouse lots, FEFO expiry filters and safe CSV exports. */
const productCategories = {
  knee:"مفاصل الركبة",hip:"مفاصل الفخذ",parts:"مكونات وملحقات",
  cement:"أسمنت عظام",power:"أجهزة جراحية",consum:"مستهلكات"
};
function sectionControls(panelNode) {
  return add(panelNode,node("div",null,"controls"));
}
function makeSelect(parent,label,choices,onChange) {
  const select=node("select");
  select.setAttribute("aria-label",label);
  select.className="filter-select";
  choices.forEach(([id,name])=>{
    const o=add(select,node("option",name));o.value=id;
  });
  parent.append(select);
  select.addEventListener("change",onChange);
  return select;
}
function badge(label,kind="neutral") {
  return node("span",label,"data-badge "+kind);
}
function showDetails(product) {
  const overlay=add(document.body,node("dialog",null,"product-dialog"));
  function close(){overlay.close();overlay.remove();}
  overlay.addEventListener("cancel",e=>{e.preventDefault();close();});
  overlay.addEventListener("click",e=>{if(e.target===overlay)close();});
  const top=add(overlay,node("div",null,"details-head"));
  const text=add(top,node("div"));
  add(text,node("span",product.sku,"section-kicker"));
  add(text,node("h2",product.name_ar));
  add(top,btn("إغلاق ×",close));
  const keyvals=add(overlay,node("div",null,"detail-stats"));
  for(const [name,value] of [
    ["الباركود",product.barcode||"—"],
    ["الفئة",productCategories[product.category]||product.category],
    ["العلامة",product.brand||"—"],
    ["سعر البيع التجريبي",money(product.price)],
    ["الرصيد",quantity(tally(product.id))],
    ["حد الطلب",quantity(product.min_stock)]
  ]) {
    const item=add(keyvals,node("div",null,"detail-stat"));
    add(item,node("small",name));
    add(item,node("strong",value));
  }
  add(overlay,node("h3","التشغيلات حسب المخزن"));
  const lots=snapshot.lots.filter(l=>l.product_id===product.id)
    .sort((a,b)=>String(a.expiry).localeCompare(String(b.expiry)));
  rowTable(overlay,["المخزن","التشغيلة","الكمية","الصلاحية"],
    lots.map(l=>[named("warehouses",l.warehouse_id,"name"),l.lot_no,quantity(l.qty),l.expiry]));
  overlay.showModal();
}
function safeCsvCell(v) {
  const value=String(v??"");
  const safe=/^[\s]*[=+\-@\t\r]/.test(value)?"'"+value:value;
  return '"'+safe.replaceAll('"','""')+'"';
}
function exportCsv(filename,headers,rows) {
  const body=[headers,...rows].map(row=>row.map(safeCsvCell).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob(["\ufeff"+body],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=filename;
  document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function renderProducts() {
  const p=panel("كتالوج الأصناف");
  add(p,node("p","مأخوذ من تجربة Claude الأصلية: البحث بالفئة والباركود، عرض جدولي أو بطاقات، وتفاصيل كل صنف وتشغيلاته.","muted"));
  const controls=sectionControls(p);
  const search=add(controls,node("input"));
  search.placeholder="بحث باسم الصنف أو SKU أو الباركود";
  search.setAttribute("aria-label","بحث في الأصناف");
  const category=makeSelect(controls,"فلترة حسب الفئة",
    [["all","كل الفئات"],...Object.entries(productCategories)],()=>draw());
  const viewToggle=btn("عرض كبطاقات",()=>{
    cardView=!cardView;
    viewToggle.textContent=cardView?"عرض كجدول":"عرض كبطاقات";
    draw();
  });
  add(controls,viewToggle);
  const exportBtn=btn("تصدير CSV",()=>exportCsv("life-medx-demo-products.csv",
    ["الكود","اسم الصنف","الفئة","الباركود","السعر التجريبي","الرصيد","حد الطلب"],
    getRows().map(x=>[x.sku,x.name_ar,productCategories[x.category]||x.category,x.barcode||"",x.price,tally(x.id),x.min_stock])));
  add(controls,exportBtn);
  const listing=add(p,node("div"));
  let cardView=false;
  function getRows() {
    return snapshot.products.filter(x=>category.value==="all"||x.category===category.value)
      .filter(x=>filtered([x],search.value,y=>[y.name_ar,y.sku,y.barcode,y.brand].join(" ")).length);
  }
  function draw() {
    clear(listing);
    const rows=getRows();
    if(cardView) {
      const grid=add(listing,node("div",null,"product-grid"));
      rows.forEach(x=>{
        const box=add(grid,node("article",null,"product-tile"));
        add(box,node("span",x.sku,"section-kicker"));
        add(box,node("h3",x.name_ar));
        add(box,badge(productCategories[x.category]||x.category));
        const stats=add(box,node("p",money(x.price)+" · الرصيد "+quantity(tally(x.id)),"muted"));
        stats.style.marginBlock="12px";
        add(box,btn("تفاصيل الصنف",()=>showDetails(x),"primary"));
      });
      if(!rows.length)add(grid,node("p","مفيش أصناف مطابقة."));
    }else{
      rowTable(listing,["الكود","الصنف","الفئة","السعر","الرصيد","التفاصيل"],
        rows.map(x=>[x.sku,x.name_ar,productCategories[x.category]||x.category,
          money(x.price),quantity(tally(x.id)),btn("عرض",()=>showDetails(x))]));
    }
  }
  search.addEventListener("input",draw);
  draw();
}
function renderStock() {
  const p=panel("المخزون والتشغيلات");
  const controls=sectionControls(p);
  add(controls,node("p","إدارة التشغيلات حسب تاريخ الصلاحية والمخزن، مع عرض المنتهي والقريب من الانتهاء.","muted"));
  add(controls,btn("إذن استلام تجريبي",openReceipt,"primary"));
  const controls2=sectionControls(p);
  const search=add(controls2,node("input"));
  search.placeholder="بحث بالصنف أو التشغيلة";
  search.setAttribute("aria-label","بحث في المخزون");
  const warehouse=makeSelect(controls2,"اختر المخزن",
    [["all","كل المخازن"],...snapshot.warehouses.map(w=>[w.id,w.name])],()=>draw());
  const expirySelect=makeSelect(controls2,"حالة الصلاحية",
    [["all","كل حالات الصلاحية"],["expired","منتهية"],["soon","قريبة الانتهاء"],["ok","صالحة"]],()=>draw());
  const listing=add(p,node("div"));
  const refDate=today();
  const soonDate=new Date(Date.now()+90*86400000).toLocaleDateString("en-CA",{timeZone:"Africa/Cairo"});
  function expiryState(l) {
    return l.expiry<refDate?"expired":l.expiry<=soonDate?"soon":"ok";
  }
  function rows() {
    return snapshot.lots
      .filter(l=>warehouse.value==="all"||l.warehouse_id===warehouse.value)
      .filter(l=>expirySelect.value==="all"||expiryState(l)===expirySelect.value)
      .filter(l=>filtered([l],search.value,x=>x.lot_no+" "+named("products",x.product_id,"name_ar")).length)
      .sort((a,b)=>String(a.expiry).localeCompare(String(b.expiry)));
  }
  function draw(){
    clear(listing);
    const data=rows();
    const strip=add(listing,node("div",null,"stock-metrics"));
    const sum=data.reduce((n,l)=>n+Number(l.qty),0);
    add(strip,badge("تشغيلات: "+quantity(data.length),"teal"));
    add(strip,badge("كمية: "+quantity(sum)));
    add(strip,badge("منتهية: "+quantity(data.filter(l=>expiryState(l)==="expired").length),"danger"));
    rowTable(listing,["الصنف","المخزن","التشغيلة","الكمية","الصلاحية","الحالة"],
      data.map(l=>[named("products",l.product_id,"name_ar"),named("warehouses",l.warehouse_id,"name"),
        l.lot_no,quantity(l.qty),l.expiry,badge(({expired:"منتهية",soon:"قريبة الانتهاء",ok:"صالحة"})[expiryState(l)],
          ({expired:"danger",soon:"warning",ok:"success"})[expiryState(l)])]));
  }
  add(controls2,btn("تصدير أرصدة CSV",()=>exportCsv("life-medx-demo-lots.csv",
    ["الصنف","المخزن","التشغيلة","الكمية","الصلاحية","الحالة"],
    rows().map(l=>[named("products",l.product_id,"name_ar"),named("warehouses",l.warehouse_id,"name"),
      l.lot_no,l.qty,l.expiry,expiryState(l)]))));
  search.addEventListener("input",draw);
  draw();
}
function renderMovements() {
  renderTableScreen("movements", "أذون المخزن", ["رقم الإذن", "النوع", "الحالة", "المخزن", "التاريخ"],
    snapshot.stock_movements.slice().sort((a,b) => String(b.created_at).localeCompare(String(a.created_at))),
    (x) => [x.no, ({in:"استلام",out:"صرف",transfer:"تحويل",return:"مرتجع",reversal:"عكس"})[x.type] || x.type, x.status, named("warehouses",x.warehouse_id,"name"),date(x.created_at)],
    (x) => x.no + " " + x.type);
}
function renderOrders() {
  const p = panel("أوامر البيع التجريبية");
  add(p, node("p", "يمكن اعتماد أمر «بانتظار الاعتماد» للتجربة. سيُحفظ التغيير في قاعدة بيانات الـDemo.", "muted"));
  const rows = snapshot.sales_orders.slice().sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))
    .map((x) => {
      const action=x.status==="pending" ? btn("اعتماد الأمر", () => approveOrder(x), "primary") : "—";
      return [x.no,named("customers",x.customer_id,"name"),x.status,date(x.created_at),action];
    });
  rowTable(p, ["الأمر","العميل","الحالة","التاريخ","إجراء تجريبي"],rows);
}
function renderCases() {
  const p=panel("العمليات الجراحية — لوحة المراحل");
  add(p,node("p","نفس تصور Claude الأصلي: العملية تنتقل من الجدولة للصرف، ثم التنفيذ والتسوية. العرض هنا للقراءة فقط لحد ما نختبر انتقالات الحالات فعليًا.","muted"));
  const stages=[["scheduled","مجدولة"],["issued","تم صرف الطقم"],["done","تمت العملية"],["closed","تمت التسوية"]];
  const board=add(p,node("div",null,"kanban-grid"));
  stages.forEach(([key,title])=>{
    const cases=snapshot.surgery_cases.filter(x=>x.status===key)
      .sort((a,b)=>String(a.scheduled_at).localeCompare(String(b.scheduled_at)));
    const col=add(board,node("div",null,"kanban-column"));
    const header=add(col,node("div",null,"kanban-head"));
    add(header,node("span",title));
    add(header,badge(quantity(cases.length),"teal"));
    if(!cases.length)add(col,node("p","لا توجد عمليات","muted"));
    cases.forEach(x=>{
      const card=add(col,node("article",null,"kanban-card"));
      add(card,node("span",x.no,"section-kicker"));
      add(card,node("h3",x.procedure));
      add(card,node("p",named("customers",x.customer_id,"name"),"muted"));
      add(card,node("small","تاريخ العملية: "+date(x.scheduled_at)));
    });
  });
}
function renderCustomers() {
  renderTableScreen("customers", "المستشفيات والعملاء", ["الاسم", "المدينة", "النوع", "المندوب"],
    snapshot.customers,
    (x) => [x.name,x.city,x.type,named("reps",x.rep_id,"name")],
    (x) => [x.name,x.city,x.type].join(" "));
}
function renderReps() {
  renderTableScreen("reps", "المناديب (بيانات وهمية فقط)", ["الاسم", "المنطقة"],
    snapshot.reps, (x) => [x.name,x.region],(x) => x.name + " " + x.region);
}
function render() {
  const nav = clear($("tabs"));
  activeTabs.forEach(([key,label,symbol]) => {
    const b = btn("", () => { tab=key; info(""); render(); window.scrollTo({top:0,behavior:"auto"}); },
      key === tab ? "active" : "");
    const icon = add(b,node("span",symbol,"tab-symbol"));
    icon.setAttribute("aria-hidden","true");
    add(b,node("span",label,"tab-label"));
    if (key === tab) b.setAttribute("aria-current","page");
    add(nav,b);
  });
  const current = activeTabs.find(([key])=>key===tab) || activeTabs[0];
  $("pageTitle").textContent = current[1];
  $("tabDesc").textContent = tabDetails[tab] || "";
  $("hero").classList.toggle("hidden", tab !== "overview");
  clear($("content"));
  if (tab === "overview") renderOverview();
  else if (tab === "products") renderProducts();
  else if (tab === "stock") renderStock();
  else if (tab === "movements") renderMovements();
  else if (tab === "orders") renderOrders();
  else if (tab === "cases") renderCases();
  else if (tab === "customers") renderCustomers();
  else renderReps();
}
async function doWrite(name, payload, successMessage) {
  info("");
  const { error } = await sb.rpc(name,payload);
  if (error) throw new Error(error.message);
  await fetchData(); render();
  info(successMessage);
}
async function approveOrder(order) {
  if (!confirm("اعتماد أمر " + order.no + " على بيانات النسخة التجريبية؟")) return;
  try {
    await doWrite("set_order_status", {p_order_id:order.id,p_from:"pending",p_to:"approved"}, "تم اعتماد أمر " + order.no + " في Supabase.");
  } catch(e){ info("فشل الاعتماد: " + e.message,true); }
}
function openReceipt() {
  clear($("content"));
  const p = panel("إذن استلام تجريبي جديد");
  add(p, node("p", "كل البيانات وهمية. بعد التأكيد سيتم إنشاء إذن استلام مُرحّل ورفع الرصيد في قاعدة الـDemo مباشرة.", "muted"));
  const form = add(p, node("form"));
  const grid = add(form, node("div", null,"form-grid"));
  function field(label, name, type, required) {
    const wrap = add(grid, node("div",null,"field"));
    add(wrap,node("label",label));
    let input = node(type==="select"?"select":"input");
    if(type!=="select") input.type=type; input.name=name; input.required=required; add(wrap,input);
    return input;
  }
  const product=field("الصنف", "product", "select", true);
  snapshot.products.filter(x=>x.active).forEach((p)=>{const o=add(product,node("option",p.sku+" — "+p.name_ar));o.value=p.id;});
  const warehouse=field("المخزن", "warehouse","select",true);
  snapshot.warehouses.forEach((w)=>{const o=add(warehouse,node("option",w.name));o.value=w.id;});
  const qty=field("الكمية","qty","number",true);qty.min="1";qty.max="1000";qty.step="1";qty.value="1";
  const lot=field("رقم التشغيلة الجديد","lot","text",true);lot.maxLength=70;lot.value="DEMO-WEB-"+Date.now().toString(36).toUpperCase();
  const expiry=field("تاريخ انتهاء الصلاحية","expiry","date",true);
  const tomorrow=new Date(Date.now()+86400000).toLocaleDateString("en-CA",{timeZone:"Africa/Cairo"});
  expiry.min=tomorrow;expiry.value=new Date(Date.now()+86400000*365).toLocaleDateString("en-CA",{timeZone:"Africa/Cairo"});
  const actions=add(form,node("div",null,"actions"));
  const save=add(actions, node("button","حفظ وترحيل الاستلام","btn primary"));save.type="submit";
  add(actions,btn("رجوع",()=>render()));
  form.addEventListener("submit",async (e)=>{
    e.preventDefault();
    if (!Number.isInteger(Number(qty.value)) || Number(qty.value)<=0 || Number(qty.value)>1000) return info("كمية غير صالحة",true);
    if (!confirm("هل تؤكد إضافة "+qty.value+" وحدة إلى مخزون الـDemo فقط؟")) return;
    save.disabled=true;
    try {
      await doWrite("create_movement",{
        p_type:"in",p_warehouse_id:warehouse.value,
        p_lines:[{product_id:product.value,qty:Number(qty.value),lot_no:lot.value.trim(),expiry:expiry.value}],
        p_note:"DEMO cloud walkthrough",p_post:true,
        p_idem:crypto.randomUUID()
      },"تم استلام البضاعة وتحديث المخزون في Supabase");
    }catch(err){info("فشل الاستلام: "+err.message,true);save.disabled=false;}
  });
}
/* Inspired by Claude's Ctrl+K palette: search across secured cloud data only. */
function openQuickSearch() {
  if (!currentUser || !snapshot) return;
  const dialog=add(document.body,node("dialog",null,"quick-search-dialog"));
  dialog.setAttribute("aria-label","بحث سريع في النظام");
  const title=add(dialog,node("div",null,"details-head"));
  add(title,node("h2","بحث سريع"));
  function close(){dialog.close();dialog.remove();}
  add(title,btn("إغلاق ×",close));
  const search=add(dialog,node("input"));
  search.placeholder="صنف، باركود، مستشفى أو رقم عملية…";
  search.setAttribute("aria-label","بحث سريع في كل الأقسام");
  const results=add(dialog,node("div",null,"quick-results"));
  function show() {
    clear(results);
    const query=search.value.trim().toLocaleLowerCase("ar");
    const found=[];
    const matches=(...values)=>values.some(x=>String(x||"").toLocaleLowerCase("ar").includes(query));
    if(query.length) {
      snapshot.products.filter(x=>matches(x.name_ar,x.sku,x.barcode,x.brand)).slice(0,6)
        .forEach(x=>found.push({name:x.name_ar,detail:"صنف · "+x.sku,
          action:()=>showDetails(x)}));
      snapshot.customers.filter(x=>matches(x.name,x.city)).slice(0,4)
        .forEach(x=>found.push({name:x.name,detail:"مستشفى · "+x.city,
          action:()=>{tab="customers";render();}}));
      snapshot.surgery_cases.filter(x=>matches(x.no,x.procedure)).slice(0,4)
        .forEach(x=>found.push({name:x.procedure,detail:"عملية · "+x.no,
          action:()=>{tab="cases";render();}}));
    } else {
      found.push(...[
        {name:"الأصناف",detail:"اذهب إلى كتالوج الأصناف",action:()=>{tab="products";render();}},
        {name:"المخزون",detail:"التشغيلات والصلاحية",action:()=>{tab="stock";render();}},
        {name:"العمليات الجراحية",detail:"لوحة مراحل العمليات",action:()=>{tab="cases";render();}}
      ]);
    }
    if(!found.length)add(results,node("p","لا توجد نتائج مطابقة","muted"));
    found.forEach(x=>{
      const b=btn("",()=>{close();x.action();});
      b.className="quick-result";
      add(b,node("b",x.name));
      add(b,node("small",x.detail));
      add(results,b);
    });
  }
  search.addEventListener("input",show);
  dialog.addEventListener("cancel",e=>{e.preventDefault();close();});
  dialog.addEventListener("click",e=>{if(e.target===dialog)close();});
  dialog.showModal(); show();search.focus();
}
const quickButton=btn("⌕ بحث سريع  ·  Ctrl K",openQuickSearch);
quickButton.setAttribute("aria-keyshortcuts","Control+K");
$("refresh").before(quickButton);
document.addEventListener("keydown",(event)=>{
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==="k" && currentUser){
    event.preventDefault();openQuickSearch();
  }
});
$("heroStockBtn").addEventListener("click",()=>{
  tab="stock";info("");render();window.scrollTo({top:0,behavior:"auto"});
});
$("heroOrdersBtn").addEventListener("click",()=>{
  tab="orders";info("");render();window.scrollTo({top:0,behavior:"auto"});
});
$("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn=$("loginBtn");btn.disabled=true;
  $("loginError").replaceChildren();
  try{
    const email=$("email").value.trim();
    const password=$("password").value;
    const {error}=await sb.auth.signInWithPassword({email,password});
    $("password").value="";
    if(error)throw new Error("البريد أو كلمة المرور غير صحيحة، أو الدخول غير متاح.");
    await enterDashboard();
  }catch(e){
    add($("loginError"),node("div",e.message,"error"));
    await sb.auth.signOut();showLogin(e.message);
  }finally{btn.disabled=false;}
});
$("refresh").addEventListener("click", async () => {
  try{await enterDashboard();info("تم تحديث البيانات من Supabase.");}catch(e){info("فشل التحديث: "+e.message,true);}
});
$("logout").addEventListener("click",async ()=>{
  await sb.auth.signOut();showLogin();
});
(async function boot(){
  try{
    if(!await verifyAdmin()){showLogin();return;}
    await enterDashboard();
  }catch(e){
    await sb.auth.signOut();
    showLogin("تعذر فتح الجلسة: " + e.message);
  }
})();