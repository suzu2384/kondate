import { mkdir, rm, cp } from 'node:fs/promises';
await rm('dist',{recursive:true,force:true}); await mkdir('dist');
for(const p of ['index.html','style.css','manifest.webmanifest','sw.js','icons','src']) await cp(p,`dist/${p}`,{recursive:true});
console.log('Static app built in dist/');
