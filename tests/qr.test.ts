import test from 'node:test';
import assert from 'node:assert/strict';
import {QR_QUIET_ZONE,qrMatrix,qrSvg} from '../lib/qr.ts';
import {getPublicWorkspace} from '../lib/workspace.ts';

/*
 * D8 - the encoder is cross-checked, not trusted.
 *
 * The plan's first choice was a fixture from `shireishabbat/stream-kit/gen_qr.py`. That script
 * and its decoder are both present on this machine and were run read-only. It agrees on the
 * version (3), the level (M) and the size (29 x 29), and its matrix is identical to the
 * `qrcode` npm package's on every data module - but the two differ on the eight
 * format-information modules, and jsQR, a third and independent decoder, reads the npm
 * matrices and fails on gen_qr.py's. gen_qr.py's encoder and decoder share a convention no
 * scanner agrees with, so its matrix is not the fixture. The fixture below is
 * qrcode-generator's own matrix, cross-checked two ways in the scratchpad at authoring time:
 *
 *   - every data module identical to the `qrcode` npm package's encoding of the same URL at
 *     level M (installed in the scratchpad only, never in this repo); and
 *   - decoded back to the exact URL by jsQR from a rendered bitmap.
 *
 * The gen_qr.py disagreement is reported to the lead rather than papered over here.
 */
const SIDDUR='https://siddur.centralreform.org';
const SIDDUR_MATRIX=[
 "11111110111000011100001111111",
 "10000010101000001111101000001",
 "10111010101010011011101011101",
 "10111010001110001101101011101",
 "10111010100000111111001011101",
 "10000010011100011100101000001",
 "11111110101010101010101111111",
 "00000000000101011001100000000",
 "10011111101001000101010010111",
 "10111000000011001011010110110",
 "00111011111111011000100110100",
 "01111001010011001111011011001",
 "10111111010001011001001100001",
 "11010000111111101110011111111",
 "01100010111001001101011010101",
 "01101001100100010000000110101",
 "00001010000010100000010101000",
 "10111000000001101101100010110",
 "11110110100100010011100011001",
 "11100000111110111010001001100",
 "11101110101011111100111111110",
 "00000000101110110110100011000",
 "11111110101100110101101011000",
 "10000010110010111101100010001",
 "10111010100101110011111111011",
 "10111010111010011110110000001",
 "10111010001110110100010110111",
 "10000010001010010010001101101",
 "11111110100000100001101111000",
];

const asRows=(matrix:boolean[][])=>matrix.map(row=>row.map(module=>module?'1':'0').join(''));

test('the scan card URL encodes to the cross-checked level M matrix',()=>{
 assert.deepEqual(asRows(qrMatrix(SIDDUR,'M')),SIDDUR_MATRIX);
});

test('the matrix is a well-formed QR symbol: version 3, finders and timing patterns',()=>{
 const rows=asRows(qrMatrix(SIDDUR,'M'));
 assert.equal(rows.length,29);                                  // version 3 = 29 modules
 assert.equal(QR_QUIET_ZONE,4);
 for(const row of rows)assert.equal(row.length,29);
 for(const [row,column] of [[0,0],[0,22],[22,0]] as Array<[number,number]>){
  assert.equal(rows[row].slice(column,column+7),'1111111');     // finder top edge
  assert.equal(rows[row+6].slice(column,column+7),'1111111');   // finder bottom edge
 }
 assert.equal(rows[6],'11111110101010101010101111111');         // horizontal timing
 assert.equal(rows.map(row=>row[6]).join(''),'11111110101010101010101111111');
});

test('a different error level and a different address produce different symbols',()=>{
 assert.notDeepEqual(asRows(qrMatrix(SIDDUR,'H')),SIDDUR_MATRIX);
 assert.notDeepEqual(asRows(qrMatrix('https://siddur.example','M')),SIDDUR_MATRIX);
 assert.throws(()=>qrMatrix('','M'),/QR text is required/);
});

test('the SVG is inert artwork: no script, no external reference, one rect per dark module',()=>{
 const svg=qrSvg(SIDDUR,{level:'M',moduleSize:8});
 const side=(29+QR_QUIET_ZONE*2)*8;
 assert.match(svg,new RegExp(`viewBox="0 0 ${side} ${side}"`));
 assert.match(svg,new RegExp(`width="${side}" height="${side}"`));
 const dark=SIDDUR_MATRIX.join('').split('').filter(module=>module==='1').length;
 assert.equal(svg.split('<rect').length-1,dark+1);              // the modules plus the parchment ground
 assert.equal(svg.includes('#fbf7ef'),true);                    // stream-kit parchment
 assert.equal(svg.includes('#1b1b24'),true);                    // stream-kit ink
 assert.equal(svg.includes('<script'),false);
 assert.equal(svg.includes('href'),false);
 assert.equal(svg.includes(SIDDUR),false);
 assert.throws(()=>qrSvg(SIDDUR,{dark:'javascript:alert(1)'}),/six-digit hex/);
});

test('the QR encodes exactly the address the workspace publishes',()=>{
 const workspace=getPublicWorkspace({});
 assert.equal(workspace.bug.url,SIDDUR);
 assert.deepEqual(asRows(qrMatrix(workspace.bug.url as string,'M')),SIDDUR_MATRIX);
});
