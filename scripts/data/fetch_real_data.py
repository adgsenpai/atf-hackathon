#!/usr/bin/env python3
"""Fetch the real national datasets CivicWatch loads into PostGIS.

Sources (all public, no keys):
  * Boundaries  - Municipal Demarcation Board boundaries via OpenUp MapIt
                  (https://mapit.openup.org.za), generation 3 = 2021 electoral boundaries:
                  provinces, 44 district + 213 local/metro municipalities, 4 468 wards.
  * Contacts    - National Treasury Municipal Money API
                  (https://municipaldata.treasury.gov.za): switchboard, website, address.
  * Elections   - Electoral Commission of South Africa (IEC) "Seat Calculation Detail"
                  reports for every council, 2026 and 2021 Local Government Elections
                  (https://results.elections.org.za/home/Downloads/ME-Results/).

Usage:
  python3 -m venv .venv && .venv/bin/pip install xlrd==2.0.1
  .venv/bin/python scripts/data/fetch_real_data.py [--province WC] [--only boundaries,contacts,elections]

--province limits every dataset to one province (default WC = Western Cape, the current scope).

Writes api/data/real/*.json(.gz). Re-running overwrites with fresh data.
"""
import argparse, datetime as dt, gzip, html as H, http.cookiejar, json, os, re, sys, time
import urllib.parse, urllib.request

OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'api', 'data', 'real')
UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
MAPIT = 'https://mapit.openup.org.za'
TREASURY = 'https://municipaldata.treasury.gov.za/api/cubes/municipalities/members/municipality'
IEC_FORM = 'https://results.elections.org.za/home/Downloads/ME-Results/'
IEC_REPORT = 'https://results.elections.org.za/home/LGEPublicReports/{eid}/Seat%20Calculation%20Detail/{prov}/{code}.xls'
ELECTIONS = {'1887': (2026, '2026 Local Government Elections'), '1091': (2021, 'Local Government Elections 2021')}
PROVINCE = 'WC'
IEC_PROVINCE_NAMES = {'WC': 'Western Cape', 'EC': 'Eastern Cape', 'NC': 'Northern Cape', 'FS': 'Free State', 'KZN': 'KwaZulu-Natal',
                      'NW': 'North West', 'GT': 'Gauteng', 'MP': 'Mpumalanga', 'LIM': 'Limpopo'}
PROVINCE_DISTRICTS = {'WC': {'DC1', 'DC2', 'DC3', 'DC4', 'DC5'}}
PROVINCE_METROS = {'WC': {'CPT'}}
NOW = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')


def get(url, timeout=180, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            if i == tries - 1:
                raise
            print(f'  retry {url}: {e}', file=sys.stderr)
            time.sleep(2 * (i + 1))


def write(name, obj, gz=False):
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name + ('.gz' if gz else ''))
    data = json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode()
    if gz:
        with gzip.GzipFile(path, 'wb', mtime=0) as f:
            f.write(data)
    else:
        with open(path, 'wb') as f:
            f.write(data)
    print(f'wrote {os.path.relpath(path)} ({len(data) / 1e6:.1f} MB raw)')


def rnd(geom, nd=5):
    def r(c):
        return [r(x) for x in c] if isinstance(c[0], list) else [round(c[0], nd), round(c[1], nd)]
    return {'type': geom['type'], 'coordinates': r(geom['coordinates'])}


