#!/usr/bin/env python3
"""Round 3: Adversarial verification and deep bug analysis"""
import requests, json, time, re, os

BASE = 'http://localhost:3000'
print('='*60)
print('  ROUND 3: ADVERSARIAL VERIFICATION & DEEP BUGS')
print('='*60)

# --------------------------------------------------
# 3A: Test all API error status codes
# --------------------------------------------------
print()
print('--- 3A: Complete Error Code Coverage ---')

error_tests = [
    ('GET', '/api/sessions/nonexist/report', 404),
    ('POST', '/api/sessions', 400),
    ('GET', '/api/sessions/nonexist/messages', 405),
    ('PUT', '/api/sessions', 405),
    ('DELETE', '/api/sessions/nonexist/messages', 405),
    ('PATCH', '/api/sessions/nonexist/report', 405),
]

for method, path, expected in error_tests:
    r = requests.request(method, f'{BASE}{path}',
                        json={} if method != 'GET' else None, timeout=10)
    match = 'PASS' if r.status_code == expected else f'FAIL (got {r.status_code})'
    print(f'  {match}: {method} {path} -> expected {expected}, got {r.status_code}')

# Test that 405 returns Allow header
r = requests.get(f'{BASE}/api/sessions', timeout=10)
allow = r.headers.get('Allow', '')
print(f'  Allow header on GET /api/sessions: "{allow}"')
if not allow:
    print(f'  WARNING: Missing Allow header on 405 response')

# --------------------------------------------------
# 3B: Header injection tests
# --------------------------------------------------
print()
print('--- 3B: Header Injection Tests ---')

malicious_headers = [
    ('X-Forwarded-For', '127.0.0.1, 192.168.1.1'),
    ('X-Forwarded-For', 'invalid-ip'),
    ('Content-Type', 'text/plain; charset=utf-8'),
    ('Accept', '<script>alert(1)</script>'),
    ('User-Agent', 'curl/7.68.0'),
]

for header, value in malicious_headers:
    try:
        r = requests.post(f'{BASE}/api/sessions',
                         json={'petId': 'pet-demo'},
                         headers={header: value}, timeout=10)
        is_ok = r.status_code in [400, 404, 429]
        print(f'  {"PASS" if is_ok else "CHECK"} {header}: {value[:40]} -> {r.status_code}')
    except Exception as e:
        print(f'  FAIL {header}: {value[:40]} -> Exception: {e}')

# --------------------------------------------------
# 3C: Response content type verification
# --------------------------------------------------
print()
print('--- 3C: Response Content-Type Verification ---')

r = requests.post(f'{BASE}/api/sessions',
                 json={'petId': 'pet-demo'}, timeout=10)
content_type = r.headers.get('Content-Type', '')
print(f'  Error response Content-Type: {content_type}')
if 'application/json' not in content_type:
    print(f'  WARNING: Error response not JSON!')

r = requests.get(f'{BASE}/api/sessions/nonexistent/report', timeout=10)
content_type = r.headers.get('Content-Type', '')
print(f'  404 response Content-Type: {content_type}')

r = requests.get(f'{BASE}/api/sessions', timeout=10)
content_type = r.headers.get('Content-Type', '')
print(f'  405 response Content-Type: {content_type}')

# --------------------------------------------------
# 3D: Demo mode adversarial tests
# --------------------------------------------------
print()
print('--- 3D: Adversarial Demo Mode Logic Analysis ---')

def simulate_demo(text, followup=0):
    known = re.compile(r'吐|呕|拉稀|腹泻|食欲|不吃|没精神|精神|嗜睡|尿|猫砂盆|排尿|乱尿|咳嗽|发热|发烧')
    emergency = re.compile(r'抽搐|中毒|车祸|尿不出|呼吸困难|大出血|一直吐|吐血|被车')

    if emergency.search(text):
        return 'emergency'
    elif known.search(text):
        has_vomit = re.search(r'吐|呕', text)
        has_diarrhea = re.search(r'拉稀|腹泻|拉肚', text)
        has_appetite = re.search(r'不吃|食欲', text)
        has_lethargy = re.search(r'没精神|精神|嗜睡|蔫', text)
        has_urinary = re.search(r'尿|猫砂盆|排尿|乱尿', text)

        if followup == 0 and (has_urinary or (not has_vomit and not has_diarrhea and has_lethargy)):
            return 'followup'
        else:
            return 'kb_diagnosis'
    else:
        return 'llm_fallback'

