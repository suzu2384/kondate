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


/** Fingerprints for safe, independent editing of a draft vs other settings. */
export async function driveSectionDigests(snapshot){
 const {draft=[],recentNewMains=[],...otherSettings}=snapshot?.settings||{};
 const [plan,other]=await Promise.all([
  driveSettingsDigest({settings:{draft,recentNewMains}}),
  driveSettingsDigest({settings:otherSettings,master:snapshot?.master||{}})
 ]);
 return {plan,other};
}
/**
 * Three-way merge only when the devices changed disjoint sections.
 * A simultaneous edit to the actual meal draft is always a conflict.
 * Missing baselines (older clients) are deliberately never inferred.
 */
export async function mergeIndependentDriveChanges(local,remote,base){
 if(!base||!['plan','other'].every(k=>typeof base[k]==='string'&&/^[0-9a-f]{64}$/.test(base[k])))
  return null;
 const [l,r]=await Promise.all([driveSectionDigests(local),driveSectionDigests(remote)]);
 const localPlan=l.plan!==base.plan,remotePlan=r.plan!==base.plan;
 const localOther=l.other!==base.other,remoteOther=r.other!==base.other;
 if(localPlan&&!remotePlan&&!localOther&&remoteOther)
  return {...remote,settings:{...remote.settings,
   draft:structuredClone(local.settings.draft),
   recentNewMains:structuredClone(local.settings.recentNewMains||[])}};
 if(remotePlan&&!localPlan&&localOther&&!remoteOther)
  return {...remote,settings:{...local.settings,
   draft:structuredClone(remote.settings.draft),
   recentNewMains:structuredClone(remote.settings.recentNewMains||[])},
   master:structuredClone(local.master||{})};
 return null;
}
