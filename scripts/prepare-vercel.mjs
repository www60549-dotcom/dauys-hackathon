import {writeFileSync} from 'node:fs';
const raw=process.argv[2]||process.env.PUBLIC_API_ORIGIN;
if(!raw)throw new Error('Set PUBLIC_API_ORIGIN to the deployed HTTPS Go API origin. Localhost cannot serve Vercel visitors.');
const url=new URL(raw);
if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/'||/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname))throw new Error('Expected a public HTTPS origin without credentials or a path.');
const config={
 $schema:'https://openapi.vercel.sh/vercel.json',framework:'vite',buildCommand:'npm run build',outputDirectory:'dist',
 rewrites:[{source:'/api/:path*',destination:url.origin+'/api/:path*'},{source:'/:path*',destination:'/index.html'}],
 headers:[{source:'/api/:path*',headers:[{key:'Cache-Control',value:'private, no-store'}]}],
};
writeFileSync('vercel.json',JSON.stringify(config,null,2)+'\n');
console.log('Prepared Vercel same-origin API proxy:',url.origin);