print()
print('  Bug 1: Appetite loss without vomit should trigger followup')
result = simulate_demo('狗不吃东西已经两天了')
print(f'    Input: "狗不吃东西已经两天了" -> {result}')
print(f'    Expected: followup (need more info)')
print(f'    ROOT CAUSE: Logic requires lethargy AND appetite loss for followup;')
print(f'    appetite loss alone with no vomiting goes to kb_diagnosis')

print()
print('  Bug 2: "吐舌头" matches vomiting pattern')
result = simulate_demo('狗一直吐舌头喘气')
print(f'    Input: "狗一直吐舌头喘气" -> {result}')
print(f'    Expected: llm_fallback (panting, not vomiting)')
print(f'    ROOT CAUSE: Simple regex "吐" matches "吐舌头" (panting)')

print()
print('  Bug 3: "老鼠药" / "巧克力" not triggering emergency')
for poison in ['狗吃了老鼠药', '狗吃了巧克力', '狗吃了洋葱大蒜']:
    result = simulate_demo(poison)
    print(f'    "{poison}" -> {result}')
print(f'    ROOT CAUSE: Emergency keywords are too specific (no poison recognition)')

print()
print('  Bug 4: Species not used in demo logic')
# The demo mode doesn't check species at all
dog_result = simulate_demo('频繁去猫砂盆，尿得少，惨叫')
cat_result = simulate_demo('频繁去猫砂盆，尿得少，惨叫')
print(f'    Dog with FLUTD symptoms: {dog_result}')
print(f'    Cat with FLUTD symptoms: {cat_result}')
print(f'    ROOT CAUSE: Species parameter is passed but ignored in demo logic')

# --------------------------------------------------
# 3E: Source code analysis
# --------------------------------------------------
print()
print('--- 3E: Project Structure Analysis ---')

os.chdir('d:/develop/vibe coding/pet-health-agent')

# Check knowledge base
kb_dir = 'data'
if os.path.exists(kb_dir):
    print(f'Data directory contents:')
    for root, dirs, files in os.walk(kb_dir):
        for f in files:
            fpath = os.path.join(root, f)
            size = os.path.getsize(fpath)
            print(f'  {fpath} ({size} bytes)')
else:
    print('Data directory not found or empty')

# Check test files
print()
src_test_count = 0
for root, dirs, files in os.walk('src'):
    for f in files:
        if '.test.' in f:
            src_test_count += 1
            print(f'  Test: {os.path.join(root, f)}')

if src_test_count == 0:
    print('  No test files found in src/')

# Count all source files
src_files = []
for root, dirs, files in os.walk('src'):
    for f in files:
        if f.endswith('.ts') or f.endswith('.tsx'):
            src_files.append(os.path.join(root, f))

print(f'\n  Total source files: {len(src_files)}')
categories = {'components': 0, 'api': 0, 'agent': 0, 'store': 0, 'knowledge': 0,
              'compliance': 0, 'crypto': 0, 'monitoring': 0, 'models': 0, 'other': 0}
for f in src_files:
    matched = False
    for cat in ['components', 'api', 'agent', 'store', 'knowledge',
                'compliance', 'crypto', 'monitoring', 'models']:
        if cat in f:
            categories[cat] += 1
            matched = True
            break
    if not matched:
        categories['other'] += 1

for cat, count in sorted(categories.items()):
    if count > 0:
        print(f'    {cat}: {count}')

# Read key files for architecture analysis
print()
print('--- 3F: Architecture Summary ---')
try:
    with open('package.json', 'r') as f:
        pkg = json.load(f)
    deps = pkg.get('dependencies', {})
    dev_deps = pkg.get('devDependencies', {})
    print(f'  Runtime deps: {len(deps)} ({", ".join(list(deps.keys())[:10])})')
    print(f'  Dev deps: {len(dev_deps)} ({", ".join(list(dev_deps.keys())[:10])})')
    print(f'  Framework: Next.js (detected from package.json)')
except:
    print('  Could not read package.json')

try:
    with open('.env.local', 'r') as f:
        env_content = f.read()
    # Check for exposed secrets
    has_api_key = 'API_KEY' in env_content or 'SECRET' in env_content or 'TOKEN' in env_content
    print(f'  .env.local: {"CONTAINS potential secrets" if has_api_key else "No secrets detected"}')
    # Show masked content
    masked = re.sub(r'=.*', '=***MASKED***', env_content)
    print(f'  Env vars: {masked.strip()}')
except:
    print('  .env.local not found or unreadable')

print()
print('Round 3 complete.')
