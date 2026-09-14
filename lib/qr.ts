import qrcode from 'qrcode-generator';

/**
 * D8 — the scan card's QR is generated on the server from congregation config, so a
 * domain change is a config edit rather than a re-cut graphic. `qrcode-generator` is
 * MIT, dependency-free and does the encoding; everything drawn here is ours.
 *
 * Level M is the stream-kit house choice: on a screen there is no toner and no crease,
 * so bigger modules beat damage tolerance.
 */
export type QrLevel='L'|'M'|'Q'|'H';

/** Four modules of quiet zone on all four sides, as the specification requires. */
export const QR_QUIET_ZONE=4;

export type QrSvgOptions={level?:QrLevel;moduleSize?:number;quietZone?:number;dark?:string;light?:string};

/** Rows of modules, top to bottom; `true` is a dark module. */
export function qrMatrix(text:string,level:QrLevel='M'):boolean[][]{
 if(typeof text!=='string'||!text)throw Error('QR text is required');
 const code=qrcode(0,level);
 code.addData(text);
 code.make();
 const count=code.getModuleCount();
 const rows:boolean[][]=[];
 for(let row=0;row<count;row++){
  const line:boolean[]=[];
  for(let column=0;column<count;column++)line.push(code.isDark(row,column));
  rows.push(line);
 }
 return rows;
}

/**
 * One `<svg>` string, drawn as one background rect plus one rect per dark module.
 * No script, no external reference, no font: it is safe to serve as a document and
 * safe to point an `<img src>` at.
 */
export function qrSvg(text:string,options:QrSvgOptions={}):string{
 const level=options.level??'M';
 const moduleSize=Math.max(1,Math.round(options.moduleSize??8));
 const quietZone=Math.max(0,Math.round(options.quietZone??QR_QUIET_ZONE));
 const dark=safeColor(options.dark??'#1b1b24','dark');
 const light=safeColor(options.light??'#fbf7ef','light');
 const matrix=qrMatrix(text,level);
 const side=(matrix.length+quietZone*2)*moduleSize;
 const parts:string[]=[`<rect width="${side}" height="${side}" fill="${light}"/>`];
 for(let row=0;row<matrix.length;row++)for(let column=0;column<matrix.length;column++){
  if(!matrix[row][column])continue;
  const x=(column+quietZone)*moduleSize,y=(row+quietZone)*moduleSize;
  parts.push(`<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="${dark}"/>`);
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}" viewBox="0 0 ${side} ${side}" shape-rendering="crispEdges" role="img" aria-label="QR code">${parts.join('')}</svg>`;
}

function safeColor(value:string,label:string){
 if(!/^#[0-9a-fA-F]{6}$/.test(value))throw Error(`QR ${label} colour must be a six-digit hex colour`);
 return value.toLowerCase();
}
