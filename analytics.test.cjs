const test=require('node:test'),assert=require('node:assert/strict');
const R=require('./dist/core.js'),A=require('./dist/analytics.js');
const make=(overrides={})=>R.migrate({version:2,habits:[{id:'habit',name:'Чтение',icon:'📖',period:'evening',created:'2026-08-01',archivedAt:null,type:'check',target:1,unit:'раз',step:1,schedule:'days',days:[0,1,2,3,4,5,6],frequency:3,...overrides}],logs:{}});
test('weekly comparisons exclude current partial week and future months days',()=>{
 const s=make();s.logs['2026-09-28']={habit:1};const a=A.report(s,'2026-10','','2026-10-02');
 assert.equal(a.to,'2026-09-27');assert.equal(a.current.complete,0);assert.equal(a.current.target,7);assert.equal(a.rows[0].target,28);
 const historical=A.report(s,'2026-08','','2026-10-02');assert.equal(historical.to,'2026-08-30');
});
test('weekly goals count frequency, cap extra completions, respect pause and history',()=>{
 const s=make({schedule:'weekly',frequency:2});
 for(let d='2026-09-21';d<='2026-09-27';d=R.shift(d,1))s.logs[d]={habit:1};
 const a=A.report(s,'2026-10','','2026-10-02');assert.equal(a.current.target,2);assert.equal(a.current.complete,2);assert.equal(a.current.percent,100);
 s.habits[0].pauses=[{from:'2026-09-01',to:'2026-09-21'}];assert.equal(A.report(s,'2026-10','','2026-10-02').rows[0].target,3);
});
test('no plan is not a zero percent result and cannot generate negative advice',()=>{
 const s=make({created:'2026-10-01'}),a=A.report(s,'2026-10','','2026-10-02');
 assert.equal(a.delta,null);assert.equal(a.rows.length,0);assert.equal(a.weak,null);assert.equal(a.strong,null);
});
test('habit filter and archived history remain scoped; changed targets use old revision',()=>{
 const s=make();for(let d='2026-09-21';d<='2026-09-27';d=R.shift(d,1))s.logs[d]={habit:1};
 R.revise(s.habits[0],{...s.habits[0],type:'count',target:10},'2026-09-27');
 R.archive(s.habits[0],'2026-09-29');
 const a=A.report(s,'2026-10','habit','2026-10-02');assert.equal(a.current.percent,100);assert.equal(a.rows[0].archived,true);
 assert.equal(A.report(s,'2026-10','missing','2026-10-02').rows.length,0);
});
