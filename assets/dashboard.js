/* Online Retail — dashboard interativo
   Dados gerados por src/analysis.py em assets/data.js (window.RETAIL). */
(() => {
"use strict";
const R = window.RETAIL;
const $ = s => document.querySelector(s);
const SEG_VARS = ["--vip", "--alto", "--freq", "--reg", "--ocas"];
const MONTHS_PT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
const DOW_PT = ["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];
const PAGE = 15;

// Clientes: [id, país, receita, pedidos, itens, recência, segmento]
const C = R.customers.map(a => ({ id:a[0], country:a[1], rev:a[2], orders:a[3], items:a[4], recency:a[5], seg:a[6], ticket:a[2]/a[3] }));
const TOTAL_REV = C.reduce((s, c) => s + c.rev, 0);
const revRankDesc = C.map(c => c.rev).sort((a, b) => b - a);

// ---------- Formatação ----------
const nf = new Intl.NumberFormat("pt-BR");
const nf1 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits:1, minimumFractionDigits:1 });
const nf2 = new Intl.NumberFormat("pt-BR", { maximumFractionDigits:2, minimumFractionDigits:2 });
const gbp = v => "£ " + nf.format(Math.round(v));
const gbpShort = v => Math.abs(v) >= 1e6 ? "£ " + nf2.format(v / 1e6) + " mi" : Math.abs(v) >= 1e4 ? "£ " + nf1.format(v / 1e3) + " mil" : gbp(v);
const pct = (v, d = 1) => (d === 2 ? nf2 : nf1).format(v) + "%";
const monthLabel = m => { const [y, mm] = m.split("-"); return MONTHS_PT[+mm - 1] + "/" + y.slice(2); };
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[ch]));

// ---------- Estado ----------
const state = { segs:new Set(), country:null, search:"", sort:{ key:"rev", dir:-1 }, page:0, monthly:"rev", heat:"n", top:5, selected:null };

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  if (p.get("seg")) p.get("seg").split(",").map(Number).filter(i => i >= 0 && i < 5).forEach(i => state.segs.add(i));
  const ct = R.countries.indexOf(p.get("pais") || "");
  if (ct >= 0) state.country = ct;
}
function writeHash() {
  const p = new URLSearchParams();
  if (state.segs.size) p.set("seg", [...state.segs].sort().join(","));
  if (state.country !== null) p.set("pais", R.countries[state.country]);
  const h = p.toString();
  history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
}

const segOn = s => state.segs.size === 0 || state.segs.has(s);
const countryOn = c => state.country === null || state.country === c;
const filtered = () => C.filter(c => segOn(c.seg) && countryOn(c.country));

// ---------- Cores ----------
let COL = {};
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  const v = n => cs.getPropertyValue(n).trim();
  COL = { seg:SEG_VARS.map(v), ink:v("--ink"), ink2:v("--ink-2"), ink3:v("--ink-3"), line:v("--line"), surface:v("--surface"), soft:v("--soft") };
  Chart.defaults.color = COL.ink3;
  Chart.defaults.borderColor = COL.line;
  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Object.assign(Chart.defaults.plugins.tooltip, { backgroundColor:COL.ink, titleColor:COL.surface, bodyColor:COL.surface, padding:10, cornerRadius:8, boxPadding:4, usePointStyle:true });
}
const alpha = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };

// ---------- Filtros UI ----------
function buildFilters() {
  $("#chips").innerHTML = R.segments.map((s, i) =>
    `<button class="chip" type="button" data-seg="${i}" aria-pressed="false" style="--c:var(${SEG_VARS[i]})"><i></i>${esc(s)}</button>`).join("");
  $("#chips").addEventListener("click", e => { const b = e.target.closest("[data-seg]"); if (b) toggleSeg(+b.dataset.seg); });
  $("#country").innerHTML += R.countries.map((c, i) => `<option value="${i}">${esc(c)}</option>`).join("");
  $("#country").addEventListener("change", e => { state.country = e.target.value === "" ? null : +e.target.value; update(); });
  $("#reset").addEventListener("click", () => { state.segs.clear(); state.country = null; state.search = ""; $("#search").value = ""; update(); });
}
function toggleSeg(i) { state.segs.has(i) ? state.segs.delete(i) : state.segs.add(i); update(); }
function toggleCountry(i) { state.country = state.country === i ? null : i; update(); }

