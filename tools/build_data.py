#!/usr/bin/env python3
"""
Build the public data files for the NZ Pipe Band Championships app
from the entries workbook.

    python3 tools/build_data.py path/to/entries.xlsx

Reads these sheets (the first three come straight from the entries export):
  Entries    - Band, Grade, Centre, ...           (contact/payment columns are NEVER published)
  Events     - Band, Grade, Event, Event Type, Event Grade
  Tunes      - Band, Event, March, Strathspey, Reel, March Set 2, ..., Medley
Optional sheets you add once the draw is made (see data_template.xlsx):
  Personnel  - Band, Pipe Major, Drum Sergeant, Drum Major, Short Name
  Draws      - Event, Order, Band, Circle, Time        (Time as HH:MM, day in Events Info)
  EventInfo  - Event, Day, Circle, Start, Piping Judge 1, Piping Judge 2, Drumming Judge, Ensemble Judge

Writes data/bands.json and data/draws.json. Re-run any time and redeploy.
"""
import json, re, sys, datetime
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data"

GRADE_ORDER = ["Grade 1", "Grade 2", "Grade 3", "Grade 4A", "Grade 4B", "Juvenile", "Open"]
TYPE_ORDER = ["MSR", "Medley", "March Set", "Street March", "Drum Majors Championship", "Mace Flourishing"]


def clean(v):
    if v is None or (isinstance(v, float) and pd.isna(v)):
        return ""
    return str(v).strip()


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


def event_name(ev, ev_grade):
    """'March Set' with grade Juvenile -> 'Juvenile March Set'."""
    ev = clean(ev)
    g = clean(ev_grade)
    if g and g not in ("Open",) and not ev.lower().startswith(g.lower()):
        return f"{g} {ev}"
    return ev


def split_tunes(text):
    text = clean(text)
    if not text:
        return []
    parts = re.split(r"\n|\r|,(?![^()]*\))", text)
    return [p.strip() for p in parts if p.strip()]


def sheet(xl, name):
    for s in xl.sheet_names:
        if s.strip().lower() == name.lower():
            return pd.read_excel(xl, sheet_name=s)
    return None


