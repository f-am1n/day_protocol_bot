// Local-only credential entry. Never serves or logs the token.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const nonce=crypto.randomBytes(24).toString('hex');
const target=path.join(__dirname,'../.sites-runtime/telegram-secret.json');
http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Frame-Options','DENY');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
  if(req.headers.host!=='127.0.0.1:4175'){res.writeHead(403);return res.end()}
  if(req.method==='POST'&&req.url==='/save'){
    if(req.headers.origin!=='http://127.0.0.1:4175'){res.writeHead(403);return res.end()}
    let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4096){res.writeHead(413);return res.end()}}
    const form=new URLSearchParams(raw),token=form.get('token')?.trim();
    if(form.get('nonce')!==nonce||!/^\d{5,20}:[A-Za-z0-9_-]{20,150}$/.test(token||'')){res.writeHead(400);return res.end('Invalid token. Return and try again.')}
    fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify({token}),{mode:0o600});
    res.setHeader('Content-Type','text/html; charset=utf-8');return res.end('<meta charset="utf-8"><h1>Токен сохранён локально</h1><p>Вернитесь в чат и напишите «готово». После подключения локальная копия токена будет удалена.</p>');
  }
  if(req.method!=='GET'||req.url!=='/'){res.writeHead(404);return res.end()}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Подключение бота Day Protocol</title><style>body{font:17px system-ui;background:#f3f6fc;color:#172b4d;max-width:520px;margin:9vh auto;padding:28px}form{background:white;border-radius:20px;padding:28px}input,button{box-sizing:border-box;width:100%;padding:14px;margin-top:15px;font:inherit;border:1px solid #ccd6e8;border-radius:10px}button{background:#245eea;color:white}p{line-height:1.6}</style><form method="post" action="/save"><h1>Подключить Telegram</h1><p>Вставьте токен <b>@day_protocol_bot</b> из BotFather. Он сохранится только в локальном служебном файле, затем будет перенесён в защищённые настройки сервера.</p><input type="hidden" name="nonce" value="${nonce}"><label>Токен бота<input name="token" type="password" required autocomplete="off" spellcheck="false"></label><button>Сохранить токен</button></form></html>`);
}).listen(4175,'127.0.0.1',()=>console.log('Credential form: http://127.0.0.1:4175'));
