import assert from 'node:assert/strict';
import test from 'node:test';
import {imageUrl,publicationStatus,publishedByLine,rollbackOffer} from '../app/author/publications/publications-model';

// R-A2 - the publications page speaks to a volunteer: names, never ids; a plain reason when
// there is nothing to go back to.
test('who published reads as a person would say it',()=>{
 assert.equal(publishedByLine({publishedBy:'agent',memberName:'Dana Levi',standingApproval:false}),'Published by an assistant connected by Dana Levi');
 assert.equal(publishedByLine({publishedBy:'agent',memberName:null,standingApproval:false}),'Published by an assistant');
 assert.equal(publishedByLine({publishedBy:'person',memberName:'Dana Levi',standingApproval:false}),'Published by Dana Levi');
 assert.equal(publishedByLine({publishedBy:'person',memberName:null,standingApproval:true}),'Saved on This service');
});

test('status and the go-back offer follow whether the publication is still in use',()=>{
 assert.deepEqual(publicationStatus({current:true,archived:false}),{label:'In use now',tone:'live'});
 assert.deepEqual(publicationStatus({current:false,archived:false}),{label:'Replaced by a later version',tone:'replaced'});
 assert.equal(publicationStatus({current:true,archived:true}).tone,'archived');
 assert.deepEqual(rollbackOffer({current:true,rollbackTo:1,draftVersion:3}),{available:true});
 assert.deepEqual(rollbackOffer({current:false,rollbackTo:null,draftVersion:3}),{available:false,reason:null});
 assert.match((rollbackOffer({current:true,rollbackTo:null,draftVersion:1}) as {reason:string}).reason,/first version/);
 assert.equal(imageUrl('a b'),'/api/authoring/publications?image=a%20b');
});
