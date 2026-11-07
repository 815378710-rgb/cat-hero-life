// 人格加载器 —— 所有 AI 输出的单一真相源
// 配置见 server/persona/，用环境变量 CAT_HERO_PERSONA 切换。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PERSONA_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../persona');
let cache = null;

export function getPersona() {
  if (cache) return cache;
  let meta;
  try {
    meta = JSON.parse(fs.readFileSync(path.join(PERSONA_DIR, 'meta.json'), 'utf8'));
  } catch (e) {
    console.error('[persona] meta.json 读取失败，回退内置最小人格:', e.message);
    meta = {
      default: 'cat-hero',
      personas: {
        'cat-hero': {
          name: '猫猫侠', emoji: '🐱', tagline: '',
          styleHint: '口语、简短、不写客服套话、不编造数据之外的经历。',
          templates: {},
        },
      },
    };
  }

  const requested = process.env.CAT_HERO_PERSONA || meta.default;
  const id = meta.personas[requested] ? requested : meta.default;
  const conf = meta.personas[id] || Object.values(meta.personas)[0];

  let prompt = '';
  try {
    prompt = fs.readFileSync(path.join(PERSONA_DIR, `${id}.md`), 'utf8').trim();
  } catch (e) {
    console.error(`[persona] ${id}.md 读取失败:`, e.message);
    prompt = `你是${conf.name}，${conf.tagline || '陪用户过日子的伙伴'}。口语、简短，不编造数据之外的经历。`;
  }

  cache = { id, ...conf, prompt, templates: conf.templates || {} };
  console.log(`[persona] 已加载: ${cache.name} (${id})`);
  return cache;
}

// 模板文案渲染：{name} / {streak} / {taskLine} / {completed} / {total} / {dim}
export function personaTpl(key, vars = {}) {
  const p = getPersona();
  const raw = p.templates[key];
  if (!raw) return '';
  return String(raw).replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
}

// 给辅助型 LLM 调用（任务规划 / 主动联系 / 复盘）用的风格前缀
export function personaStyleHint() {
  const p = getPersona();
  return `你是${p.name}，${p.tagline}。${p.styleHint}`;
}
