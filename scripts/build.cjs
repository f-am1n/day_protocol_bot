const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dist=path.join(root,'dist'),server=path.join(dist,'server');fs.mkdirSync(server,{recursive:true});
const types={'.svg':'image/svg+xml','.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.webmanifest':'application/manifest+json'};
const assets={};for(const f of fs.readdirSync(dist)){const ext=path.extname(f);if(types[ext]&&fs.statSync(path.join(dist,f)).isFile())assets['/'+f]={type:types[ext],data:fs.readFileSync(path.join(dist,f)).toString('base64')}}
fs.writeFileSync(path.join(server,'assets.mjs'),'export const assets='+JSON.stringify(assets)+';');
for(const f of ['auth.mjs','store.mjs','schedule.mjs'])fs.copyFileSync(path.join(root,'server',f),path.join(server,f));
fs.copyFileSync(path.join(dist,'core.js'),path.join(server,'core.mjs'));
fs.copyFileSync(path.join(root,'server/worker.mjs'),path.join(server,'index.js'));
fs.writeFileSync(path.join(server,'package.json'),'{"type":"module"}');
fs.mkdirSync(path.join(dist,'.openai'),{recursive:true});fs.copyFileSync(path.join(root,'.openai/hosting.json'),path.join(dist,'.openai/hosting.json'));
fs.cpSync(path.join(root,'drizzle'),path.join(dist,'.openai/drizzle'),{recursive:true});
console.log('Worker built with '+Object.keys(assets).length+' public assets.');
