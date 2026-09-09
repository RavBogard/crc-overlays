"""Integration rehearsal against a local server using an isolated test schema."""
import json, os, pathlib, urllib.request, urllib.error, uuid, time

BASE = os.environ.get('CRC_TEST_URL', 'http://localhost:5180')
if not BASE.startswith(('http://localhost:', 'http://127.0.0.1:')):
    raise SystemExit('Run this mutation rehearsal only against the isolated local test server.')
KEYS = json.loads(pathlib.Path('work/keys.json').read_text(encoding='utf-8'))
checks = 0

def request(path, body=None, key='CONTROL_KEY'):
    headers = {'Content-Type': 'application/json'}
    if key:
        headers['Authorization'] = 'Bearer ' + KEYS[key]
    req = urllib.request.Request(BASE + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as result:
            return result.status, json.load(result)
    except urllib.error.HTTPError as error:
        return error.code, json.load(error)

def check(value, label):
    global checks
    if not value:
        raise AssertionError(label)
    checks += 1

def op(name, data, status=200):
    code, result = request('/api/authoring', {'operation': name, 'input': data})
    check(code == status, f'{name}: expected {status}, got {code}; {result.get("error", "")}')
    return result

def publish(draft):
    args = {'draftId': draft['id'], 'expectedVersion': draft['version']}
    preview = op('preview_draft', args)
    args['previewId'] = preview['previewId']
    op('publish_draft', args, 409)
    measurement = {'viewportWidth': 1920, 'viewportHeight': 1080, 'fontsReady': True,
                   'overflow': True, 'rendererVersion': 'simulated-integration-test', 'measuredAt': int(time.time()*1000)}
    op('review_draft', dict(args, browserMeasurement=measurement, humanApproved=True), 409)
    measurement['overflow'] = False
    op('review_draft', dict(args, browserMeasurement=measurement, humanApproved=True))
    return op('publish_draft', args)

check(request('/api/authoring', {'operation': 'list_drafts', 'input': {}}, None)[0] == 401, 'anonymous authoring denied')
check(request('/api/authoring', {'operation': 'list_drafts', 'input': {}}, 'OUTPUT_KEY')[0] == 401, 'output key authoring denied')
source = op('search_sources', {'query': 'barchu'})['sources'][0]
source = op('get_source', {'sourceId': source['id']})['source']
groups = [{'sourceId': source['id'], 'blockIds': [block['id']]} for block in source['blocks'] if block['kind'] == 'bilingual']
catalog = request('/api/catalog')[1]
template = next(c for c in catalog if c['layout'] == 'bottom')
draft = op('create_draft', {'name': 'Integration rehearsal ' + uuid.uuid4().hex[:8], 'title': 'Revision one',
    'layout': 'bottom', 'templateCueId': template['id'], 'presentation': {},
    'content': {'mode': 'bilingual', 'hebrewGroups': groups, 'transliterationGroups': groups}})['draft']
first = publish(draft)
cid = draft['id']
request('/api/command', {'action': 'in', 'cue': cid})
selected = request('/api/state')[1]
check(selected['cuePayload']['texts']['textTitle'] == 'Revision one', 'selected payload pinned')
draft = op('update_draft', {'draftId': cid, 'expectedVersion': draft['version'], 'patch': {'title': 'Revision two'}})['draft']
op('update_draft', {'draftId': cid, 'expectedVersion': draft['version']-1, 'patch': {'title': 'Stale overwrite'}}, 409)
publish(draft)
held = request('/api/state')[1]
check(held['revision'] == selected['revision'] and held['cuePayload'] == selected['cuePayload'], 'publishing leaves live state unchanged')
new_catalog = request('/api/catalog')[1]
check(next(c for c in new_catalog if c['id'] == cid)['texts']['textTitle'] == 'Revision two', 'publication updates stable catalog ID')
request('/api/command', {'action': 'in', 'cue': cid})
check(request('/api/state')[1]['cuePayload']['texts']['textTitle'] == 'Revision two', 'next command selects new publication')
op('rollback_draft', {'draftId': cid, 'expectedVersion': draft['version'], 'revision': first['revision']['revision']})
check(request('/api/state')[1]['cuePayload']['texts']['textTitle'] == 'Revision two', 'rollback also preserves selected graphic')
request('/api/command', {'action': 'in', 'cue': cid})
check(request('/api/state')[1]['cuePayload']['texts']['textTitle'] == 'Revision one', 'next command selects restored publication')
check(len(op('list_revisions', {'draftId': cid})['revisions']) >= 2, 'publication history retained')
request('/api/command', {'action': 'cut'})
print(f'{checks} authoring integration assertions passed (simulated fit receipt; browser QA remains separate).')
