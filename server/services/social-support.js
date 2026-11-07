// 社会层引擎 — 社会支持理论 + 文化真实性 (🌍 社会层 · Sociology / Social Psychology / Anthropology)
//
// 理论根基:
//  - 社会支持理论 (Cohen & Wills, 1985): 社会支持分三类, 各自缓冲不同压力 —
//     情感支持(emotional: 共情/倾听) / 工具支持(instrumental: 实际帮忙) / 信息支持(informational: 建议/信息)。
//     支持网络的质量(类型覆盖)比"朋友数量"更能预测幸福感; 缺口类型值得被提示。
//  - 文化真实性 (人类学): 系统服务于中国(西安)用户, 主流生活管理框架多为西方个人主义。
//     需在"自主成长"与"家庭/关系/面子/孝道"的集体主义语境间取得真实平衡, 不机械套用外来模板。
//
// 设计: 纯函数 + 失败安全; 仅标注与温和引导, 不与 autonomy/文化尊重冲突。

// 关系类型 → 默认支持类型映射
const RELATIONSHIP_SUPPORT = {
  family: ['emotional', 'instrumental'],
  parent: ['emotional', 'instrumental'],
  partner: ['emotional', 'intimate'],
  friend: ['emotional', 'informational'],
  colleague: ['informational', 'instrumental'],
  mentor: ['informational', 'emotional'],
  other: ['emotional'],
};

export function classifySupportType(relationship = 'other') {
  return RELATIONSHIP_SUPPORT[relationship] || RELATIONSHIP_SUPPORT.other;
}

// 评估用户的社会支持网络充足度(类型覆盖)
export function assessSupportNetwork(people = []) {
  try {
    const types = { emotional: 0, instrumental: 0, informational: 0, intimate: 0 };
    for (const p of people) {
      for (const k of classifySupportType(p.relationship)) types[k] = (types[k] || 0) + 1;
    }
    const gaps = [];
    if (types.emotional < 1) gaps.push('emotional');
    if (types.instrumental < 1) gaps.push('instrumental');
    if (types.informational < 1) gaps.push('informational');
    const adequacy = Math.min(1, (types.emotional + types.instrumental + types.informational) / 6);
    return {
      types,
      gaps,
      adequacy: Math.round(adequacy * 100) / 100,
      hasGap: gaps.length > 0,
      gapTypes: gaps,
    };
  } catch {
    return { types: {}, gaps: [], adequacy: 0, hasGap: false, gapTypes: [] };
  }
}

// 文化真实性: 检测文本是否触及中国文化语境(家庭/面子/关系/集体/谦虚)
// 触及则说明建议需谨慎兼顾本土语境, 避免生硬的个人主义话术
const CULTURAL_MARKERS = {
  family: { kw: ['父母', '家人', '孩子', '孝', '家庭', '回家'], note: '中国语境下家庭责任常为强约束，建议需兼顾家人而非只谈个人目标' },
  face: { kw: ['面子', '丢人', '别人怎么看', '评价', '比较'], note: '"面子"与"他人评价"在中国社会是真实成本，建议勿轻描淡写' },
  guanxi: { kw: ['关系', '人脉', '托人', '找人', '走动'], note: '关系是中国社会重要资源，建议中可肯定其价值而非回避' },
  collectivist: { kw: ['集体', '团队', '大家', '我们'], note: '集体主义语境下个人选择常牵动群体，建议考虑连带影响' },
  modesty: { kw: ['炫耀', '显摆', '出头'], note: '谦虚在中国文化更被接纳，建议避免鼓励高调张扬' },
};

export function assessCulturalFit(text = '') {
  try {
    const hits = [];
    for (const [k, v] of Object.entries(CULTURAL_MARKERS)) {
      if (v.kw.some(w => text.includes(w))) hits.push({ key: k, note: v.note });
    }
    return { needsCulturalCare: hits.length > 0, markers: hits };
  } catch {
    return { needsCulturalCare: false, markers: [] };
  }
}

// 给针对中国用户的生活建议做文化真实性提示(只返回 notes, 具体润色交给 LLM 以免生硬)
export function culturalizeAdvice(advice = '', userContext = {}) {
  try {
    const fit = assessCulturalFit(advice + ' ' + (userContext.recentText || ''));
    if (!fit.needsCulturalCare) return { advice, changed: false, notes: [] };
    return { advice, changed: false, notes: fit.markers.map(m => m.note) };
  } catch {
    return { advice, changed: false, notes: [] };
  }
}

// 中文支持类型名(供前端展示)
export const SUPPORT_TYPE_LABELS = {
  emotional: '情感支持',
  instrumental: '工具支持',
  informational: '信息支持',
  intimate: '亲密支持',
};