# ---------------------------------------------------------------- boundaries
def boundaries():
    meta, keep = {}, set()  # noqa: F841
    for t, gen, tol in [('PR', 2, 0.005), ('DC', 3, 0.002), ('MN', 3, 0.001), ('WD', 3, 0.0002)]:
        areas = json.loads(get(f'{MAPIT}/areas/{t}?generation={gen}'))
        areas = {k: v for k, v in areas.items() if k.isdigit()}
        if PROVINCE:  # generation-3 areas carry no parent links, so filter on MDB codes
            code = lambda v: v['codes'].get('MDB', '')  # noqa: E731
            if t == 'PR':
                areas = {k: v for k, v in areas.items() if code(v) == PROVINCE}
            elif t == 'DC':
                areas = {k: v for k, v in areas.items() if code(v) in PROVINCE_DISTRICTS[PROVINCE]}
            elif t == 'MN':
                areas = {k: v for k, v in areas.items() if code(v).startswith(PROVINCE) or code(v) in PROVINCE_METROS[PROVINCE]}
                keep = {code(v) for v in areas.values()}
            else:  # ward names are '<municipality code>_<ward number>'
                areas = {k: v for k, v in areas.items() if v['name'].rsplit('_', 1)[0] in keep}
        print(f'{t}: {len(areas)} areas, fetching geometry (tolerance {tol})')
        feats = []
        for n, (aid, a) in enumerate(sorted(areas.items())):
            g = json.loads(get(f'{MAPIT}/area/{aid}.geojson?generation={gen}&simplify_tolerance={tol}'))
            if g.get('type') == 'Feature':
                g = g['geometry']
            feats.append({'mapit_id': int(aid), 'code': a['codes'].get('MDB'), 'name': a['name'],
                          'municipality_code': a['name'].rsplit('_', 1)[0] if t == 'WD' else None,
                          'ward_no': int(a['name'].rsplit('_', 1)[1]) if t == 'WD' else None,
                          'parent_mapit_id': a.get('parent_area'), 'geometry': rnd(g)})
            if n % 250 == 0:
                print(f'  {n}/{len(areas)}')
            time.sleep(0.05)
        meta[t] = len(feats)
        write(f'boundaries_{t.lower()}.json', feats, gz=t == 'WD')
    write('boundaries_meta.json', {'source': 'Municipal Demarcation Board boundaries via OpenUp MapIt',
                                   'url': MAPIT, 'generation': '2021 electoral boundaries',
                                   'province': PROVINCE, 'fetched_at': NOW, 'counts': meta})


# ---------------------------------------------------------------- contacts
def contacts():
    rows, page = [], 1
    while True:
        d = json.loads(get(f'{TREASURY}?pagesize=500&page={page}'))
        rows += d['data']
        if len(rows) >= d['total_member_count'] or not d['data']:
            break
        page += 1
    out = {}
    for r in rows:
        if PROVINCE and r.get('municipality.province_code') != PROVINCE:
            continue
        g = lambda k: (r.get(f'municipality.{k}') or '').strip() or None  # noqa: E731
        code = g('demarcation_code')
        url = g('url')
        if url and not re.match(r'^https?://', url, re.I):
            url = 'http://' + url
        out[code] = {
            'code': code, 'name': g('name'), 'long_name': g('long_name'), 'category': g('category'),
            'province_code': g('province_code'), 'province': g('province_name'), 'parent_code': g('parent_code'),
            'phone': g('phone_number'), 'url': url.lower() if url else None,
            'street_address': ', '.join(x for x in [g('street_address_1'), g('street_address_2'), g('street_address_3'), g('street_address_4')] if x) or None,
            'postal_address': ', '.join(x for x in [g('postal_address_1'), g('postal_address_2'), g('postal_address_3')] if x) or None,
        }
    write('contacts.json', {'source': 'National Treasury Municipal Money API (municipalities cube)',
                            'url': 'https://municipaldata.treasury.gov.za', 'fetched_at': NOW, 'items': out})