function syncFilterUI() {
  document.querySelectorAll(".chip").forEach(b => b.setAttribute("aria-pressed", state.segs.has(+b.dataset.seg)));
  $("#country").value = state.country === null ? "" : String(state.country);
  const parts = [];
  if (state.segs.size) parts.push([...state.segs].sort().map(i => R.segments[i]).join(", "));
  if (state.country !== null) parts.push(R.countries[state.country]);
  $("#activeFilter").textContent = parts.length ? "Filtrando: " + parts.join(" · ") : "Mostrando todos os 4.338 clientes";
  $("#reset").disabled = !parts.length && !state.search;
}

// ---------- Barras de participação (hero) ----------
function renderSplit() {
  const base = C.filter(c => countryOn(c.country));
  const tc = base.length, tr = base.reduce((s, c) => s + c.rev, 0);
  const agg = R.segments.map((_, i) => { const g = base.filter(c => c.seg === i); return { n:g.length, rev:g.reduce((s, c) => s + c.rev, 0) }; });
  const bar = (el, key, total) => {
    el.innerHTML = agg.map((a, i) => {
      const share = total ? a[key] / total * 100 : 0;
      const cls = [i === 4 ? "light" : "", share < 7 ? "tiny" : "", state.segs.size && !state.segs.has(i) ? "dim" : ""].join(" ");
      return `<button type="button" class="${cls}" data-seg="${i}" style="flex-grow:${Math.max(share, 0.0001)};background:var(${SEG_VARS[i]})"
        aria-pressed="${state.segs.has(i)}" title="${esc(R.segments[i])}: ${pct(share)} ${key === "n" ? "dos clientes" : "da receita"}">
        <span>${pct(share, 0).replace(",0", "")}</span><small>${esc(R.segments[i])}</small></button>`;
    }).join("");
  };
  bar($("#barCustomers"), "n", tc);
  bar($("#barRevenue"), "rev", tr);

  const where = state.country !== null ? ` em ${esc(R.countries[state.country])}` : "";
  let story;
  if (!tc) story = "Nenhum cliente com esse filtro.";
  else if (state.segs.size) {
    const sel = [...state.segs];
    const n = sel.reduce((s, i) => s + agg[i].n, 0), r = sel.reduce((s, i) => s + agg[i].rev, 0);
    story = `${sel.length > 1 ? "Os segmentos selecionados somam" : "O segmento " + esc(R.segments[sel[0]]) + " soma"} <b>${pct(n / tc * 100)} dos clientes</b> e <b>${pct(r / tr * 100)} da receita</b>${where}.`;
  } else {
    story = `VIPs são <b>${pct(agg[0].n / tc * 100)} dos clientes</b>${where}, mas respondem por <b>${pct(agg[0].rev / tr * 100)} da receita</b>. Ocasionais são o oposto: maioria na base, fatia pequena do faturamento.`;
  }
  $("#splitStory").innerHTML = story;
}

// ---------- KPIs ----------
function renderKpis(list) {
  const n = list.length, rev = list.reduce((s, c) => s + c.rev, 0), ord = list.reduce((s, c) => s + c.orders, 0);
  const revs = list.map(c => c.rev).sort((a, b) => a - b);
  const med = n ? (n % 2 ? revs[(n - 1) / 2] : (revs[n / 2 - 1] + revs[n / 2]) / 2) : 0;
  const mean = n ? rev / n : 0;
  $("#kCustomers").textContent = nf.format(n);
  $("#kCustomersSub").textContent = pct(n / C.length * 100) + " da base";
  $("#kRevenue").textContent = gbpShort(rev);
  $("#kRevenueSub").textContent = pct(rev / TOTAL_REV * 100) + " do total";
  $("#kOrders").textContent = nf.format(ord);
  $("#kOrdersSub").textContent = n ? nf1.format(ord / n) + " por cliente" : "—";
  $("#kTicket").textContent = ord ? gbp(rev / ord) : "—";
  $("#kMedian").textContent = n ? gbp(med) : "—";
  $("#kMean").textContent = n ? gbp(mean) : "—";
  $("#kRatio").textContent = med ? `A média é ${nf1.format(mean / med)}× a mediana: poucos clientes puxam a média para cima.` : "";
}

