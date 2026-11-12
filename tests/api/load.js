import http from 'k6/http';
import {check,sleep} from 'k6';
export const options={vus:10,duration:'30s',thresholds:{http_req_duration:['p(95)<100'],http_req_failed:['rate<0.01']}};
const base=__ENV.BASE_URL||'http://localhost:3000';
export default function(){if(__ITER===0){const r=http.post(base+'/api/login',JSON.stringify({email:'employee@dauys.local',password:'DauysDemo2026!'}),{headers:{'Content-Type':'application/json'}});check(r,{'login':r=>r.status===200})}const r=http.get(base+'/api/appeals?mine=true');check(r,{'list':r=>r.status===200});sleep(1)}
