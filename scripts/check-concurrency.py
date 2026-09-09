import concurrent.futures,json,os,pathlib,urllib.request,uuid
base=os.environ.get('CRC_TEST_URL','http://localhost:5175')
keys=json.loads(pathlib.Path(os.environ.get('CRC_TEST_KEYS','work/keys.json')).read_text())
headers={'Authorization':'Bearer '+keys['CONTROL_KEY'],'Content-Type':'application/json'}
def req(path,body=None):
 with urllib.request.urlopen(urllib.request.Request(base+path,headers=headers,data=None if body is None else json.dumps(body).encode()),timeout=20) as r:return json.load(r)
cue=req('/api/catalog')[0]['id']
before=req('/api/state')['revision'];cid=str(uuid.uuid4())
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(lambda _:req('/api/command',{'action':'in','cue':cue,'commandId':cid}),range(16)))
assert req('/api/state')['revision']==before+1
client=str(uuid.uuid4())
# The highest activation sequence is clear, regardless of request arrival order.
commands=[{'action':'cut' if i==16 else 'in','cue':cue,'clientId':client,'sequence':i,'commandId':str(uuid.uuid4())} for i in [4,15,16,7,3,14,2,9,1,13,11,5,10,8,6,12]]
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:list(pool.map(lambda b:req('/api/command',b),commands))
assert req('/api/state')['cue'] is None
print('Concurrent duplicate commands execute once; reordered older cues cannot undo the highest-sequence clear.')
