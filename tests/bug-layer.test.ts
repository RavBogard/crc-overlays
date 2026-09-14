import test from 'node:test';
import assert from 'node:assert/strict';
import {BUG_RESERVED_RECT,bugViewFor,renderBugLayer,validBugPage,type BugView} from '../lib/bug-layer.ts';
import {GET as qrRoute} from '../app/api/bug/qr.svg/route.ts';
import {POST as commandRoute} from '../app/api/command/route.ts';
import {BUG_PAGE_INPUT_PATTERN,bugPageLengthRefusal,commandErrorMessage,commandRefusal,COMMAND_NOT_CONFIRMED,PAGE_TOO_LONG} from '../lib/console-messages.ts';

/* No DOM library is available to this suite, so the layer is driven through the smallest
   document surface renderBugLayer actually uses. Everything it touches is here; anything it
   started touching that is not here would fail loudly rather than silently pass. */
class FakeElement{
 readonly tagName:string;
 readonly ownerDocument:FakeDocument;
 className='';
 textContent='';
 hidden=false;
 alt='';
 parentNode:FakeElement|null=null;
 children:FakeElement[]=[];
 dataset:Record<string,string>={};
 private readonly attributes=new Map<string,string>();
 constructor(tagName:string,ownerDocument:FakeDocument){this.tagName=tagName;this.ownerDocument=ownerDocument}
 append(...nodes:FakeElement[]){for(const node of nodes){node.parentNode=this;this.children.push(node)}}
 replaceChildren(...nodes:FakeElement[]){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...nodes)}
 setAttribute(name:string,value:string){this.attributes.set(name,value)}
 getAttribute(name:string){return this.attributes.get(name)??null}
 find(className:string):FakeElement|null{
  if(this.className===className)return this;
  for(const child of this.children){const found=child.find(className);if(found)return found}
  return null;
 }
}
class FakeDocument{createElement(tagName:string){return new FakeElement(tagName,this)}}
const stage=()=>{const owner=new FakeDocument();return new FakeElement('div',owner)};
const asRoot=(element:FakeElement)=>element as unknown as HTMLElement;
const view=(overrides:Partial<BugView>={}):BugView=>({on:true,page:'122',caption:'DAVEN ALONG',qrSrc:'/api/bug/qr.svg',...overrides});

test('the scan card renders its QR, caption and page chip inside the reserved corner',()=>{
 const root=stage();
 renderBugLayer(asRoot(root),view());
 assert.equal(root.children.length,1);
 const card=root.children[0];
 assert.equal(card.className,'bug-card');
 assert.equal(card.find('bug-qr')?.getAttribute('src'),'/api/bug/qr.svg');
 assert.equal(card.find('bug-qr')?.alt,'');
 assert.equal(card.find('bug-caption')?.textContent,'DAVEN ALONG');
 assert.equal(card.find('bug-page')?.textContent,'122');
 assert.equal(card.find('bug-page')?.hidden,false);
 assert.equal(root.dataset.bug,'on');
 // D6 - the corner the card occupies, as the fit check measures it.
 assert.deepEqual({...BUG_RESERVED_RECT},{left:1572,top:732,right:1872,bottom:1032});
});

test('rendering the same view twice keeps the same nodes and a page change updates in place',()=>{
 const root=stage();
 renderBugLayer(asRoot(root),view());
 const card=root.children[0],image=card.find('bug-qr');
 renderBugLayer(asRoot(root),view());
 assert.equal(root.children.length,1);
 assert.equal(root.children[0],card);
 assert.equal(card.find('bug-qr'),image);
 renderBugLayer(asRoot(root),view({page:'p. 14'}));
 assert.equal(root.children[0],card);
 assert.equal(card.find('bug-page')?.textContent,'p. 14');
});

test('a card with no page hides the chip rather than showing an empty one',()=>{
 const root=stage();
 renderBugLayer(asRoot(root),view({page:null}));
 const chip=root.children[0].find('bug-page');
 assert.equal(chip?.textContent,'');
 assert.equal(chip?.hidden,true);
});

