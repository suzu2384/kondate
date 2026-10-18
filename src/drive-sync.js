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
 const {draft=[],recentNewMains=[],recentSuggested=[],...otherSettings}=snapshot?.settings||{};
 const [plan,other]=await Promise.all([
  driveSettingsDigest({settings:{draft,recentNewMains,recentSuggested}}),
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
   recentNewMains:structuredClone(local.settings.recentNewMains||[]),
   recentSuggested:structuredClone(local.settings.recentSuggested||[])}};
 if(remotePlan&&!localPlan&&localOther&&!remoteOther)
  return {...remote,settings:{...local.settings,
   draft:structuredClone(remote.settings.draft),
   recentNewMains:structuredClone(remote.settings.recentNewMains||[]),
   recentSuggested:structuredClone(remote.settings.recentSuggested||[])},
   master:structuredClone(local.master||{})};
 return null;
}

/**
 * Three-way merge for independently changed configuration fields.
 * Unlike plan-vs-other partitioning, theme/calendar/rules/shopping changes
 * are compared separately. The common base is the last confirmed Drive
 * snapshot, never a fabricated copy of the current remote state.
 */
const ABSENT=Symbol('absent'),CONFLICT=Symbol('conflict');
const plain=value=>value!==ABSENT&&value!==null&&typeof value==='object'&&!Array.isArray(value);
function equivalent(left,right){
 if(left===ABSENT||right===ABSENT)return left===right;
 return JSON.stringify(canonical(left))===JSON.stringify(canonical(right));
}
function mergeSelected(base,local,remote){
 if(![base,local,remote].every(Array.isArray))return CONFLICT;
 const asMap=items=>new Map(items.map(item=>[String(item).trim().toLocaleLowerCase('ja'),item]));
 const b=asMap(base),l=asMap(local),r=asMap(remote);
 const result=new Map();
 for(const key of new Set([...b.keys(),...l.keys(),...r.keys()])){
  const prior=b.has(key)?b.get(key):ABSENT,lv=l.has(key)?l.get(key):ABSENT,rv=r.has(key)?r.get(key):ABSENT;
  const merged=mergeValue(prior,lv,rv,'selected-item');
  if(merged===CONFLICT)return CONFLICT;
  if(merged!==ABSENT)result.set(key,merged);
 }
 const order=[...new Set([...local,...remote,...base].map(item=>String(item).trim().toLocaleLowerCase('ja')))];
 return order.filter(key=>result.has(key)).map(key=>result.get(key));
}
function mergeKeyedArray(base,local,remote,path){
 if(![base,local,remote].every(Array.isArray))return CONFLICT;
 const id=item=>item?.id;
 const toMap=items=>new Map(items.map(item=>[id(item),item]));
 for(const items of [base,local,remote])
  if(items.some(item=>typeof id(item)!=='string'||!id(item))||toMap(items).size!==items.length)return CONFLICT;
 const b=toMap(base),l=toMap(local),r=toMap(remote),resolved=new Map();
 for(const key of new Set([...b.keys(),...l.keys(),...r.keys()])){
  // A single shopping item is atomic, but distinct IDs may be edited concurrently.
  const merged=mergeValue(b.has(key)?b.get(key):ABSENT,l.has(key)?l.get(key):ABSENT,r.has(key)?r.get(key):ABSENT,path+'.item');
  if(merged===CONFLICT)return CONFLICT;
  if(merged!==ABSENT)resolved.set(key,merged);
 }
 const order=[...new Set([...local,...remote,...base].map(id))];
 return order.filter(key=>resolved.has(key)).map(key=>resolved.get(key));
}
function mergeDraft(base,local,remote){
 if(![base,local,remote].every(Array.isArray))return CONFLICT;
 const length=mergeValue(base.length,local.length,remote.length,'draft-length');
 if(length===CONFLICT)return CONFLICT;
 const result=[];
 for(let i=0;i<length;i++){
  const prior=i<base.length?base[i]:ABSENT,lv=i<local.length?local[i]:ABSENT,rv=i<remote.length?remote[i]:ABSENT;
  // Treat each day as one unit: never splice together two competing menus
  // for the same day; edits to different days are safe to combine.
  const merged=mergeAtomic(prior,lv,rv);
  if(merged===CONFLICT||merged===ABSENT)return CONFLICT;
  result.push(merged);
 }
 return result;
}
function mergeAtomic(base,local,remote){
 if(equivalent(local,remote))return local;
 if(equivalent(local,base))return remote;
 if(equivalent(remote,base))return local;
 return CONFLICT;
}
function mergeValue(base,local,remote,path){
 const simple=mergeAtomic(base,local,remote);
 if(simple!==CONFLICT)return simple;
 if(path==='settings.shopping.selected')return mergeSelected(base,local,remote);
 if(path==='settings.shopping.manual')return mergeKeyedArray(base,local,remote,path);
 if(path==='settings.draft')return mergeDraft(base,local,remote);
 if(plain(local)&&plain(remote)&&(plain(base)||base===ABSENT)){
  const b=plain(base)?base:{},result={};
  for(const key of new Set([...Object.keys(b),...Object.keys(local),...Object.keys(remote)])){
   if(['__proto__','prototype','constructor'].includes(key))return CONFLICT;
   const next=mergeValue(Object.hasOwn(b,key)?b[key]:ABSENT,
    Object.hasOwn(local,key)?local[key]:ABSENT,Object.hasOwn(remote,key)?remote[key]:ABSENT,
    path+'.'+key);
   if(next===CONFLICT)return CONFLICT;
   if(next!==ABSENT)result[key]=structuredClone(next);
  }
  return result;
 }
 return CONFLICT;
}
/** Return null rather than ever choosing one side of a true overlapping edit. */
export function mergeDriveSnapshots(local,remote,base){
 if(!base||!local?.settings||!remote?.settings||!base?.settings)return null;
 const settings=mergeValue(base.settings,local.settings,remote.settings,'settings');
 if(settings===CONFLICT||settings===ABSENT)return null;
 const master=mergeValue(base.master||{},local.master||{},remote.master||{},'master');
 if(master===CONFLICT||master===ABSENT)return null;
 return {...remote,settings,master};
}
