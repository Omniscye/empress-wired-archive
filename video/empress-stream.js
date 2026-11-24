"use strict";
const empressSizes=[25165824,25165824,25165824,25165824,25165824,15128038];
const empressTotal=empressSizes.reduce((a,b)=>a+b,0);
const empressStart=empressSizes.map((_,i)=>empressSizes.slice(0,i).reduce((a,b)=>a+b,0));
const empressURL=new URL("Empress_Parade_1440p60.webm",self.registration.scope).href;
self.addEventListener("install",event=>event.waitUntil(self.skipWaiting()));
self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));
self.addEventListener("fetch",event=>{
 if(event.request.url.split("?")[0]!==empressURL)return;
 if(event.request.method!=="GET"&&event.request.method!=="HEAD")return;
 event.respondWith(empressServe(event.request));
});
function empressRange(value){
 if(!value)return [0,empressTotal-1,false];
 const m=/^bytes=(\d*)-(\d*)$/.exec(value.trim());
 if(!m||(!m[1]&&!m[2]))return null;
 let a,b;
 if(!m[1]){const n=Number(m[2]);if(!Number.isSafeInteger(n)||n<=0)return null;a=Math.max(0,empressTotal-n);b=empressTotal-1;}
 else{a=Number(m[1]);b=m[2]?Math.min(Number(m[2]),empressTotal-1):empressTotal-1;}
 if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||a>=empressTotal||b<a)return null;
 return [a,b,true];
}
async function empressServe(request){
 const range=empressRange(request.headers.get("range"));
 const headers=new Headers({"Content-Type":"video/webm","Accept-Ranges":"bytes","Cache-Control":"no-store"});
 if(!range){headers.set("Content-Range","bytes */"+empressTotal);return new Response(null,{status:416,headers});}
 const [first,last,partial]=range;
 headers.set("Content-Length",String(last-first+1));
 if(partial)headers.set("Content-Range","bytes "+first+"-"+last+"/"+empressTotal);
 const status=partial?206:200;
 if(request.method==="HEAD")return new Response(null,{status,headers});
 let cursor=first,reader=null,skip=0,left=0;
 const abort=new AbortController();
 async function closeReader(){if(reader){const r=reader;reader=null;try{await r.cancel();}catch{}}}
 const stream=new ReadableStream({
  async pull(controller){
   try{
    while(cursor<=last){
     if(!reader){
      const i=empressStart.findIndex((a,j)=>cursor>=a&&cursor<a+empressSizes[j]);
      if(i<0)throw Error("Invalid archive offset");
      const offset=cursor-empressStart[i],end=Math.min(empressSizes[i]-1,last-empressStart[i]);
      const url=new URL("../empress-parade.part"+String(i).padStart(2,"0"),self.registration.scope);
      const r=await fetch(url,{headers:{Range:"bytes="+offset+"-"+end},signal:abort.signal});
      if(!r.ok||!r.body||(r.headers.get("content-type")||"").includes("text/html"))throw Error("Archive segment "+(i+1)+" unavailable");
      if(r.status===206){
       const cr=r.headers.get("Content-Range")||"";
       const match=/^bytes (\d+)-(\d+)\/(\d+|\*)$/i.exec(cr);
       if(!match||Number(match[1])!==offset||Number(match[2])<end)throw Error("Archive range mismatch");
       skip=0;
      }else if(r.status===200){skip=offset;}
      else throw Error("Archive response invalid");
      left=end-offset+1;reader=r.body.getReader();
     }
     const {done,value}=await reader.read();
     if(done)throw Error("Archive stream ended prematurely");
     if(skip>=value.byteLength){skip-=value.byteLength;continue;}
     const take=Math.min(left,value.byteLength-skip);
     const bytes=value.subarray(skip,skip+take);skip=0;left-=take;cursor+=take;
     if(left===0)await closeReader();
     controller.enqueue(bytes);
     if(cursor>last)controller.close();
     return;
    }
    controller.close();
   }catch(error){abort.abort();await closeReader();controller.error(error);}
  },
  async cancel(){abort.abort();await closeReader();}
 });
 return new Response(stream,{status,headers});
}
