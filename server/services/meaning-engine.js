// 意义层引擎 — 价值澄清 + 叙事身份 (🧭 意义层 · Philosophy / Narratology)
//
// 理论根基:
//  - Schwartz 基本价值理论: 人类价值可归为 ~10 类普世动机(成就/安全/自由/仁爱/健康...)。
//    帮用户澄清"什么对我重要"是意义感的核心来源。
//  - 叙事身份 (narrative identity, McAdams): 人通过把生活事件编织成"有弧光的故事"
//    来理解自己。锚定 Campbell 英雄之旅结构(平凡世界→召唤→试炼→蜕变→回归)，
//    让人生叙事有方向而非随机片段。
//  - 价值对齐: 当行为/目标与核心价值一致时, 动机与幸福感显著提升。
//
// 设计: 纯函数 + 失败安全; 仅标注与温和引导, 不与 autonomy 原则冲突。

// Schwartz 价值类型(中文语境精简版), 每类给触发词 + 解释
const VALUE_TYPES = [
  { key: 'achievement', name: '成就感', kw: ['成功', '目标', '完成', '赢', '进步', '突破', '升职'], desc: '通过个人能力达成有价值的事' },
  { key: 'security', name: '安全稳定', kw: ['稳定', '安全感', '存款', '保险', '踏实', '不冒险', '规划'], desc: '保护自己和所爱之人的安全与稳定' },
  { key: 'family', name: '家庭责任', kw: ['父母', '孩子', '家人', '回家', '陪', '照顾', '亲情'], desc: '对家人的责任与亲密' },
  { key: 'freedom', name: '自由独立', kw: ['自由', '自己决定', '不被管', '独立', '选择', '按自己'], desc: '自主行动与思想的空间' },
  { key: 'benevolence', name: '仁爱助人', kw: ['帮人', '朋友', '助人', '奉献', '善良', '他人'], desc: '守护身边人的福祉' },
  { key: 'health', name: '身心健康', kw: ['健康', '运动', '睡眠', '身体', '养生', '休息'], desc: '身体与心理的良好状态' },
  { key: 'growth', name: '学习成长', kw: ['学习', '成长', '读书', '技能', '提升', '认知'], desc: '持续拓宽认知与能力' },
  { key: 'love', name: '亲密关系', kw: ['恋人', '对象', '爱', '亲密', '陪伴', '感情'], desc: '深度的亲密与情感联结' },
  { key: 'peace', name: '内心平静', kw: ['平静', '安宁', '放松', '冥想', '不焦虑', '慢'], desc: '情绪与生活的和谐安宁' },
  { key: 'creativity', name: '创造表达', kw: ['创造', '写作', '画画', '表达', '艺术', '设计', '做东西'], desc: '通过创造物表达自我' },
];

// ===== 从用户话语中识别其(value)表达 =====
// 返回 { values:[{key,name,confidence}], dominant }
export function detectValues(text = '') {
  try {
    const msg = String(text);
    const hits = [];
    for (const v of VALUE_TYPES) {
      const matched = v.kw.filter(k => msg.includes(k));
      if (matched.length > 0) {
        hits.push({ key: v.key, name: v.name, confidence: Math.min(0.95, 0.5 + matched.length * 0.15), matched, desc: v.desc });
      }
    }
    hits.sort((a, b) => b.confidence - a.confidence);
    return { values: hits.slice(0, 3), dominant: hits[0] ? hits[0].key : null };
  } catch {
    return { values: [], dominant: null };
  }
}

// 价值清单(供前端"价值澄清"卡片)
export const VALUE_INVENTORY = VALUE_TYPES.map(v => ({ key: v.key, name: v.name, desc: v.desc }));

// ===== 叙事身份: 把人生阶段映射到英雄之旅 =====
// 基于用户状态(等级/连胜/最弱维度/近期活跃)推断当前"故事阶段"
// 返回 { stage, title, hint }
export function narrativeIdentityArc(user = {}, recentActive = false) {
  try {
    const level = user.level || 1;
    const streak = user.consecutive_sign_days || 0;
    const dims = ['health', 'finance', 'learning', 'career', 'social', 'mental', 'habits', 'creativity']
      .map(d => ({ d, v: user[`stat_${d}`] || 0 }));
    const weakest = dims.slice().sort((a, b) => a.v - b.v)[0];
    const strongest = dims.slice().sort((a, b) => b.v - a.v)[0];

    // 英雄之旅五幕
    let stage, title, hint;
    if (level < 3 && streak < 3) {
      stage = 'ordinary_world';
      title = '平凡世界';
      hint = '你还没真正踏上旅程。第一次主动打卡，就是"冒险的召唤"。';
    } else if (streak >= 3 && streak < 21) {
      stage = 'trials';
      title = '试炼之路';
      hint = `你已在路上(${streak}天连签)。试炼锻造你——尤其最弱的「${weakest.d}」(仅${weakest.v}分)正等待被征服。`;
    } else if (streak >= 21 && level < 20) {
      stage = 'ordeal';
      title = '深渊与蜕变';
      hint = '坚持已超过大多数人。此刻的瓶颈不是退路，而是蜕变前的深渊——跨过去你就不是从前的自己。';
    } else if (level >= 20) {
      stage = 'return';
      title = '携宝回归';
      hint = `你已是 Lv.${level} 的旅人，最强的「${strongest.d}」( ${strongest.v}分)是你带回的宝物。现在，把光分给还在平凡世界的人。`;
    } else {
      stage = 'call';
      title = '冒险的召唤';
      hint = '某个念头在召唤你改变。不必准备好，先迈出一步。';
    }
    return { stage, title, hint, weakest: weakest.d, weakestScore: weakest.v };
  } catch {
    return { stage: 'ordinary_world', title: '平凡世界', hint: '', weakest: null, weakestScore: 0 };
  }
}

// ===== 价值对齐检查: 当前行为/目标是否贴合核心价值 =====
// 在意识循环的反思中调用, 给出"意义层"洞察
export function buildMeaningContext(valuesDetected = [], narrative = {}) {
  try {
    const valueNames = valuesDetected.map(v => v.name);
    let ctx = '\n[意义层 · 叙事身份]\n';
    if (narrative.title) ctx += `- 当前人生阶段: ${narrative.title} — ${narrative.hint}\n`;
    if (valueNames.length > 0) ctx += `- 用户近期在意的价值: ${valueNames.join('、')}\n`;
    if (narrative.weakest) ctx += `- 叙事张力点(最弱维度): ${narrative.weakest}(${narrative.weakestScore}分)，可设计为"待征服的试炼"\n`;
    ctx += '- 引导原则: 把建议包装成"朝用户看重价值迈进一步"，而非机械任务\n';
    return ctx;
  } catch {
    return '';
  }
}

// 给用户的价值澄清提问(温和, 不越界)
export function valueClarificationPrompt() {
  return '如果今天可以多投入一件事，你最希望它关乎什么？——成就、家人、健康、自由、还是平静？不用想"应该"，只凭感觉。';
}
