import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuid } from 'uuid';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', 'data');
const DB_PATH = join(DATA_DIR, 'cat-hero.db');

let db = null;

// ===== Database Initialization =====

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

export async function getDbAsync() {
  // Kept for backward compatibility — better-sqlite3 is sync, but old code may await this
  if (db) return db;
  return initDbSync();
}

function initDbSync() {
  if (db) return db;
  
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  
  db = new Database(DB_PATH);
  
  // Enable WAL mode for better concurrency and crash safety
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');  // Good balance of safety vs performance
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');   // Wait up to 5s if DB is locked
  
  return db;
}

// ===== Save functions — kept as no-ops for backward compatibility =====
// better-sqlite3 writes directly to disk; no manual save needed

export function saveDb() {
  // better-sqlite3 persists to disk on every write — manual save is unnecessary
  // Kept for backward compatibility with existing code that calls saveDb()
}

export function saveDbImmediate() {
  // better-sqlite3 persists to disk on every write — manual save is unnecessary
  // Kept for backward compatibility with existing code that calls saveDbImmediate()
}

// ===== Wrapper — thin pass-through since better-sqlite3 API matches =====

export function createDbWrapper(rawDb) {
  // better-sqlite3 already has .prepare().run()/.get()/.all() — no wrapping needed
  // Returning the raw db instance. All existing code using prepare/run/get/all works.
  // Add a convenience .exec() alias if not already present.
  if (!rawDb.exec) {
    rawDb.exec = function(sql) {
      // better-sqlite3 .exec() does exist, but some code might pass params
      return this.prepare(sql).run();
    };
  }
  return rawDb;
}

// ===== Schema Loading =====

function loadSchemas(db) {
  const schemaFiles = [
    'schema.sql', 'schema-ext.sql', 'schema-final.sql',
    'schema-deep.sql', 'schema-index.sql', 'schema-wechat.sql', 'schema-neural.sql', 'schema-prompts.sql',
    'schema-lottery.sql'
  ];
  
  for (const sqlFile of schemaFiles) {
    const schemaPath = join(__dirname, sqlFile);
    if (!existsSync(schemaPath)) continue;
    
    const schema = readFileSync(schemaPath, 'utf-8');
    // Split by semicolons, filter comments and empty
    const statements = schema
      .split('\n')
      .filter(l => !l.trim().startsWith('--'))
      .join('\n')
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 5);
    
    for (const stmt of statements) {
      try {
        db.exec(stmt + ';');
      } catch (e) {
        // Ignore "already exists" type errors from repeated init
        if (!e.message.includes('already exists') &&
            !e.message.includes('UNIQUE') &&
            !e.message.includes('duplicate')) {
          console.error(`Schema ${sqlFile} error:`, e.message.slice(0, 80));
        }
      }
    }
  }
}

function createDefaultUser(db) {
  try {
    const user = db.prepare('SELECT id FROM users LIMIT 1').get();
    if (!user) {
      const userId = uuid();
      db.prepare("INSERT INTO users (id, username, personality_type) VALUES (?, '主人', 'encouraging')").run(userId);
      console.log(`Created default user: ${userId}`);
    }
    // 迁移：确保 password_hash 列存在
    try {
      db.prepare("SELECT password_hash FROM users LIMIT 0").get();
    } catch {
      db.exec("ALTER TABLE users ADD COLUMN password_hash TEXT");
      console.log('Migration: added password_hash column');
    }
  } catch (e) {
    console.error('User creation error:', e.message);
  }
}

// ===== Main Init =====

export async function initDb() {
  const db = initDbSync();
  loadSchemas(db);
  createDefaultUser(db);
  
  // Run version check
  try {
    checkDbVersion(db);
  } catch (e) {
    console.error('DB version check failed:', e.message);
  }
  
  console.log('Database initialized (better-sqlite3, WAL mode, direct disk persistence)');
}

// ===== Database Version Management =====

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
  } catch (e) {
    console.error('Version check failed:', e.message);
  }
}

function migrateDb(db, from, to) {
  console.log(`DB migration: v${from} → v${to}`);
  if (from < 2) {
    // schema-neural.sql is auto-loaded in initDb
  }
}

// Run if called directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await initDb();
  process.exit(0);
}
