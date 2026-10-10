/* Analytics use closed calendar weeks so an unfinished week is never a failure. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./core.js'));
  else root.DayProtocolAnalytics=factory(root.DayProtocol);
})(typeof globalThis!=='undefined'?globalThis:this,function(R){
  'use strict';
  function report(state, month, habitId='', today=R.today()){
    const next=R.parse(month+'-01');next.setMonth(next.getMonth()+1);
    const monthEnd=R.shift(R.key(next),-1), cutoff=monthEnd<today?monthEnd:R.shift(today,-1);
    const end=R.weekday(cutoff)===6?cutoff:R.shift(R.monday(cutoff),-1);
    const filtered={...state,habits:habitId?state.habits.filter(h=>h.id===habitId):state.habits};
    const weeks=Array.from({length:8},(_,i)=>{
      const to=R.shift(end,(i-7)*7),from=R.shift(to,-6);
      return {from,to,...R.weekStats(filtered,from,to)};
    });
    const current=weeks[7],previous=weeks[6];
    const rows=filtered.habits.map(h=>{
      let target=0,complete=0;
      for(const w of weeks.slice(-4)){
        const result=R.weekStats({...state,habits:[h]},w.from,w.to);
        target+=result.target;complete+=result.complete;
      }
      return {id:h.id,name:h.name,icon:h.icon,archived:!!h.archivedAt,target,complete,percent:target?Math.round(complete/target*100):null};
    }).filter(h=>h.target).sort((a,b)=>b.percent-a.percent||b.complete-a.complete||a.name.localeCompare(b.name,'ru'));
    const qualified=rows.filter(h=>h.target>=4),strong=qualified.find(h=>h.percent>=75)||null;
    const weak=[...qualified].reverse().find(h=>h.percent<50)||null;
    const total=rows.reduce((a,h)=>({target:a.target+h.target,complete:a.complete+h.complete}),{target:0,complete:0});
    return {weeks,current,previous,delta:current.target&&previous.target?current.percent-previous.percent:null,
      rows,strong,weak,total,from:weeks[4].from,to:end};
  }
  return {report};
});
