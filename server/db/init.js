import initSqlJs from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuid } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH = join(DATA_DIR, 'cat-hero.db');

let db = null;

export async function getDbAsync() {
  if (db) return db;
  const SQL = await initSqlJs();
  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    db = new SQL.Database();
  }
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call getDbAsync() first.');
  return db;
}

let saveTimer = null;
let dirty = false;

export function saveDb() {
  dirty = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!dirty || !db) return;
    dirty = false;
    const data = db.export();
    const buffer = Buffer.from(data);
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DB_PATH, buffer);
  }, 1000);
}

export function saveDbImmediate() {
  if (!db) return;
  dirty = false;
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  const data = db.export();
  const buffer = Buffer.from(data);
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(DB_PATH, buffer);
}

export function createDbWrapper(db) {
  return {
    prepare(sql) {
      return {
        run(...params) {
          db.run(sql, params);
          saveDb();
        },
        get(...params) {
          const stmt = db.prepare(sql);
          stmt.bind(params);
          if (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            stmt.free();
            const row = {};
            cols.forEach((c, i) => row[c] = vals[i]);
            return row;
          }
          stmt.free();
          return undefined;
        },
        all(...params) {
          const results = [];
          const stmt = db.prepare(sql);
          stmt.bind(params);
          while (stmt.step()) {
            const cols = stmt.getColumnNames();
            const vals = stmt.get();
            const row = {};
            cols.forEach((c, i) => row[c] = vals[i]);
            results.push(row);
          }
          stmt.free();
          return results;
        }
      };
    },
    exec(sql) {
      db.run(sql);
      saveDb();
    }
  };
}

export async function initDb() {
  const rawDb = await getDbAsync();
  const db = createDbWrapper(rawDb);
  
  // Execute schemas
  for (const sqlFile of ['schema.sql', 'schema-ext.sql', 'schema-final.sql', 'schema-deep.sql', 'schema-index.sql', 'schema-wechat.sql', 'schema-neural.sql']) {
    const schemaPath = join(__dirname, sqlFile);
    if (existsSync(schemaPath)) {
      const schema = readFileSync(schemaPath, 'utf-8');
      const cleaned = schema.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
      const statements = cleaned.split(/;\s*\n/).map(s => s.trim()).filter(s => s.length > 5);
      
      for (const stmt of statements) {
        try {
          rawDb.run(stmt + ';');
        } catch (e) {
          if (!e.message.includes('already exists') && !e.message.includes('UNIQUE') && !e.message.includes('duplicate')) {
            console.error(`Schema ${sqlFile} stmt error:`, e.message.slice(0, 80));
          }
        }
      }
      saveDb();
    }
  }
  
  // Create default user if none exists
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (!user) {
      const userId = uuid();
      db.prepare("INSERT INTO users (id, username, personality_type) VALUES (?, '主人', 'encouraging')").run(userId);
      console.log(`✅ Created default user: ${userId}`);
    }
  } catch (e) {
    console.error('User creation error:', e.message);
  }
  
  console.log('✅ Database initialized');
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await initDb();
  process.exit(0);
}

// 数据库版本管理
const DB_VERSION = 2;
export function checkDbVersion(db) {
  try {
    db.prepare('CREATE TABLE IF NOT EXISTS db_version (version INTEGER)').run();
    const row = db.prepare('SELECT version FROM db_version LIMIT 1').get();
    if (!row) {
      db.prepare('INSERT INTO db_version VALUES (?)').run(DB_VERSION);
    } else if (row.version < DB_VERSION) {
      migrateDb(db, row.version, DB_VERSION);
      db.prepare('UPDATE db_version SET version = ?').run(DB_VERSION);
    }
  } catch (e) { console.error('版本检查失败:', e.message); }
}

function migrateDb(db, from, to) {
  console.log(`📦 数据库迁移: v${from} → v${to}`);
  // v1 → v2: 添加神经系统表
  if (from < 2) {
    // schema-neural.sql会在initDb中自动执行
  }
}
