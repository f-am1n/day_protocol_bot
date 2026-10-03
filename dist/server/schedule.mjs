const formatters=new Map();
export function localDate(timezone,now=Date.now()){
  let formatter=formatters.get(timezone);if(!formatter){formatter=new Intl.DateTimeFormat('en-GB',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});formatters.set(timezone,formatter)}
  const values=Object.fromEntries(formatter.formatToParts(now).map(p=>[p.type,p.value]));
  return {date:`${values.year}-${values.month}-${values.day}`,time:`${values.hour}:${values.minute}`};
}
export function validateSettings(s){
  if(!s||typeof s.enabled!=='boolean'||!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)||!Array.isArray(s.days)||!s.days.length||s.days.length>7||!s.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6))throw Error('SETTINGS');
  try{new Intl.DateTimeFormat('en',{timeZone:s.timezone}).format()}catch{throw Error('SETTINGS')}
  if(typeof s.timezone!=='string'||s.timezone.length>80)throw Error('SETTINGS');return s;
}
export function nextReminder(s,now=Date.now()){
  if(!s.enabled)return null;
  // Minute iteration respects local DST gaps and overlaps without guessing offsets.
  let t=Math.floor(now/60000)*60000+60000;
  for(let i=0;i<8*1440;i++,t+=60000){const p=localDate(s.timezone,t);if(p.time===s.time&&s.days.includes((new Date(p.date+'T12:00:00Z').getUTCDay()+6)%7))return t}
  throw Error('SETTINGS');
}