test('null and an off state both clear the layer',()=>{
 const root=stage();
 renderBugLayer(asRoot(root),view());
 renderBugLayer(asRoot(root),null);
 assert.deepEqual(root.children,[]);
 assert.equal(root.dataset.bug,'off');
 renderBugLayer(asRoot(root),view());
 renderBugLayer(asRoot(root),view({on:false}));
 assert.deepEqual(root.children,[]);
 assert.equal(root.dataset.bug,'off');
});

test('a Player.set() cycle on #output never touches the scan card layer',()=>{
 const output=stage(),bugRoot=stage();
 renderBugLayer(asRoot(bugRoot),view());
 const card=bugRoot.children[0];
 // What Player.set() does to its own root, once per cue change.
 output.replaceChildren(output.ownerDocument.createElement('div'));
 output.replaceChildren();
 assert.equal(bugRoot.children.length,1);
 assert.equal(bugRoot.children[0],card);
});

test('a congregation with no scan card never renders one, whatever live state says',()=>{
 assert.equal(bugViewFor({enabled:false,url:null,caption:null},{on:true,page:'122'}),null);
 assert.equal(bugViewFor(null,{on:true,page:'122'}),null);
 assert.equal(bugViewFor({enabled:true,url:'https://siddur.example',caption:'DAVEN ALONG'},{on:false,page:null}),null);
 assert.deepEqual(bugViewFor({enabled:true,url:'https://siddur.example',caption:'DAVEN ALONG'},{on:true,page:'  122 '}),
  {on:true,page:'122',caption:'DAVEN ALONG',qrSrc:'/api/bug/qr.svg'});
});

test('the page label accepts a short label and refuses anything longer than twelve characters',()=>{
 assert.equal(validBugPage(null),true);
 assert.equal(validBugPage('122'),true);
 assert.equal(validBugPage('p. 14, side'),true);
 assert.equal(validBugPage('1234567890123'),false);
 assert.equal(validBugPage(''),false);
 assert.equal(validBugPage('<script>'),false);
 assert.equal(validBugPage(12),false);
});

/* ---------------------------------------------------------------------------
 * The two HTTP surfaces. Both read the workspace from the environment, so each
 * test sets the environment it means and the suite restores it afterwards.
 * ------------------------------------------------------------------------ */
const originalWorkspaceId=process.env.WORKSPACE_ID;
const originalControlKey=process.env.CONTROL_KEY;
const originalRelayUrl=process.env.RELAY_URL;
const originalRelaySecret=process.env.RELAY_SECRET;
const restore=(name:string,value:string|undefined)=>{if(value===undefined)delete process.env[name];else process.env[name]=value};
const TBI='temple-bnai-israel-kalamazoo';

test.after(()=>{
 restore('WORKSPACE_ID',originalWorkspaceId);
 restore('CONTROL_KEY',originalControlKey);
 restore('RELAY_URL',originalRelayUrl);
 restore('RELAY_SECRET',originalRelaySecret);
});

