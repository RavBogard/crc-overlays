import json, pathlib, urllib.request, urllib.error, uuid
BASE='http://localhost:5173'
keys=json.loads(pathlib.Path('work/keys.json').read_text())
def request(path, body=None, key='CONTROL_KEY'):
    headers={'Content-Type':'application/json'}
    if key: headers['Authorization']='Bearer '+keys[key]
    req=urllib.request.Request(BASE+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
    try:
        with urllib.request.urlopen(req,timeout=10) as r:return r.status,json.load(r)
    except urllib.error.HTTPError as e:return e.code,json.load(e)
checks=0
def check(condition):
    global checks
    assert condition
    checks+=1
def command(action,**rest):
    status,data=request('/api/command',dict(action=action,**rest))
    check(status==200)
    return data
check(request('/api/state',key=None)[0]==401)
check(request('/api/command',{'action':'clear'},key='OUTPUT_KEY')[0]==401)
check(request('/api/command',{'action':'in','cue':'missing'})[0]==400)
cues=request('/api/catalog')[1]; a,b=[c['id'] for c in cues[:2]]
s=command('in',cue=a);check(s['cue']==a)
s=command('out',cue=b);check(s['cue']==a)
s=command('out',cue=a);check(s['cue'] is None)
cid=str(uuid.uuid4());s=command('in',cue=a,commandId=cid)
check(command('in',cue=a,commandId=cid)['revision']==s['revision'])
check(request('/api/command',{'action':'in','cue':b,'commandId':cid})[0]==409)
controller=str(uuid.uuid4())
s=command('cut',clientId=controller,sequence=2)
late=command('in',cue=a,clientId=controller,sequence=1)
check(late['cue'] is None and late['revision']==s['revision'])
renderer='api-test-'+str(uuid.uuid4())
check(request('/api/ack',{'id':renderer,'cue':None,'revision':s['revision'],'phase':'settled'},key='OUTPUT_KEY')[0]==200)
check(any(r['id']==renderer for r in request('/api/state')[1]['renderers']))
command('clear')
print(f'{checks} API assertions passed; final requested state clear.')