// ---------- Gráficos ----------
const charts = {};
const baseOpts = () => ({ responsive:true, maintainAspectRatio:false, animation:{ duration:450 }, interaction:{ mode:"nearest", intersect:false } });

function initCharts() {
  // Mensal
  charts.monthly = new Chart($("#cMonthly"), {
    type:"bar",
    data:{ labels:R.months.map(monthLabel), datasets:R.segments.map((s, i) => ({ label:s, data:[], backgroundColor:COL.seg[i], borderRadius:3, borderSkipped:false, stack:"s" })) },
    options:{ ...baseOpts(), interaction:{ mode:"index", intersect:false },
      plugins:{ legend:{ position:"bottom", labels:{ usePointStyle:true, pointStyle:"rectRounded", boxWidth:10, padding:16 },
          onClick:(e, item) => toggleSeg(item.datasetIndex) },
        tooltip:{ callbacks:{ label:c => c.raw ? ` ${c.dataset.label}: ${state.monthly === "rev" ? gbp(c.raw) : nf.format(c.raw) + " pedidos"}` : null,
          footer:items => "Total: " + (state.monthly === "rev" ? gbp(items.reduce((s, i) => s + i.raw, 0)) : nf.format(items.reduce((s, i) => s + i.raw, 0)) + " pedidos") } } },
      scales:{ x:{ stacked:true, grid:{ display:false } }, y:{ stacked:true, border:{ display:false }, ticks:{ callback:v => state.monthly === "rev" ? gbpShort(v) : nf.format(v) } } } }
  });

  // Pareto / concentração
  const topLine = { id:"topLine", afterDatasetsDraw(ch) {
    const { ctx, chartArea:a, scales:{ x, y } } = ch; const d = ch.data.datasets[0].data; if (!d.length) return;
    const px = x.getPixelForValue(state.top), py = y.getPixelForValue(d[state.top].y);
    ctx.save(); ctx.strokeStyle = COL.seg[0]; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(px, a.bottom); ctx.lineTo(px, py); ctx.lineTo(a.left, py); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = COL.seg[0]; ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  } };
  charts.pareto = new Chart($("#cPareto"), {
    type:"line", plugins:[topLine],
    data:{ datasets:[
      { label:"Receita acumulada", data:[], borderColor:COL.ink, backgroundColor:alpha(COL.seg[0], .1), fill:true, pointRadius:0, borderWidth:2, tension:.15 },
      { label:"Distribuição igual", data:[{ x:0, y:0 }, { x:100, y:100 }], borderColor:COL.ink3, borderDash:[3, 4], pointRadius:0, borderWidth:1 } ] },
    options:{ ...baseOpts(), parsing:false,
      plugins:{ legend:{ display:false }, tooltip:{ filter:i => i.datasetIndex === 0, callbacks:{ title:() => "", label:c => ` Top ${c.raw.x}% → ${pct(c.raw.y)} da receita` } } },
      scales:{ x:{ type:"linear", min:0, max:100, title:{ display:true, text:"% dos clientes (maior → menor receita)" }, ticks:{ callback:v => v + "%" }, grid:{ display:false } },
        y:{ min:0, max:100, border:{ display:false }, ticks:{ callback:v => v + "%" } } } }
  });

  // Países
  charts.country = new Chart($("#cCountry"), {
    type:"bar", data:{ labels:[], datasets:[{ data:[], backgroundColor:[], borderRadius:4, idx:[] }] },
    options:{ ...baseOpts(), indexAxis:"y", interaction:{ mode:"index", intersect:false },
      onClick:(e, els, ch) => { const el = ch.getElementsAtEventForMode(e, "index", { intersect:false }, false)[0]; if (el) toggleCountry(ch.data.datasets[0].idx[el.index]); },
      onHover:(e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
      plugins:{ legend:{ display:false }, tooltip:{ callbacks:{ label:c => ` ${gbp(c.raw)} · ${c.dataset.meta[c.dataIndex]} clientes` } } },
      scales:{ x:{ border:{ display:false }, ticks:{ maxTicksLimit:5, maxRotation:0, callback:v => gbpShort(v) } }, y:{ grid:{ display:false } } } }
  });

  // Dispersão
  const cuts = { id:"cuts", beforeDatasetsDraw(ch) {
    const { ctx, chartArea:a, scales:{ x, y } } = ch, t = R.thresholds;
    ctx.save(); ctx.strokeStyle = COL.ink3; ctx.setLineDash([5, 5]); ctx.lineWidth = 1;
    const vx = x.getPixelForValue(t.ord_q75), hy = y.getPixelForValue(t.rev_q75);
    ctx.beginPath(); ctx.moveTo(vx, a.top); ctx.lineTo(vx, a.bottom); ctx.moveTo(a.left, hy); ctx.lineTo(a.right, hy); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = COL.ink3; ctx.font = "11px " + Chart.defaults.font.family;
    ctx.fillText(`${t.ord_q75} pedidos (Q75)`, vx + 6, a.top + 12);
    ctx.fillText(`${gbp(t.rev_q75)} (Q75)`, a.left + 6, hy - 6); ctx.restore();
  } };
  charts.scatter = new Chart($("#cScatter"), {
    type:"scatter", plugins:[cuts],
    data:{ datasets:[...R.segments.map((s, i) => ({ label:s, data:[], backgroundColor:alpha(COL.seg[i], .6), borderColor:COL.seg[i], borderWidth:0, pointRadius:2.6, pointHoverRadius:6 })),
      { label:"Selecionado", data:[], pointRadius:9, pointHoverRadius:9, backgroundColor:"transparent", borderColor:COL.ink, borderWidth:2.5 }] },
    options:{ ...baseOpts(), parsing:false, animation:{ duration:300 }, interaction:{ mode:"nearest", intersect:true },
      onClick:(e, els) => { const el = els.find(x => x.datasetIndex < 5); if (el) openDrawer(charts.scatter.data.datasets[el.datasetIndex].data[el.index].c); },
      onHover:(e, els) => { e.native.target.style.cursor = els.length ? "pointer" : "default"; },
      plugins:{ legend:{ position:"bottom", labels:{ usePointStyle:true, pointStyle:"circle", boxWidth:8, padding:16, filter:i => i.datasetIndex < 5 },
          onClick:(e, item) => toggleSeg(item.datasetIndex) },
        tooltip:{ filter:i => i.datasetIndex < 5, callbacks:{ title:() => "", label:c => { const k = c.raw.c; return [` Cliente ${k.id} · ${R.countries[k.country]}`, ` ${nf.format(k.orders)} pedidos · ${gbp(k.rev)}`]; } } } },
      scales:{ x:{ type:"logarithmic", min:.8, title:{ display:true, text:"Pedidos (log)" }, grid:{ display:false },
          ticks:{ callback:v => [1, 2, 5, 10, 20, 50, 100, 200].includes(v) ? v : null } },
        y:{ type:"logarithmic", title:{ display:true, text:"Receita total (log)" }, border:{ display:false },
          ticks:{ callback:v => [10, 100, 1000, 10000, 100000].includes(v) ? gbpShort(v) : null } } } }
  });
}

function renderMonthly() {
  const M = R.months.length, key = state.monthly === "rev" ? 3 : 4;
  const rows = R.segments.map(() => new Array(M).fill(0));
  for (const r of R.monthly) if (countryOn(r[1])) rows[r[2]][r[0]] += r[key];
  charts.monthly.data.datasets.forEach((d, i) => { d.data = rows[i].map(v => Math.round(v)); d.hidden = !segOn(i); });
  charts.monthly.update();
}

function renderPareto(list) {
  const revs = list.map(c => c.rev).sort((a, b) => b - a), n = revs.length, tot = revs.reduce((a, b) => a + b, 0);
  const cum = [0]; revs.forEach((v, i) => cum.push(cum[i] + v));
  const pts = [];
  for (let x = 0; x <= 100; x++) { const k = Math.min(n, Math.max(x ? 1 : 0, Math.floor(n * x / 100))); pts.push({ x, y: tot ? cum[k] / tot * 100 : 0 }); }
  charts.pareto.data.datasets[0].data = n ? pts : [];
  charts.pareto.update();
  renderTop();
}
function renderTop() {
  const d = charts.pareto.data.datasets[0].data;
  $("#topOut").textContent = state.top;
  $("#topResult").innerHTML = d.length ? `Geram <b>${pct(d[state.top].y)}</b> da receita do recorte.` : "Sem clientes no filtro.";
  charts.pareto.draw();
}

function renderCountry() {
  const by = new Map();
  for (const c of C) if (segOn(c.seg)) { const a = by.get(c.country) || { rev:0, n:0 }; a.rev += c.rev; a.n++; by.set(c.country, a); }
  let top = [...by.entries()].sort((a, b) => b[1].rev - a[1].rev).slice(0, 10);
  if (state.country !== null && !top.some(t => t[0] === state.country) && by.has(state.country)) top = [...top.slice(0, 9), [state.country, by.get(state.country)]];
  const d = charts.country.data;
  d.labels = top.map(t => R.countries[t[0]]);
  d.datasets[0].data = top.map(t => Math.round(t[1].rev));
  d.datasets[0].meta = top.map(t => nf.format(t[1].n));
  d.datasets[0].idx = top.map(t => t[0]);
  d.datasets[0].backgroundColor = top.map(t => state.country === null || state.country === t[0] ? COL.seg[0] : alpha(COL.seg[0], .2));
  // Reino Unido domina; escala log deixaria o resto legível, mas linear conta a história real
  charts.country.update();
}

function jitter(id) { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0; return ((h & 1023) / 1023 - .5) * .22; }
function renderScatter(list) {
  const ds = charts.scatter.data.datasets;
  R.segments.forEach((_, i) => { ds[i].data = []; });
  for (const c of list) ds[c.seg].data.push({ x:c.orders * (1 + jitter(c.id)), y:Math.max(c.rev, 1), c });
  const mx = list.reduce((m, c) => Math.max(m, c.orders), 1), my = list.reduce((m, c) => Math.max(m, c.rev), 10);
  charts.scatter.options.scales.x.max = mx * 1.3;
  charts.scatter.options.scales.y.max = my * 1.5;
  renderSelectedPoint();
  charts.scatter.update();
}
function renderSelectedPoint() {
  const s = state.selected, ds = charts.scatter.data.datasets[5];
  ds.data = s ? [{ x:s.orders * (1 + jitter(s.id)), y:Math.max(s.rev, 1), c:s }] : [];
}

function spearman(list) {
  const n = list.length; if (n < 3) return null;
  const rank = arr => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]), r = new Array(n);
    for (let i = 0; i < n;) { let j = i; while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg; i = j + 1; } return r; };
  const a = rank(list.map(c => c.orders)), b = rank(list.map(c => c.ticket));
  const ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let num = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? num / Math.sqrt(da * db) : null;
}
function renderSpearman(list) {
  const r = spearman(list);
  $("#spearmanNote").innerHTML = r === null ? "" :
    `Correlação de Spearman entre pedidos e ticket médio no recorte: <b>${nf2.format(r)}</b>. ${Math.abs(r) < .3 ? "Fraca — comprar mais vezes não significa gastar mais por pedido. Alto valor ganha no ticket, Frequente ganha na recorrência." : "Há relação entre comprar mais vezes e o valor por pedido neste recorte."}`;
}