# ---------------------------------------------------------------- elections
class Form:
    def __init__(self):
        cj = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
        self.op.addheaders = [('User-Agent', UA)]
        self.html = self.op.open(IEC_FORM, timeout=120).read().decode('utf8', 'ignore')
        self.vals = {}

    def hidden(self):
        return {n: H.unescape(v) for n, v in re.findall(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', self.html)}

    def options(self, name):
        body = re.search(rf'<select name="{re.escape(name)}"[^>]*>(.*?)</select>', self.html, re.S)
        return [(v, H.unescape(t).strip()) for v, t in re.findall(r'<option(?: selected="selected")? value="([^"]*)">([^<]*)', body.group(1) if body else '')]

    def post(self, target, extra):
        d = self.hidden(); self.vals.update(extra); d.update(self.vals)
        d['__EVENTTARGET'] = target; d['__EVENTARGUMENT'] = ''
        req = urllib.request.Request(IEC_FORM, urllib.parse.urlencode(d).encode(), headers={'Referer': IEC_FORM})
        self.html = self.op.open(req, timeout=180).read().decode('utf8', 'ignore')


P = 'ctl00$MainContent$'


def iec_index(eid):
    f = Form()
    f.post(P + 'ddlElections', {P + 'ddlElections': eid})
    f.post(P + 'radReports$2', {P + 'radReports': '13'})  # Seat Calculation Detail
    out = []
    for pv, pname in f.options(P + 'ddlSealCalculationProvinces'):
        if pv == '0' or (PROVINCE and pname != IEC_PROVINCE_NAMES[PROVINCE]):
            continue
        f.post(P + 'ddlSealCalculationProvinces', {P + 'ddlSealCalculationProvinces': pv})
        munis = [(v, t) for v, t in f.options(P + 'ddlSeatCalculationMunicipalities') if v not in ('0', '-2')]
        f.post(P + 'ddlSeatCalculationMunicipalities', {P + 'ddlSeatCalculationMunicipalities': munis[0][0]})
        prov = re.search(r'Seat Calculation Detail/([^/]+)/', f.html).group(1)
        for v, t in munis:
            code, name = t.split(' - ', 1)
            out.append({'code': code.strip(), 'name': name.strip(), 'province': pname, 'prov_url': prov, 'iec_id': v})
        time.sleep(0.3)
    return out


def num(x):
    try:
        return float(str(x).replace(',', '').strip())
    except ValueError:
        return None


def parse_seats(path):
    import xlrd  # noqa: PLC0415
    sh = xlrd.open_workbook(path, logfile=open(os.devnull, 'w')).sheet_by_index(0)
    info, parties, in_table = {}, [], False
    for r in range(sh.nrows):
        row = [str(c).strip() for c in sh.row_values(r)]
        cells = [c for c in row if c]
        if not cells:
            continue
        label = cells[0]
        if in_table:
            if label.lower().startswith('total'):
                in_table = False
            elif len(cells) >= 3 and num(cells[1]) is not None and num(cells[-1]) is not None:
                parties.append({'party': re.sub(r'\s+', ' ', label), 'votes': int(num(cells[1])), 'seats': int(num(cells[-1]))})
            continue
        if label.startswith('Printed on'):
            info['printed_on'] = label.split(':', 1)[1].strip()
        elif label.startswith('Quota'):
            info['quota'] = int(num(cells[1]))
        elif label.startswith('Total Valid Votes'):
            info['total_valid_votes'] = int(num(cells[1]))
        elif label.startswith('Total Seats Available'):
            info['seats_total'] = int(num(cells[1]))
        elif label.startswith('40% of the Total Seats'):
            info['seats_total'] = int(num(cells[1]))
            info['district_40pct'] = True  # only the directly elected 40%; 60% are seconded by local councils
        elif label.startswith('Independent Ward Councillors'):
            info['independent_ward_councillors'] = int(num(cells[1]))
        elif label.startswith('Ward Councillors Seats from Parties with no PR'):
            info['ward_seats_no_pr_list'] = int(num(cells[1]))
        elif label == 'Party Name':
            in_table = True
    return info, parties


def elections():
    cache = os.path.join(OUT, '..', 'cache', 'iec')
    os.makedirs(cache, exist_ok=True)
    result = {'source': 'Electoral Commission of South Africa (IEC) — Seat Calculation Detail reports',
              'url': IEC_FORM, 'fetched_at': NOW, 'elections': {}}
    for eid, (year, title) in ELECTIONS.items():
        idx = iec_index(eid)
        print(f'{year}: {len(idx)} councils')
        councils = {}
        for n, m in enumerate(idx):
            path = os.path.join(cache, f'{eid}_{m["code"]}.xls')
            if not os.path.exists(path):
                with open(path, 'wb') as f:
                    f.write(get(IEC_REPORT.format(eid=eid, prov=m['prov_url'], code=urllib.parse.quote(m['code']))))
                time.sleep(0.25)
            info, parties = parse_seats(path)
            parties.sort(key=lambda p: (-p['seats'], -p['votes'], p['party']))
            councils[m['code']] = {**m, **info, 'report_url': IEC_REPORT.format(eid=eid, prov=m['prov_url'], code=m['code']).replace('%20', ' '),
                                   'parties': [p for p in parties if p['votes'] > 0 or p['seats'] > 0]}
            if n % 50 == 0:
                print(f'  {n}/{len(idx)} {m["code"]}: {len(parties)} parties, {info.get("seats_total")} seats')
        result['elections'][str(year)] = {'title': title, 'iec_event_id': eid, 'councils': councils}
    write('elections.json', result, gz=True)


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='boundaries,contacts,elections')
    ap.add_argument('--province', default='WC', help="MDB province code, or '' for all of South Africa")
    a = ap.parse_args()
    PROVINCE = a.province
    for step in a.only.split(','):
        globals()[step.strip()]()
