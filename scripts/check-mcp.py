"""OAuth + MCP rehearsal. Local isolated schema only; never prints credentials."""
import base64, hashlib, json, os, pathlib, re, secrets, urllib.parse, urllib.request, urllib.error

BASE = os.environ.get('CRC_TEST_URL', 'http://localhost:5180')
if not BASE.startswith(('http://localhost:', 'http://127.0.0.1:')):
    raise SystemExit('Use the isolated local rehearsal server.')
KEY = json.loads(pathlib.Path('work/keys.json').read_text(encoding='utf-8'))['CONTROL_KEY']
checks = 0
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args): return None
opener = urllib.request.build_opener(NoRedirect)

def call(path, body=None, token=None, form=False, origin=None):
    headers = {'Accept': 'application/json, text/event-stream'}
    if token: headers['Authorization'] = 'Bearer ' + token
    if origin: headers['Origin'] = origin
    if body is not None:
        headers['Content-Type'] = 'application/x-www-form-urlencoded' if form else 'application/json'
        body = (urllib.parse.urlencode(body) if form else json.dumps(body)).encode()
    request = urllib.request.Request(BASE+path, data=body, headers=headers)
    try: response = opener.open(request, timeout=20)
    except urllib.error.HTTPError as error: response = error
    raw = response.read().decode()
    try: data = json.loads(raw)
    except ValueError:
        events = [line[6:] for line in raw.splitlines() if line.startswith('data: ')]
        data = json.loads(events[-1]) if events else raw
    return response.code, data, response.headers

def check(ok, label):
    global checks
    if not ok: raise AssertionError(label)
    checks += 1

code, metadata, _ = call('/.well-known/oauth-protected-resource')
check(code == 200 and metadata['resource'] == BASE+'/api/mcp', 'resource metadata')
check(call('/api/mcp', {'jsonrpc':'2.0','id':1,'method':'tools/list'})[0] == 401, 'anonymous MCP denied')
redirect = 'http://127.0.0.1:49152/callback'
code, client, _ = call('/oauth/register', {'client_name':'CRC isolated rehearsal','redirect_uris':[redirect], 'token_endpoint_auth_method':'none', 'grant_types':['authorization_code','refresh_token'],'response_types':['code']})
check(code == 201, 'public client registration')
verifier = secrets.token_urlsafe(48)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
params = {'client_id':client['client_id'],'redirect_uri':redirect,'response_type':'code','scope':'crc.authoring','resource':BASE+'/api/mcp','state':'isolated-rehearsal','code_challenge_method':'S256','code_challenge':challenge}
code, page, _ = call('/oauth/authorize?'+urllib.parse.urlencode(params))
check(code == 200 and isinstance(page,str), 'consent page')
handle = re.search(r'name="request" value="([^"]+)"',page).group(1)
code, _, headers = call('/oauth/authorize?'+urllib.parse.urlencode(params), {'request':handle,'bootstrap_key':KEY,'decision':'approve'}, form=True, origin=BASE)
check(code == 303, 'authorized consent redirect')
callback = urllib.parse.parse_qs(urllib.parse.urlparse(headers['Location']).query)
check(callback['state'] == ['isolated-rehearsal'], 'OAuth state preserved')
exchange = {'grant_type':'authorization_code','code':callback['code'][0],'client_id':client['client_id'],'redirect_uri':redirect,'resource':BASE+'/api/mcp','code_verifier':verifier}
code, tokens, _ = call('/oauth/token', exchange, form=True)
check(code == 200, 'PKCE token exchange')
check(call('/oauth/token', exchange, form=True)[0] == 400, 'authorization code is one use')
token = tokens['access_token']
counter = 1
def rpc(method, params):
    global counter
    counter += 1
    code, result, _ = call('/api/mcp', {'jsonrpc':'2.0','id':counter,'method':method,'params':params}, token)
    check(code == 200, 'MCP '+method)
    return result
rpc('initialize', {'protocolVersion':'2025-06-18','capabilities':{},'clientInfo':{'name':'CRC isolated rehearsal','version':'1'}})
listing = rpc('tools/list', {})
names = {tool['name'] for tool in listing['result']['tools']}
check({'list_templates','create_draft','publish_draft'} <= names and 'review_draft' not in names, 'MCP authoring tool boundary')
def tool(name, args):
    result = rpc('tools/call', {'name':name,'arguments':args})
    check(not result.get('error') and not result.get('result',{}).get('isError'), name+' success')
    return json.loads(result['result']['content'][0]['text'])
templates = tool('list_templates', {})['templates']
source = tool('search_sources', {'query':'barchu'})['sources'][0]
source = tool('get_source', {'sourceId':source['id']})['source']
groups = [{'sourceId':source['id'],'blockIds':[b['id']]} for b in source['blocks'] if b['kind']=='bilingual']
draft = tool('create_draft', {'name':'MCP isolated rehearsal','title':'MCP rehearsal','layout':'bottom','templateCueId':next(t['id'] for t in templates if t['layout']=='bottom'),'presentation':{},'content':{'mode':'bilingual','hebrewGroups':groups,'transliterationGroups':groups}})['draft']
preview = tool('preview_draft', {'draftId':draft['id'],'expectedVersion':draft['version']})
check(preview['previewPath'].startswith('/author?draft='), 'usable authenticated preview link')
rejected = rpc('tools/call', {'name':'publish_draft','arguments':{'draftId':draft['id'],'expectedVersion':draft['version'],'previewId':preview['previewId']}})
check(bool(rejected.get('error') or rejected.get('result',{}).get('isError')), 'MCP cannot publish without browser review')
code, refreshed, _ = call('/oauth/token', {'grant_type':'refresh_token','refresh_token':tokens['refresh_token'],'client_id':client['client_id'],'resource':BASE+'/api/mcp'}, form=True)
check(code == 200 and refreshed['refresh_token'] != tokens['refresh_token'], 'refresh rotates token')
check(call('/oauth/revoke', {'token':refreshed['refresh_token'],'client_id':client['client_id']}, form=True)[0] == 200, 'refresh family revoked')
check(call('/api/mcp', {'jsonrpc':'2.0','id':99,'method':'tools/list'}, refreshed['access_token'])[0] == 401, 'revoked family cannot access MCP')
print(f'{checks} OAuth/MCP integration assertions passed; provider account testing remains separate.')
