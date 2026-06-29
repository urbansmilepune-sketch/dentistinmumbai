"""
READ-ONLY dentist outreach segmentation.
Pulls dentist-side data only (dentists, dentist_treatments, Supabase Auth
sign-in timestamps matched by dentist email). No patient/appointment tables.

Outputs:
  dentist-outreach-segments.csv   one row per dentist, sorted by segment
  dentist-blank-fees.csv          every dentist with no treatment fee set
"""
import os, json, csv, urllib.request, urllib.error
from datetime import datetime, timezone, timedelta

# --- load .env.local ---
env = {}
with open(".env.local") as f:
    for line in f:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

BASE = env["NEXT_PUBLIC_SUPABASE_URL"]
KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
REST = BASE + "/rest/v1"
H = {"apikey": KEY, "Authorization": "Bearer " + KEY}

def get(url, headers=None, want_headers=False):
    req = urllib.request.Request(url, headers={**H, **(headers or {})})
    with urllib.request.urlopen(req) as r:
        body = r.read().decode()
        if want_headers:
            return body, dict(r.headers)
        return body

def rest_all(path):
    """Fetch all rows with range pagination."""
    out, step, start = [], 1000, 0
    while True:
        body, hdrs = get(f"{REST}/{path}",
                         headers={"Range-Unit": "items",
                                  "Range": f"{start}-{start+step-1}"},
                         want_headers=True)
        chunk = json.loads(body)
        out.extend(chunk)
        cr = hdrs.get("Content-Range", "")  # e.g. 0-999/725
        total = cr.split("/")[-1] if "/" in cr else None
        if len(chunk) < step or (total and total.isdigit() and len(out) >= int(total)):
            break
        start += step
    return out

# --- 1. dentists (dentist-side only) ---
dentists = rest_all("dentists?select=id,name,clinic_name,city,email,created_at,consultation_fee")

# --- 2. treatment fees ---
treats = rest_all("dentist_treatments?select=dentist_id,fee_from,fee_to")
fee_set = set()
for t in treats:
    ff = t.get("fee_from") or 0
    ft = t.get("fee_to") or 0
    if (ff and ff > 0) or (ft and ft > 0):
        fee_set.add(t["dentist_id"])

# --- 3. Supabase Auth sign-in data, matched by dentist email only ---
auth_by_email = {}
page = 1
while True:
    body = get(f"{BASE}/auth/v1/admin/users?page={page}&per_page=1000")
    users = json.loads(body).get("users", [])
    if not users:
        break
    for u in users:
        em = (u.get("email") or "").strip().lower()
        if em:
            auth_by_email[em] = u
    page += 1
    if len(users) < 1000:
        break

NOW = datetime.now(timezone.utc)

def parse_ts(s):
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    # trim fractional seconds to 6 digits for fromisoformat
    if "." in s:
        head, rest = s.split(".", 1)
        frac = ""
        tz = ""
        for i, ch in enumerate(rest):
            if ch.isdigit():
                frac += ch
            else:
                tz = rest[i:]
                break
        s = f"{head}.{frac[:6]}{tz}"
    try:
        return datetime.fromisoformat(s)
    except ValueError:
        return None

rows = []
for d in dentists:
    em = (d.get("email") or "").strip().lower()
    u = auth_by_email.get(em)
    last = parse_ts(u.get("last_sign_in_at")) if u else None
    auth_created = parse_ts(u.get("created_at")) if u else None

    days = (NOW - last).total_seconds() / 86400 if last else None
    auto_login_only = bool(last and auth_created and abs((last - auth_created).total_seconds()) <= 600)

    if last is None:
        segment, reason = "COLD", "never_logged_in"
    elif auto_login_only:
        segment, reason = "COLD", "auto_login_only(<=10min of signup)"
    elif days > 30:
        segment, reason = "COLD", ">30d"
    elif days <= 7:
        segment, reason = "ACTIVE", "<=7d"
    else:
        segment, reason = "DORMANT", "8-30d"

    fees_flag = "FEES_SET" if d["id"] in fee_set else "FEES_BLANK"

    rows.append({
        "segment": segment,
        "fees_flag": fees_flag,
        "name": d.get("name") or "",
        "clinic": d.get("clinic_name") or "",
        "city": d.get("city") or "",
        "email": d.get("email") or "",
        "created_at": d.get("created_at") or "",
        "last_sign_in_at": (u.get("last_sign_in_at") if u else "") or "",
        "days_since_login": ("" if days is None else round(days, 1)),
        "consultation_fee": d.get("consultation_fee"),
        "treatment_fees_set": ("yes" if d["id"] in fee_set else "blank"),
        "segment_reason": reason,
        "id": d["id"],
    })

seg_order = {"ACTIVE": 0, "DORMANT": 1, "COLD": 2}
rows.sort(key=lambda r: (seg_order[r["segment"]], r["fees_flag"], r["name"].lower()))

cols = ["segment", "fees_flag", "name", "clinic", "city", "email",
        "created_at", "last_sign_in_at", "days_since_login",
        "consultation_fee", "treatment_fees_set", "segment_reason", "id"]
with open("dentist-outreach-segments.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    w.writerows(rows)

blank = [r for r in rows if r["fees_flag"] == "FEES_BLANK"]
blank.sort(key=lambda r: (r["city"].lower(), r["name"].lower()))
with open("dentist-blank-fees.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=["name", "clinic", "city"])
    w.writeheader()
    for r in blank:
        w.writerow({"name": r["name"], "clinic": r["clinic"], "city": r["city"]})

# --- console summary ---
from collections import Counter
seg_counts = Counter(r["segment"] for r in rows)
cross = Counter((r["segment"], r["fees_flag"]) for r in rows)
print(f"TOTAL dentists: {len(rows)}")
print(f"Auth accounts total: {len(auth_by_email)} | matched to a dentist: "
      f"{sum(1 for d in dentists if (d.get('email') or '').strip().lower() in auth_by_email)}")
print(f"Dentists with treatment fees set: {len(fee_set & set(d['id'] for d in dentists))}")
print()
print("SEGMENT COUNTS:")
for s in ["ACTIVE", "DORMANT", "COLD"]:
    print(f"  {s:8} {seg_counts.get(s,0)}")
print()
print("SEGMENT x FEES:")
for s in ["ACTIVE", "DORMANT", "COLD"]:
    print(f"  {s:8} FEES_SET={cross.get((s,'FEES_SET'),0):3}  FEES_BLANK={cross.get((s,'FEES_BLANK'),0):3}")
print()
print(f"BLANK FEES total: {len(blank)}")
print("Wrote dentist-outreach-segments.csv and dentist-blank-fees.csv")
