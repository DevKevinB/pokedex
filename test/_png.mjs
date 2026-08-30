import { inflateSync } from 'node:zlib';
// minimal PNG decoder: 8-bit RGB/RGBA, non-interlaced (what Playwright emits)
export function decode(buf) {
  let p = 8, w=0,h=0,depth=0,ct=0, idat=[], pal=null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p); const type = buf.toString('ascii', p+4, p+8);
    const data = buf.subarray(p+8, p+8+len);
    if (type==='IHDR'){ w=data.readUInt32BE(0); h=data.readUInt32BE(4); depth=data[8]; ct=data[9]; }
    else if (type==='PLTE') pal=data;
    else if (type==='IDAT') idat.push(data);
    else if (type==='IEND') break;
    p += 12+len;
  }
  if (depth!==8) throw new Error('depth '+depth);
  const ch = ct===6?4: ct===2?3: ct===0?1: ct===4?2: 1;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w*ch;
  const out = Buffer.alloc(h*stride);
  let pos=0;
  for (let y=0;y<h;y++){
    const ft = raw[pos++]; const line = raw.subarray(pos, pos+stride); pos+=stride;
    const cur = out.subarray(y*stride,(y+1)*stride);
    const prev = y? out.subarray((y-1)*stride, y*stride) : Buffer.alloc(stride);
    for (let x=0;x<stride;x++){
      const a = x>=ch? cur[x-ch]:0, b = prev[x], c = x>=ch? prev[x-ch]:0;
      let v = line[x];
      if (ft===1) v+=a; else if (ft===2) v+=b; else if (ft===3) v+=((a+b)>>1);
      else if (ft===4){ const pp=a+b-c, pa=Math.abs(pp-a), pb=Math.abs(pp-b), pc=Math.abs(pp-c);
        v += (pa<=pb&&pa<=pc)?a:(pb<=pc?b:c); }
      cur[x]=v&255;
    }
  }
  return { w,h,ch,ct,pal,data: out };
}
// mean saturation over non-transparent, non-near-white pixels
export function stats(png) {
  const {w,h,ch,data,ct,pal} = png;
  let n=0, sat=0, opaque=0;
  for (let y=0;y<h;y++) for (let x=0;x<w;x++){
    const i=(y*w+x)*ch; let r,g,b,a=255;
    if (ct===6){r=data[i];g=data[i+1];b=data[i+2];a=data[i+3];}
    else if (ct===2){r=data[i];g=data[i+1];b=data[i+2];}
    else if (ct===3){const q=data[i]*3;r=pal[q];g=pal[q+1];b=pal[q+2];}
    else {r=g=b=data[i];}
    if (a<40) continue; opaque++;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b);
    if (mx<10) continue;
    sat += (mx-mn)/mx; n++;
  }
  return { opaque, meanSat: n? +(sat/n).toFixed(4):0, samples:n };
}
