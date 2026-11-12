import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync('vercel.json','utf8'));
const target=config.rewrites?.find(route=>route.source==='/api/:path*')?.destination;
if(!target || !target.startsWith('https://')) {
 throw new Error('Public Go API is not configured. Deploy the backend, then run node scripts/prepare-vercel.mjs https://your-api.onrender.com.');
}