def main(path):
    xl = pd.ExcelFile(path)
    entries = sheet(xl, "Entries")
    events = sheet(xl, "Events")
    tunes = sheet(xl, "Tunes")
    personnel = sheet(xl, "Personnel")
    draws = sheet(xl, "Draws")
    info = sheet(xl, "EventInfo")

    # ---- bands (public fields only) ----
    bands = {}
    for _, r in entries.iterrows():
        name = clean(r["Band"])
        if not name:
            continue
        bands[name] = {
            "id": slug(name), "name": name, "short": name,
            "grade": clean(r.get("Grade")), "centre": clean(r.get("Centre")),
            "pipeMajor": "", "drumSergeant": "", "drumMajor": "",
            "events": [],
        }
    if personnel is not None:
        for _, r in personnel.iterrows():
            b = bands.get(clean(r.get("Band")))
            if not b:
                continue
            b["pipeMajor"] = clean(r.get("Pipe Major"))
            b["drumSergeant"] = clean(r.get("Drum Sergeant"))
            b["drumMajor"] = clean(r.get("Drum Major"))
            if clean(r.get("Short Name")):
                b["short"] = clean(r.get("Short Name"))

    # ---- tunes lookup: (band, event) -> list of sets ----
    tune_map = {}
    for _, r in tunes.iterrows():
        sets = []
        if clean(r.get("March")):
            sets.append({"label": "Set 1", "tunes": [x for x in (clean(r.get("March")), clean(r.get("Strathspey")), clean(r.get("Reel"))) if x]})
        if clean(r.get("March Set 2")):
            sets.append({"label": "Set 2", "tunes": [x for x in (clean(r.get("March Set 2")), clean(r.get("Strathspey Set 2")), clean(r.get("Reel Set 2"))) if x]})
        if clean(r.get("Medley")):
            sets.append({"label": "", "tunes": split_tunes(r.get("Medley"))})
        tune_map[(clean(r["Band"]), clean(r["Event"]))] = sets

    # ---- competitions ----
    comps = {}
    for _, r in events.iterrows():
        raw = clean(r["Event"]); band = clean(r["Band"]); g = clean(r.get("Event Grade"))
        name = event_name(raw, g)
        c = comps.setdefault(name, {
            "id": slug(name), "name": name, "grade": g or "Open",
            "type": clean(r.get("Event Type")) or "Band Event",
            "day": "", "circle": "", "start": "",
            "judges": {"piping": [], "drumming": "", "ensemble": ""},
            "draw": [], "provisional": True,
        })
        sets = tune_map.get((band, raw), [])
        c["draw"].append({"band": band, "order": None, "circle": "", "time": "", "sets": sets})
        if band in bands:
            bands[band]["events"].append(c["id"])

    # ---- event info / judges ----
    if info is not None:
        for _, r in info.iterrows():
            c = next((c for c in comps.values() if c["name"].lower() == clean(r.get("Event")).lower()), None)
            if not c:
                print("EventInfo: unknown event", r.get("Event")); continue
            c["day"] = clean(r.get("Day")); c["circle"] = clean(r.get("Circle")); c["start"] = clean(r.get("Start"))
            c["judges"] = {
                "piping": [x for x in (clean(r.get("Piping Judge 1")), clean(r.get("Piping Judge 2"))) if x],
                "drumming": clean(r.get("Drumming Judge")), "ensemble": clean(r.get("Ensemble Judge")),
            }

    # ---- official draw order ----
    if draws is not None and len(draws):
        for _, r in draws.iterrows():
            c = next((c for c in comps.values() if c["name"].lower() == clean(r.get("Event")).lower()), None)
            if not c:
                print("Draws: unknown event", r.get("Event")); continue
            slot = next((d for d in c["draw"] if d["band"] == clean(r.get("Band"))), None)
            if not slot:
                print("Draws: band not entered in", c["name"], "-", r.get("Band")); continue
            o = r.get("Order")
            slot["order"] = int(o) if not pd.isna(o) else None
            slot["circle"] = clean(r.get("Circle")) or c["circle"]
            t = r.get("Time")
            slot["time"] = t.strftime("%H:%M") if isinstance(t, (datetime.time, datetime.datetime)) else clean(t)[:5]
            c["provisional"] = False
    for c in comps.values():
        if c["provisional"]:
            c["draw"].sort(key=lambda d: d["band"].lower())
            for i, d in enumerate(c["draw"], 1):
                d["order"] = i
        else:
            c["draw"].sort(key=lambda d: (d["order"] is None, d["order"] or 0))

    def ckey(c):
        g = GRADE_ORDER.index(c["grade"]) if c["grade"] in GRADE_ORDER else 99
        t = next((i for i, k in enumerate(TYPE_ORDER) if k.lower() in c["name"].lower()), 99)
        return (g, t)

    OUT.mkdir(exist_ok=True)
    now = datetime.datetime.now().isoformat(timespec="minutes")
    (OUT / "bands.json").write_text(json.dumps({"updated": now, "bands": sorted(bands.values(), key=lambda b: b["name"].lower())}, indent=1, ensure_ascii=False))
    (OUT / "draws.json").write_text(json.dumps({"updated": now, "competitions": sorted(comps.values(), key=ckey)}, indent=1, ensure_ascii=False))
    print(f"{len(bands)} bands, {len(comps)} competitions, {sum(len(c['draw']) for c in comps.values())} draw slots")
    for c in sorted(comps.values(), key=ckey):
        print(f"  {c['name']:<32} {len(c['draw']):>3}  {'provisional' if c['provisional'] else 'official'}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    main(sys.argv[1])
