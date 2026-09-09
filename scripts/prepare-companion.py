"""Generate a private test-page import from the installed Companion's own template."""
import copy,gzip,json,pathlib,uuid
root=pathlib.Path(__file__).resolve().parents[1]
d=json.loads(gzip.decompress((root/'work/companion-template.companionconfig').read_bytes()))
keys=json.loads((root/'work/keys.json').read_text())
cues=json.loads((root/'lib/cues.json').read_text(encoding='utf-8'))
page=d['pages']['1'];template=page['controls']['0']['1'];page['name']='CRC Overlay Test'
for col,(name,body,color) in enumerate([(c['name'],{'action':'in','cue':c['id']},0x704667) for c in cues]+[('Animate\nout',{'action':'clear'},0x384656),('CLEAR\nNOW',{'action':'cut'},0x9c303c)],1):
    button=copy.deepcopy(template)
    for layer in button['style']['layers']:
        if layer['type']=='text':layer['text']['value']=name;layer['fontsize']['value']=14
        if layer['type']=='box':layer['color']['value']=color
    action=button['steps']['0']['action_sets']['down'][0]
    action['id']=str(uuid.uuid4());opts=action['options']
    for key,value in {'url':'/api/command','body':json.dumps(body),'header':json.dumps({'Authorization':'Bearer '+keys['CONTROL_KEY']})}.items():opts[key]={'isExpression':False,'value':value}
    button['options']['notes']='CRC isolated local test. Status is shown in Overlay Control; button colour is not rendered feedback.'
    page['controls']['0'][str(col)]=button
# A page import offers mapping to the existing HTTP connection, without replacing other pages.
d['type']='page';d.pop('pages');d['page']=page;d['oldPageNumber']=1
for name in ['triggers','surfaces','surfaceGroups','surfacesRemote','surfaceInstances']:d.pop(name,None)
(root/'work/CRC-Overlay-Test.companionconfig').write_bytes(gzip.compress(json.dumps(d).encode()))
print('Private CRC test page generated; no keys printed.')
