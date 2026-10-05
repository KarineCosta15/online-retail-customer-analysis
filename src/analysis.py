"""
Online Retail — reprodução da análise e exportação dos dados do dashboard.

Uso:
    pip install -r requirements.txt
    python src/analysis.py                      # baixa da UCI via ucimlrepo
    python src/analysis.py "Online Retail.xlsx" # ou usa o arquivo local

Gera assets/data.js, consumido por index.html.
"""
import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SEGMENTS = ["VIP", "Alto valor", "Frequente", "Regular", "Ocasional"]


def load() -> pd.DataFrame:
    if len(sys.argv) > 1:
        return pd.read_excel(sys.argv[1])
    from ucimlrepo import fetch_ucirepo
    r = fetch_ucirepo(id=352)
    return pd.concat([r.data.ids.reset_index(drop=True),
                      r.data.features.reset_index(drop=True)], axis=1)


df = load()
df["InvoiceDate"] = pd.to_datetime(df["InvoiceDate"], errors="coerce")
df["InvoiceNo"] = df["InvoiceNo"].astype(str)
df["Revenue"] = df["Quantity"] * df["UnitPrice"]
df["IsCancelled"] = df["InvoiceNo"].str.upper().str.startswith("C")

# ---------- Qualidade ----------
quality = {
    "raw": len(df),
    "null_customer_pct": round(df.CustomerID.isna().mean() * 100, 2),
    "cancelled": int(df.IsCancelled.sum()),
    "negative_qty": int((df.Quantity <= 0).sum()),
    "negative_qty_not_c": int(((df.Quantity <= 0) & ~df.IsCancelled).sum()),
    "zero_price": int((df.UnitPrice == 0).sum()),
    "duplicates": int(df.duplicated().sum()),
}

# ---------- Base analítica ----------
sales = df[(~df.IsCancelled) & (df.Quantity > 0) & (df.UnitPrice > 0)].copy()
c = sales[sales.CustomerID.notna()].copy()
c["CustomerID"] = c.CustomerID.astype(int).astype(str)
ref_date = c.InvoiceDate.max() + pd.Timedelta(days=1)

m = c.groupby("CustomerID").agg(
    total_revenue=("Revenue", "sum"), orders=("InvoiceNo", "nunique"),
    total_items=("Quantity", "sum"), first_purchase=("InvoiceDate", "min"),
    last_purchase=("InvoiceDate", "max"), country=("Country", "first"),
).reset_index()
m["avg_ticket"] = m.total_revenue / m.orders
m["recency"] = (ref_date - m.last_purchase).dt.days

rev_med, rev_q75 = m.total_revenue.median(), m.total_revenue.quantile(.75)
ord_med, ord_q75 = m.orders.median(), m.orders.quantile(.75)


def classify(x):
    if x.total_revenue >= rev_q75 and x.orders >= ord_q75: return "VIP"
    if x.orders >= ord_q75: return "Frequente"
    if x.total_revenue >= rev_q75: return "Alto valor"
    if x.total_revenue >= rev_med and x.orders >= ord_med: return "Regular"
    return "Ocasional"


m["segment"] = m.apply(classify, axis=1)
c = c.merge(m[["CustomerID", "segment"]], on="CustomerID")

s = m.groupby("segment").agg(
    customers=("CustomerID", "count"), revenue=("total_revenue", "sum"),
    avg_orders=("orders", "mean"), avg_ticket=("avg_ticket", "mean")).reset_index()
s["customer_share"] = s.customers / s.customers.sum() * 100
s["revenue_share"] = s.revenue / s.revenue.sum() * 100
print(f"Raw: {len(df):,}\nVendas válidas: {len(sales):,}\nPedidos: {c.InvoiceNo.nunique():,}"
      f"\nClientes: {c.CustomerID.nunique():,}\nReceita: £ {c.Revenue.sum():,.2f}")
print(s.sort_values("revenue", ascending=False).round(2).to_string(index=False))
print("Spearman pedidos x ticket:", round(m.orders.corr(m.avg_ticket, method="spearman"), 3))

# ---------- Exportação para o dashboard ----------
countries = sorted(m.country.unique(), key=lambda k: -m.loc[m.country == k, "total_revenue"].sum())
ci = {k: i for i, k in enumerate(countries)}
si = {k: i for i, k in enumerate(SEGMENTS)}
c["month"] = c.InvoiceDate.dt.strftime("%Y-%m")
months = sorted(c.month.unique())
mi = {k: i for i, k in enumerate(months)}

customers = [[r.CustomerID, ci[r.country], round(r.total_revenue, 2), int(r.orders), int(r.total_items),
              int(r.recency), si[r.segment]] for r in m.itertuples()]

g = c.groupby(["month", "Country", "segment"]).agg(rev=("Revenue", "sum"), orders=("InvoiceNo", "nunique")).reset_index()
monthly = [[mi[r.month], ci[r.Country], si[r.segment], round(r.rev, 2), int(r.orders)] for r in g.itertuples()
           if r.Country in ci]

inv = c.groupby("InvoiceNo").agg(d=("InvoiceDate", "first"), Country=("Country", "first"),
                                 segment=("segment", "first"), rev=("Revenue", "sum")).reset_index()
inv["dow"], inv["hour"] = inv.d.dt.dayofweek, inv.d.dt.hour
h = inv.groupby(["dow", "hour", "Country", "segment"]).agg(n=("InvoiceNo", "count"), rev=("rev", "sum")).reset_index()
heat = [[int(r.dow), int(r.hour), ci[r.Country], si[r.segment], int(r.n), round(r.rev, 2)] for r in h.itertuples()
        if r.Country in ci]

data = {
    "quality": quality, "valid": len(sales),
    "thresholds": {"rev_med": rev_med, "rev_q75": rev_q75, "ord_med": ord_med, "ord_q75": ord_q75},
    "spearman": round(m.orders.corr(m.avg_ticket, method="spearman"), 3),
    "segments": SEGMENTS, "countries": countries, "months": months,
    "customers": customers, "monthly": monthly, "heat": heat,
}
out = ROOT / "assets" / "data.js"
out.parent.mkdir(exist_ok=True)
out.write_text("window.RETAIL=" + json.dumps(data, separators=(",", ":"), ensure_ascii=False) + ";", encoding="utf-8")
print(f"\nDados do dashboard salvos em {out} ({out.stat().st_size/1024:.0f} KB)")
