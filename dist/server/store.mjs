export const emptyState=()=>({version:2,habits:[],logs:{}});
export class Store{
  constructor(db){if(!db)throw Error('STORAGE');this.db=db}
  async account(id){await this.db.prepare('INSERT OR IGNORE INTO telegram_accounts (id,state) VALUES (?,?)').bind(id,JSON.stringify(emptyState())).run();return this.get(id)}
  async get(id){return this.db.prepare('SELECT * FROM telegram_accounts WHERE id=?').bind(id).first()}
  async save(id,state,revision,operation=crypto.randomUUID()){
    const json=JSON.stringify(state),receipt=`${id}:${operation}`;
    const results=await this.db.batch([
      this.db.prepare('UPDATE telegram_accounts SET state=?, revision=revision+1, last_operation=? WHERE id=? AND revision=? AND NOT EXISTS (SELECT 1 FROM telegram_receipts WHERE id=?)').bind(json,operation,id,revision,receipt),
      this.db.prepare('INSERT OR IGNORE INTO telegram_receipts (id,created) SELECT ?,? FROM telegram_accounts WHERE id=? AND last_operation=?').bind(receipt,Date.now(),id,operation)
    ]);
    return results[0].meta.changes===1;
  }
  async seen(id,operation){return !!await this.db.prepare('SELECT id FROM telegram_receipts WHERE id=?').bind(`${id}:${operation}`).first()}
  async settings(id,settings){await this.db.prepare('UPDATE telegram_accounts SET timezone=?,reminder_time=?,reminder_days=?,enabled=?,next_at=? WHERE id=?').bind(settings.timezone,settings.time,JSON.stringify(settings.days),settings.enabled?1:0,settings.nextAt,id).run()}
  async chat(id,chatId){await this.db.prepare('UPDATE telegram_accounts SET chat_id=? WHERE id=?').bind(chatId,id).run()}
}
