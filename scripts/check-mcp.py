"""OAuth + MCP rehearsal. Local isolated schema only; never prints credentials."""
import base64, hashlib, json, os, pathlib, re, secrets, urllib.parse, urllib.request, urllib.error

BASE = os.environ.get('CRC_TEST_URL', 'http://localhost:5180')
if not BASE.startswith(('http://localhost:', 'http://127.0.0.1:')):
    raise SystemExit('Use the isolated local rehearsal server.')
KEYS = json.loads(pathlib.Path('work/keys.json').read_text(encoding='utf-8'))
REHEARSAL_EMAIL, REHEARSAL_PASSWORD = KEYS['REHEARSAL_EMAIL'], KEYS['REHEARSAL_PASSWORD']
checks = 0
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args): return None
opener = urllib.request.build_opener(NoRedirect)

def call(path, body=None, token=None, form=False, origin=None, cookie=None):
    headers = {'Accept': 'application/json, text/event-stream'}
    if token: headers['Authorization'] = 'Bearer ' + token
    if origin: headers['Origin'] = origin
    if cookie: headers['Cookie'] = cookie
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
code, page, headers = call('/oauth/authorize?'+urllib.parse.urlencode(params))
check(code == 200 and isinstance(page,str), 'consent page')
# Two headers only a real browser notices: under no-referrer the form would post `Origin: null`, and a
# form-action without the return destination would block the 303 that carries the code.
check(headers.get('Referrer-Policy') == 'same-origin', 'consent page lets the browser send its Origin')
return_origin = '{0.scheme}://{0.netloc}'.format(urllib.parse.urlsplit(redirect))
check(f"form-action 'self' {return_origin};" in headers.get('Content-Security-Policy',''), 'consent page allows the return to the verified destination')
check('bootstrap_key' not in page and 'type="password"' not in page, 'consent page asks for no shared key')
handle = re.search(r'name="request" value="([^"]+)"',page).group(1)

def set_cookie(headers, name):
    for value in headers.get_all('Set-Cookie') or []:
        if value.startswith(name+'='): return value.split(';',1)[0][len(name)+1:]
    return ''

# Signed out: the consent POST parks the request and sends the person to sign in first.
code, _, headers = call('/oauth/authorize', {'request':handle,'decision':'approve'}, form=True, origin=BASE)
check(code == 303 and headers['Location'] == '/access?next=%2Foauth%2Fauthorize', 'consent without a session asks for sign-in')
code, _, _ = call('/oauth/authorize', {'request':handle,'decision':'approve'}, form=True, origin='null')
check(code == 403, 'a form posted with Origin: null is refused')
parked = set_cookie(headers, 'crc_oauth_request')
check(parked == handle, 'pending authorization request is parked in a cookie')

# A real workspace member, by email and password; the credential itself is never printed.
code, _, headers = call('/api/access', {'action':'login','email':REHEARSAL_EMAIL,'password':REHEARSAL_PASSWORD}, origin=BASE)
check(code == 200, 'rehearsal member sign-in')
session = 'crc_access=' + set_cookie(headers, 'crc_access')
check(session != 'crc_access=', 'workspace session cookie issued')

# Coming back from /access: the parked request is resumed and the member is named.
code, resumed, _ = call('/oauth/authorize', cookie=f'crc_oauth_request={parked}; {session}')
check(code == 200 and isinstance(resumed,str) and 'Approving as' in resumed, 'resumed consent names the member')
handle = re.search(r'name="request" value="([^"]+)"',resumed).group(1)

code, _, headers = call('/oauth/authorize', {'request':handle,'decision':'approve'}, form=True, origin=BASE, cookie=session)
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
check({'get_workspace','list_templates','create_draft','review_draft','publish_draft'} <= names and not any('control' in name for name in names), 'MCP authoring tool boundary')
def tool(name, args):
    result = rpc('tools/call', {'name':name,'arguments':{**args,'workspace':WORKSPACE} if WORKSPACE else args})
    check(not result.get('error') and not result.get('result',{}).get('isError'), name+' success')
    return json.loads(result['result']['content'][0]['text'])
# Every change names the congregation; read it once from the connection itself.
WORKSPACE = None
WORKSPACE = tool('get_workspace', {})['workspaceId']
templates = tool('list_templates', {})['templates']
groups = []
# The first hit is not always bilingual; the draft needs a source that actually has Hebrew.
for candidate in tool('search_sources', {'query':'barchu'})['sources']:
    source = tool('get_source', {'sourceId':candidate['id']})['source']
    groups = [{'sourceId':source['id'],'blockIds':[b['id']]} for b in source['blocks'] if b['kind']=='bilingual']
    if groups: break
check(bool(groups), 'a bilingual source is available for the draft')
draft = tool('create_draft', {'name':'MCP isolated rehearsal','title':'MCP rehearsal','layout':'bottom','templateCueId':next(t['id'] for t in templates if t['layout']=='bottom'),'presentation':{},'content':{'mode':'bilingual','hebrewGroups':groups,'transliterationGroups':groups}})['draft']
preview = tool('preview_draft', {'draftId':draft['id'],'expectedVersion':draft['version']})
check(preview['previewPath'].startswith('/author?draft='), 'usable authenticated preview link')
rejected = rpc('tools/call', {'name':'publish_draft','arguments':{'draftId':draft['id'],'expectedVersion':draft['version'],'previewId':preview['previewId'],'workspace':WORKSPACE}})
check(bool(rejected.get('error') or rejected.get('result',{}).get('isError')), 'MCP cannot publish without browser review')
code, refreshed, _ = call('/oauth/token', {'grant_type':'refresh_token','refresh_token':tokens['refresh_token'],'client_id':client['client_id'],'resource':BASE+'/api/mcp'}, form=True)
check(code == 200 and refreshed['refresh_token'] != tokens['refresh_token'], 'refresh rotates token')
check(call('/oauth/revoke', {'token':refreshed['refresh_token'],'client_id':client['client_id']}, form=True)[0] == 200, 'refresh family revoked')
check(call('/api/mcp', {'jsonrpc':'2.0','id':99,'method':'tools/list'}, refreshed['access_token'])[0] == 401, 'revoked family cannot access MCP')
print(f'{checks} OAuth/MCP integration assertions passed; provider account testing remains separate.')
