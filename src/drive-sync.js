// Resolve settings changes by their contents, not by Drive's metadata version alone.
// Updated-at timestamps and file metadata are excluded from the fingerprint.
function canonical(value){
 if(Array.isArray(value))return value.map(canonical);
 if(value&&typeof value==='object'){
  return Object.fromEntries(Object.keys(value).sort().filter(k=>value[k]!==undefined).map(k=>[k,canonical(value[k])]));
 }
 return value;
}
export async function driveSettingsDigest(snapshot){
 const comparable=canonical({settings:snapshot?.settings||{},master:snapshot?.master||{}});
 const bytes=new TextEncoder().encode(JSON.stringify(comparable));
 const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
}
// Only a real divergence from a known common base counts as a conflict.
export function decideDriveSync({remoteExists,localDigest,remoteDigest,baseDigest='',pending=false,remoteRevision='',baseRevision=''}){
 if(!remoteExists)return baseRevision?'missing':'upload';
 if(localDigest===remoteDigest)return 'equal';
 if(baseDigest){
  if(remoteDigest===baseDigest)return 'upload';
  if(localDigest===baseDigest)return 'download';
  return 'conflict';
 }
 // Legacy devices may only have a revision; matching it is safe to upload.
 if(remoteRevision&&remoteRevision===baseRevision)return pending?'upload':'download';
 return pending?'conflict':'download';
}