test('the QR is served publicly and cached at the edge for the congregation that has a scan card',async()=>{
 delete process.env.WORKSPACE_ID;
 const response=qrRoute();
 assert.equal(response.status,200);
 assert.equal(response.headers.get('content-type'),'image/svg+xml; charset=utf-8');
 assert.equal(response.headers.get('cache-control'),'public, max-age=86400, stale-while-revalidate=604800');
 const body=await response.text();
 assert.match(body,/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
 assert.equal(body.includes('<script'),false);
 // The address never appears in the artwork: it is encoded, not printed.
 assert.equal(body.includes('siddur'),false);
 // F9: the document may load nothing at all. lib/qr.ts draws plain <rect> elements with
 // fill attributes, so not even inline style is needed and none is allowed.
 assert.equal(response.headers.get('content-security-policy'),"default-src 'none'");
 assert.equal(body.includes('style='),false);
});

test('a congregation with no scan card has no QR to serve',async()=>{
 process.env.WORKSPACE_ID=TBI;
 const response=qrRoute();
 assert.equal(response.status,404);
 assert.equal(response.headers.get('cache-control'),'no-store');
});

const bugCommand=(body:Record<string,unknown>)=>commandRoute(new Request('https://graphics.example/api/command',{
 method:'POST',
 headers:{Authorization:'Bearer control-secret','Content-Type':'application/json'},
 body:JSON.stringify({commandId:'11111111-1111-4111-8111-111111111111',clientId:null,sequence:null,cue:null,...body}),
}));

test('the command route refuses the scan card for a congregation that has none',async()=>{
 process.env.CONTROL_KEY='control-secret';
 process.env.WORKSPACE_ID=TBI;
 delete process.env.RELAY_URL;delete process.env.RELAY_SECRET;
 const response=await bugCommand({action:'bug',bug:{on:true,page:null}});
 assert.equal(response.status,400);
 assert.deepEqual(await response.json(),{error:'The scan card is not set up for this congregation.'});
});

test('the scan card is relay-only and says so when the live connection is not configured',async()=>{
 process.env.CONTROL_KEY='control-secret';
 delete process.env.WORKSPACE_ID;
 delete process.env.RELAY_URL;delete process.env.RELAY_SECRET;
 const response=await bugCommand({action:'bug',bug:{on:true,page:null}});
 assert.equal(response.status,503);
 assert.deepEqual(await response.json(),{error:'The scan card needs the live connection.'});
});

test('an over-long page is refused before anything reaches the live connection',async()=>{
 process.env.CONTROL_KEY='control-secret';
 delete process.env.WORKSPACE_ID;
 process.env.RELAY_URL='https://relay.example';process.env.RELAY_SECRET='relay-secret';
 const response=await bugCommand({action:'bug',bug:{on:true,page:'1234567890123'}});
 assert.equal(response.status,400);
 assert.deepEqual(await response.json(),{error:'Page must be 12 characters or fewer.'});
});

test('a scan card command with no state is not a command',async()=>{
 process.env.CONTROL_KEY='control-secret';
 delete process.env.WORKSPACE_ID;
 process.env.RELAY_URL='https://relay.example';process.env.RELAY_SECRET='relay-secret';
 const response=await bugCommand({action:'bug'});
 assert.equal(response.status,400);
 assert.deepEqual(await response.json(),{error:'Unknown action or cue'});
});

test('a refused command is reported in the words the route wrote, not a generic sentence',()=>{
 // The three sentences /api/command actually answers with (E6, E7, E8).
 for(const sentence of [
  'The scan card is not set up for this congregation.',
  'The scan card needs the live connection.',
  'Page must be 12 characters or fewer.',
 ]){
  assert.equal(commandRefusal({error:sentence}),sentence);
  assert.equal(commandErrorMessage({error:sentence}),sentence);
 }
 // Anything that is not a refusal sentence falls back to the console's own words.
 for(const body of [null,undefined,'Bad Request',[{error:'x'}],{},{error:''},{error:'   '},{error:404}]){
  assert.equal(commandRefusal(body),'');
  assert.equal(commandErrorMessage(body),COMMAND_NOT_CONFIRMED);
 }
 assert.equal(COMMAND_NOT_CONFIRMED,'Command not confirmed. Check requested and rendered status.');
});

test('the console refuses only an over-long page itself and leaves every character to the relay',()=>{
 assert.equal(bugPageLengthRefusal('1234567890123'),PAGE_TOO_LONG);
 assert.equal(bugPageLengthRefusal(' '.repeat(4)+'1234567890123'),PAGE_TOO_LONG);
 assert.equal(PAGE_TOO_LONG,'Page must be 12 characters or fewer.');
 for(const page of ['','   ','142','p. 142','Shabbat eve','p<142>']) assert.equal(bugPageLengthRefusal(page),'');
 // The field's pattern is the relay's own character set, so the browser marks a bad page
 // before it is sent, and the relay is still the one authority that refuses it.
 const field=new RegExp(`^(?:${BUG_PAGE_INPUT_PATTERN})$`);
 for(const page of ['','142','p. 142','1-2',String.fromCharCode(8211)]) assert.equal(field.test(page),true,page);
 for(const page of ['p<142>','142!','\u05d0','1234567890123']) assert.equal(field.test(page),false,page);
 // Every page the field accepts, the relay accepts too.
 for(const page of ['142','p. 142','1-2']) assert.equal(validBugPage(page),true);
});