// ---------- Mapa de calor ----------
const tip = Object.assign(document.createElement("div"), { className:"heat-tip" }); document.body.appendChild(tip);
function renderHeat() {
  const hours = [...new Set(R.heat.map(h => h[1]))].sort((a, b) => a - b);
  const days = [0, 1, 2, 3, 4, 6];
  const key = state.heat === "n" ? 4 : 5, grid = {};
  for (const h of R.heat) if (countryOn(h[2]) && segOn(h[3])) grid[h[0] + "-" + h[1]] = (grid[h[0] + "-" + h[1]] || 0) + h[key];
  const max = Math.max(1, ...Object.values(grid));
  const el = $("#heat");
  el.style.gridTemplateColumns = `40px repeat(${hours.length}, minmax(28px,1fr))`;
  let html = "<div></div>" + hours.map(h => `<div class="cl">${h}h</div>`).join("");
  for (const d of days) {
    html += `<div class="rl">${DOW_PT[d]}</div>`;
    for (const h of hours) {
      const v = grid[d + "-" + h] || 0, t = v / max;
      const bg = v ? `color-mix(in srgb, var(--vip) ${Math.round(8 + t * 92)}%, var(--soft))` : "var(--soft)";
      html += `<div class="cell" style="background:${bg}" data-tip="${DOW_PT[d]}, ${h}h: ${state.heat === "n" ? nf.format(v) + " pedidos" : gbp(v)}"></div>`;
    }
  }
  el.innerHTML = html;
}
$("#heat").addEventListener("mousemove", e => { const c = e.target.closest(".cell"); if (!c) { tip.style.opacity = 0; return; }
  tip.textContent = c.dataset.tip; tip.style.opacity = 1; tip.style.left = e.clientX + 12 + "px"; tip.style.top = e.clientY - 34 + "px"; });
