/* English assets are generated from the Russian source plus a reviewed catalog.
   Only source text is translated; saved names, units and history are never rewritten. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'locales/en.json'),'utf8'));
const files=['index.html','app.js','analytics-ui.js','telegram.js','reminders.js','focus-timer.js','settings.js','core.js'];
function translate(source){return source.replace(/[А-Яа-яЁё][А-Яа-яЁё\s.,:;!?«»—–…()/%+0-9-]*/g,run=>{
  const key=run.trim();if(!Object.hasOwn(catalog,key))throw Error('Missing English translation: '+key);
  return catalog[key]+run.slice(key.length);
});}
for(const file of files){
 let source=translate(fs.readFileSync(path.join(root,'dist',file),'utf8')).replaceAll("toLocaleDateString('ru'","toLocaleDateString('en-GB'");
 if(file==='index.html'){
   source=source.replace('lang="ru"','lang="en"').replace('Language / Language','Language');
   for(const script of files.filter(f=>f.endsWith('.js')))source=source.replace(`src="${script}"`,`src="${script.replace('.js','.en.js')}"`);
   source=source.replace('href="manifest.webmanifest"','href="manifest.en.webmanifest"');
 }
 fs.writeFileSync(path.join(root,'dist',file==='index.html'?'en.html':file.replace('.js','.en.js')),source);
}
module.exports={translate};

const manifest=JSON.parse(fs.readFileSync(path.join(root,'dist/manifest.webmanifest'),'utf8'));
fs.writeFileSync(path.join(root,'dist/manifest.en.webmanifest'),JSON.stringify({...manifest,name:'Day Protocol — habit tracker',description:'Your habits, progress and reminders in one place.',lang:'en',start_url:'/en.html?lang=en'},null,2)+'\n');
