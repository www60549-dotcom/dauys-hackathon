import assert from 'node:assert/strict';
const base=process.env.BASE_URL||'http://127.0.0.1:8088';
assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/,'Fresh seed verification is local/CI only');
const login=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'employee@dauys.local',password:'DauysDemo2026!'})});
assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];let checks=0;
async function get(path){const r=await fetch(base+'/api'+path,{headers:{Cookie:cookie}});assert.equal(r.status,200,path);return r.json()}
const praise=(await get('/appeals/A-018')).appeal;
assert.equal(praise.kind,'praise');assert.equal(praise.confirmed,false);assert.equal(praise.actual_effect,0);checks++;
for(let i=1;i<=20;i++){
 const path='/appeals/A-'+String(i).padStart(3,'0');
 const appeal=(await get(path)).appeal,sla=await get(path+'/sla');
 assert.equal(Date.parse(sla.response_due_at)-Date.parse(appeal.created_at),18*3600000,path+' response deadline follows actual creation time');checks++;
}
await fetch(base+'/api/logout',{method:'POST',headers:{Cookie:cookie}});
console.log(JSON.stringify({status:'PASS',checks,scope:'fresh synthetic seed: praise and 18-hour reply deadlines'}));