$("#heat").addEventListener("mouseleave", () => { tip.style.opacity = 0; });

// ---------- Tabela ----------
const COLS = [
  { key:"id", label:"Cliente", fmt:c => c.id },
  { key:"country", label:"País", fmt:c => esc(R.countries[c.country]), sortVal:c => R.countries[c.country] },
  { key:"seg", label:"Segmento", fmt:c => `<span class="tag" style="--c:var(${SEG_VARS[c.seg]})"><i></i>${esc(R.segments[c.seg])}</span>` },
  { key:"rev", label:"Receita", fmt:c => gbp(c.rev) },
  { key:"orders", label:"Pedidos", fmt:c => nf.format(c.orders) },
  { key:"ticket", label:"Ticket médio", fmt:c => gbp(c.ticket) },
  { key:"items", label:"Itens", fmt:c => nf.format(c.items) },
  { key:"recency", label:"Última compra", fmt:c => (c.recency === 1 ? "há 1 dia" : `há ${nf.format(c.recency)} dias`) },
];
function tableRows(list) {
  const q = state.search.trim().toLowerCase();
  let rows = q ? list.filter(c => c.id.includes(q) || R.countries[c.country].toLowerCase().includes(q)) : list.slice();
  const col = COLS.find(c => c.key === state.sort.key), val = col.sortVal || (c => c[col.key]);
  rows.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * state.sort.dir; });
  return rows;
}
function renderTable(list) {
  $("#thead").innerHTML = COLS.map(c => `<th scope="col" ${state.sort.key === c.key ? `aria-sort="${state.sort.dir > 0 ? "ascending" : "descending"}"` : ""}><button type="button" data-sort="${c.key}">${c.label}</button></th>`).join("");
  const rows = tableRows(list), pages = Math.max(1, Math.ceil(rows.length / PAGE));
  state.page = Math.min(state.page, pages - 1);
  const slice = rows.slice(state.page * PAGE, state.page * PAGE + PAGE);
  $("#tbody").innerHTML = slice.length ? slice.map(c => `<tr tabindex="0" data-id="${c.id}">${COLS.map(col => `<td>${col.fmt(c)}</td>`).join("")}</tr>`).join("")
    : `<tr><td colspan="${COLS.length}" class="empty">Nenhum cliente encontrado. Tente outro termo ou limpe os filtros.</td></tr>`;
  $("#pageInfo").textContent = rows.length ? `${state.page * PAGE + 1}–${state.page * PAGE + slice.length} de ${nf.format(rows.length)}` : "0 resultados";
  $("#prev").disabled = state.page === 0; $("#next").disabled = state.page >= pages - 1;
  $("#tableDesc").textContent = "Clique numa coluna para ordenar e numa linha para ver o cliente.";
}
$("#thead").addEventListener("click", e => { const b = e.target.closest("[data-sort]"); if (!b) return; const k = b.dataset.sort;
  state.sort = state.sort.key === k ? { key:k, dir:-state.sort.dir } : { key:k, dir:["id", "country", "seg", "recency"].includes(k) ? 1 : -1 }; state.page = 0; renderTable(filtered()); });
