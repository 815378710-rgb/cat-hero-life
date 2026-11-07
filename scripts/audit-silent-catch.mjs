#!/usr/bin/env node
/**
 * 静默错误审计
 *
 * 背景：本项目中大量 `try { ... } catch {}` 会吞掉异常。
 * 2026-11-04 发现 expense_logs / decision_bias / ai_memory.updated_at
 * 三处「表或列不存在」错误被空 catch 隐藏了数百天，直到做 schema 比对才暴露。
 *
 * 用法：
 *   node scripts/audit-silent-catch.mjs            # 输出清单
 *   node scripts/audit-silent-catch.mjs --strict   # 存在空 catch 时以非 0 退出（可用于部署前卡口）
 *
 * 本脚本只报告，不自动改写源码——自动替换容易破坏语法。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['server'];
const strict = process.argv.includes('--strict');

const files = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'tests') continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p);
    else if (entry.name.endsWith('.js')) files.push(p);
  }
}
for (const d of SCAN_DIRS) walk(path.join(ROOT, d));

// 只匹配 catch 块内完全没有语句的形式；有降级赋值（如 emotions = []）单独列为「降级无日志」
const EMPTY = /catch\s*(?:\(\s*[A-Za-z_$][\w$]*\s*\))?\s*\{\s*\}/g;
const findings = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  for (let m; (m = EMPTY.exec(src)); ) {
    const line = src.slice(0, m.index).split('\n').length;
    findings.push({
      file: path.relative(ROOT, file).replace(/\\/g, '/'),
      line,
      context: (lines[line - 1] || '').trim().slice(0, 110),
    });
  }
}

const byFile = new Map();
for (const f of findings) {
  if (!byFile.has(f.file)) byFile.set(f.file, []);
  byFile.get(f.file).push(f);
}

console.log(`静默 catch 审计：扫描 ${files.length} 个文件，发现 ${findings.length} 处空 catch\n`);
const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
for (const [file, list] of sorted) {
  console.log(`  ${file}  (${list.length})`);
  for (const f of list.slice(0, 4)) {
    console.log(`    L${f.line}: ${f.context}`);
  }
  if (list.length > 4) console.log(`    … 另有 ${list.length - 4} 处`);
}
console.log('\n建议：数据写入、统计聚合、外部调用路径的空 catch 至少记录 error.message；');
console.log('      纯可选降级（如特性探测）可保留空 catch，但应写明原因注释。');

if (strict && findings.length > 0) process.exit(1);
