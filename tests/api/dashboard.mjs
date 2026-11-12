import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://localhost:5173';let checks=0;
const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'employee@dauys.local',password:'DauysDemo2026!'})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
async function get(path,status=200){const r=await fetch(base+'/api'+path,{headers:{Cookie:cookie}});assert.equal(r.status,status,path);return r.json()}
const all=await get('/analytics');assert.equal(all.summary.total,all.departments.reduce((s,d)=>s+d.total,0));checks++;assert.equal(all.trend.length,12);checks++;
for(const month of ['2026-10','2026-11']){const data=await get('/analytics?month='+month+'&department=IT');assert.ok(data.departments.every(d=>d.department==='IT'));assert.ok(data.summary.total<=all.summary.total);checks++;const results=await get('/appeals?status=done&month='+month);assert.ok(results.items.every(a=>['resolved','closed'].includes(a.status)&&a.updated_at.startsWith(month)));checks++}
await get('/analytics?month=bad',400);checks++;
const mine=await get('/appeals?mine=true');assert.equal(mine.counts.total,mine.total);checks++;const solved=await get('/appeals?mine=true&status=resolved');assert.equal(solved.total,mine.counts.resolved);checks++;
await fetch(base+'/api/logout',{method:'POST',headers:{Cookie:cookie}});console.log(JSON.stringify({checks,status:'PASS',scope:'dashboard filters, counters and result board'}));