$("#tbody").addEventListener("click", e => { const tr = e.target.closest("tr[data-id]"); if (tr) openDrawer(C.find(c => c.id === tr.dataset.id)); });
$("#tbody").addEventListener("keydown", e => { if (e.key === "Enter") { const tr = e.target.closest("tr[data-id]"); if (tr) openDrawer(C.find(c => c.id === tr.dataset.id)); } });
$("#prev").addEventListener("click", () => { state.page--; renderTable(filtered()); });
$("#next").addEventListener("click", () => { state.page++; renderTable(filtered()); });
let searchT; $("#search").addEventListener("input", e => { clearTimeout(searchT); searchT = setTimeout(() => { state.search = e.target.value; state.page = 0; renderTable(filtered()); syncFilterUI(); }, 150); });
$("#exportCsv").addEventListener("click", () => {
  const rows = tableRows(filtered());
  const csv = ["cliente;pais;segmento;receita;pedidos;ticket_medio;itens;recencia_dias",
    ...rows.map(c => [c.id, R.countries[c.country], R.segments[c.seg], c.rev.toFixed(2).replace(".", ","), c.orders, c.ticket.toFixed(2).replace(".", ","), c.items, c.recency].join(";"))].join("\n");
  const a = Object.assign(document.createElement("a"), { href:URL.createObjectURL(new Blob(["\ufeff" + csv], { type:"text/csv;charset=utf-8" })), download:"clientes_filtrados.csv" });
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---------- Drawer ----------
let lastFocus = null;
function openDrawer(c) {
  if (!c) return;
  lastFocus = document.activeElement; state.selected = c;
  const pos = revRankDesc.indexOf(c.rev) + 1, topPct = pos / C.length * 100;
  $("#dSeg").innerHTML = `<i style="--c:var(${SEG_VARS[c.seg]})"></i>${esc(R.segments[c.seg])}`;
  $("#dTitle").textContent = "Cliente " + c.id;
  $("#dCountry").textContent = R.countries[c.country];
  const stats = [["Receita total", gbp(c.rev)], ["Pedidos", nf.format(c.orders)], ["Ticket médio", gbp(c.ticket)], ["Itens comprados", nf.format(c.items)], ["Última compra", (c.recency === 1 ? "há 1 dia" : `há ${nf.format(c.recency)} dias`)], ["Itens por pedido", nf1.format(c.items / c.orders)]];
  $("#dStats").innerHTML = stats.map(s => `<div><dt>${s[0]}</dt><dd>${s[1]}</dd></div>`).join("");
  $("#dRank").innerHTML = `${pos}º maior receita entre ${nf.format(C.length)} clientes — está no <b>top ${topPct < 1 ? nf2.format(topPct) : nf1.format(topPct)}%</b>. Representa ${pct(c.rev / TOTAL_REV * 100, 2)} de toda a receita.`;
  $("#drawer").classList.add("open"); $("#drawer").setAttribute("aria-hidden", "false"); $("#scrim").classList.add("open");
  $("#dClose").focus();
  renderSelectedPoint(); charts.scatter.update("none");
}
function closeDrawer() {
  $("#drawer").classList.remove("open"); $("#drawer").setAttribute("aria-hidden", "true"); $("#scrim").classList.remove("open");
  state.selected = null; renderSelectedPoint(); charts.scatter.update("none");
  if (lastFocus) lastFocus.focus();
}
$("#dClose").addEventListener("click", closeDrawer);
$("#scrim").addEventListener("click", closeDrawer);
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#drawer").classList.contains("open")) closeDrawer(); });

// ---------- Seções estáticas ----------
function renderNotes() {
  const q = R.quality;
  $("#qValid").textContent = nf.format(R.valid);
  const items = [
    ["CustomerID nulo", pct(q.null_customer_pct, 2), "ficam fora da análise por cliente"],
    ["Invoices canceladas", nf.format(q.cancelled), "número começa com C"],
    ["Quantidade negativa", nf.format(q.negative_qty), `${nf.format(q.negative_qty_not_c)} fora de invoices canceladas`],
    ["Preço zero", nf.format(q.zero_price), "brindes, ajustes e erros de cadastro"],
    ["Linhas duplicadas", nf.format(q.duplicates), "mantidas, como no estudo original"],
    ["Registros brutos", nf.format(q.raw), "ponto de partida"],
  ];
  $("#quality").innerHTML = items.map(i => `<div><dt>${i[0]}</dt><dd>${i[1]}<small>${i[2]}</small></dd></div>`).join("");
  const t = R.thresholds;
  const rules = [
    [0, `receita ≥ ${gbp(t.rev_q75)} e ≥ ${t.ord_q75} pedidos`],
    [2, `≥ ${t.ord_q75} pedidos, receita abaixo do Q75`],
    [1, `receita ≥ ${gbp(t.rev_q75)}, menos de ${t.ord_q75} pedidos`],
    [3, `receita ≥ ${gbp(t.rev_med)} e ≥ ${t.ord_med} pedidos (medianas)`],
    [4, "todos os demais"],
  ];
  $("#rules").innerHTML = rules.map(r => `<div class="rule"><span class="tag" style="--c:var(${SEG_VARS[r[0]]})"><i></i>${R.segments[r[0]]}</span><span>${r[1]}</span></div>`).join("");
}

// ---------- Orquestração ----------
function update() {
  const list = filtered();
  syncFilterUI(); writeHash();
  renderSplit(); renderKpis(list); renderMonthly(); renderPareto(list); renderCountry(); renderScatter(list); renderSpearman(list); renderHeat();
  state.page = 0; renderTable(list);
}

document.querySelectorAll("[data-metric]").forEach(b => b.addEventListener("click", () => {
  state.monthly = b.dataset.metric; document.querySelectorAll("[data-metric]").forEach(x => x.setAttribute("aria-checked", x === b)); renderMonthly(); }));
document.querySelectorAll("[data-heat]").forEach(b => b.addEventListener("click", () => {
  state.heat = b.dataset.heat; document.querySelectorAll("[data-heat]").forEach(x => x.setAttribute("aria-checked", x === b)); renderHeat(); }));
$("#topPct").addEventListener("input", e => { state.top = +e.target.value; renderTop(); });
["#barCustomers", "#barRevenue"].forEach(s => $(s).addEventListener("click", e => { const b = e.target.closest("[data-seg]"); if (b) toggleSeg(+b.dataset.seg); }));

const filtersEl = document.querySelector(".filters");
addEventListener("scroll", () => filtersEl.classList.toggle("stuck", filtersEl.getBoundingClientRect().top <= 1), { passive:true });

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  readColors();
  Object.values(charts).forEach(ch => ch.destroy());
  initCharts(); update();
});

readHash(); readColors(); buildFilters(); renderNotes(); initCharts(); update();
})();
