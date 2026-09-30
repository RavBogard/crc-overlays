import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyFolderOperation,emptyLibraryFolders,MemoryLibraryFoldersRepository,parseFolderOperation} from '../lib/library-folders';

const cueIds=new Set(['built-in-cue','archived-draft','retired-draft']);

test('create, file, rename and delete preserve graphics while removing folder assignments',()=>{
 const original=emptyLibraryFolders();
 const created=applyFolderOperation(original,parseFolderOperation({operation:'create',expectedVersion:0,name:'  Evening  '}),cueIds,()=> 'folder-1');
 assert.deepEqual(created,{version:1,folders:[{id:'folder-1',name:'Evening'}],assignments:{}});
 const filed=applyFolderOperation(created,parseFolderOperation({operation:'move',expectedVersion:1,cueId:'archived-draft',folderId:'folder-1'}),cueIds);
 const renamed=applyFolderOperation(filed,parseFolderOperation({operation:'rename',expectedVersion:2,folderId:'folder-1',name:'Friday evening'}),cueIds);
 assert.deepEqual(renamed.assignments,{'archived-draft':'folder-1'});
 const unfiled=applyFolderOperation(renamed,parseFolderOperation({operation:'delete',expectedVersion:3,folderId:'folder-1'}),cueIds);
 assert.deepEqual(unfiled,{version:4,folders:[],assignments:{}});
 assert.deepEqual(original,emptyLibraryFolders());
});

test('built-in and retired graphics can be filed, but unknown workspace IDs are refused',()=>{
 const folder=applyFolderOperation(emptyLibraryFolders(),parseFolderOperation({operation:'create',expectedVersion:0,name:'Core'}),cueIds,()=> 'folder-1');
 for(const cueId of ['built-in-cue','retired-draft']){
  const next=applyFolderOperation(folder,parseFolderOperation({operation:'move',expectedVersion:1,cueId,folderId:'folder-1'}),cueIds);
  assert.equal(next.assignments[cueId],'folder-1');
 }
 assert.throws(()=>applyFolderOperation(folder,parseFolderOperation({operation:'move',expectedVersion:1,cueId:'outside-workspace',folderId:'folder-1'}),cueIds),{code:'unknown_graphic'});
});

test('stale folder writes conflict and cannot overwrite a newer assignment',async()=>{
 const store=new MemoryLibraryFoldersRepository();
 const first=await store.get(),second=await store.get();
 await store.put(applyFolderOperation(first,parseFolderOperation({operation:'create',expectedVersion:0,name:'One'}),cueIds,()=> 'one'),0);
 await assert.rejects(store.put(applyFolderOperation(second,parseFolderOperation({operation:'create',expectedVersion:0,name:'Two'}),cueIds,()=> 'two'),0),{code:'version_conflict'});
 assert.deepEqual((await store.get()).folders,[{id:'one',name:'One'}]);
});

test('folder API inputs reject duplicate names, unsupported fields and bad moves',()=>{
 const folder=applyFolderOperation(emptyLibraryFolders(),parseFolderOperation({operation:'create',expectedVersion:0,name:'One'}),cueIds,()=> 'one');
 assert.throws(()=>applyFolderOperation(folder,parseFolderOperation({operation:'create',expectedVersion:1,name:' one '}),cueIds),{code:'folder_name_conflict'});
 assert.throws(()=>parseFolderOperation({operation:'move',expectedVersion:1,cueId:'built-in-cue',folderId:'missing',document:{name:'changed'}}),{code:'invalid_input'});
 assert.throws(()=>applyFolderOperation(folder,parseFolderOperation({operation:'move',expectedVersion:1,cueId:'built-in-cue',folderId:'missing'}),cueIds),{code:'unknown_folder'});
 assert.throws(()=>parseFolderOperation({operation:'create',expectedVersion:1,name:'No\nline'}),{code:'invalid_input'});
});
