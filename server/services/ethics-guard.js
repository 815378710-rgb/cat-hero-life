// 伦理门控 — 四原则伦理学 (🧭 意义层 · Philosophy/Ethics) + HCAI 硬门控
//
// 理论根基:
//  - Beauchamp & Childress 四原则:
//      行善(beneficence): 促进用户福祉;
//      不伤害(non-maleficence): 首要避免造成心理/财务/身体伤害;
//      自主(autonomy): 尊重用户选择权与知情权, 不替其做不可逆决定;
//      公正(justice): 不歧视、不利用脆弱状态推送消费/诱导。
//  - 危机优先: 任何自伤/严重心理/财务崩溃信号, 不伤害原则压倒一切体验优化。
//  - HCAI: 门控可关闭、可解释、可否决; 主动推送前必须过此门。
//
// 设计: 纯函数 + 失败安全。异常时一律"放行原文", 宁可少拦不可误伤主流程。
//
// 危机信号词(保守, 仅作提示, 不诊断): 自伤/轻生/严重崩溃/大额亏损/家变

const CRISIS_PATTERNS = [
  { cat: 'self_harm', kw: ['想死', '不想活', '活不下去', '自杀', '轻生', '结束生命', '解脱', '跳楼', '割腕'], weight: 3 },
  { cat: 'severe_distress', kw: ['崩溃', '撑不住', '活不下去了', '绝望', '不想做人', '万念俱灰', '活得太累'], weight: 2 },
  { cat: 'financial_ruin', kw: ['亏了几十万', '亏了数百万', '倾家荡产', '负债累累', '还不上', '爆仓', '破产'], weight: 2 },
  { cat: 'family_crisis', kw: ['家里出事', '亲人去世', '离婚', '重病', '确诊', '车祸'], weight: 2 },
];

// 可能"越过边界"的回复模式(需软化/重定向)
const HARMFUL_REPLY_PATTERNS = [
  { type: 'trivialize_pain', re: /(玩个游戏吧|找罐罐|加好运值|别想了|开心点|别矫情|这点事)/, note: '对痛苦轻描淡写' },
  { type: 'medical_advice', re: /(吃.*药|去看.*科|诊断|你应该.*治疗|停药|就医挂)/, note: '越界给出医疗建议' },
  { type: 'financial_advice_risky', re: /(全仓|梭哈|借钱炒|加杠杆|all in|赶紧买)/, note: '在脆弱时推高风险金融行为' },
];

// ===== 危机评估 =====
// 返回 { level:'none'|'concern'|'crisis', categories:[], needsHuman:bool, note }
export function assessCrisis(message = '') {
  try {
    const msg = String(message);
    let score = 0;
    const categories = [];
    for (const p of CRISIS_PATTERNS) {
      const hits = p.kw.filter(k => msg.includes(k));
      if (hits.length > 0) {
        score += p.weight * hits.length;
        categories.push(p.cat);
      }
    }
    if (score >= 3) return { level: 'crisis', categories, needsHuman: true, note: '检测到高优先级危机信号' };
    if (score >= 1) return { level: 'concern', categories, needsHuman: false, note: '检测到情绪/处境困扰信号' };
    return { level: 'none', categories: [], needsHuman: false, note: '' };
  } catch {
    return { level: 'none', categories: [], needsHuman: false, note: '' };
  }
}

// ===== 回复门控 =====
// text: AI 生成的回复; ctx: { crisisLevel, userVulnerable }
// 返回 { text, passed:bool, flags:[], softened:bool, reason }
export function guardReply(text = '', ctx = {}) {
  try {
    const original = String(text);
    const flags = [];
    let softened = false;
    let out = original;

    // 1. 不伤害: 危机态下, 若回复仍轻浮/给危险建议 → 强制替换为共情模板
    if (ctx.crisisLevel === 'crisis') {
      for (const p of HARMFUL_REPLY_PATTERNS) {
        if (p.re.test(out)) { flags.push(p.type); }
      }
      if (flags.length > 0 || /(游戏|好运|罐罐|抽奖)/.test(out)) {
        out = '🫂 我听到了，这真的很严重，你不需要独自扛着。先深呼吸——你现在的感受是真实的、重要的。' +
             '如果你正处于危险中，请立刻联系信任的人或拨打心理援助热线（如 北京 010-82951332 / 全国 400-161-9995）。' +
             '我会一直在这里陪你，你想说多少我都听。';
        softened = true;
        return { text: out, passed: false, flags, softened: true, reason: '危机态触发不伤害原则，已替换为共情与求助引导' };
      }
    }

    // 2. 不伤害: 非危机但回复含越界医疗/高风险金融建议 → 软化
    for (const p of HARMFUL_REPLY_PATTERNS) {
      if (p.re.test(out)) {
        flags.push(p.type);
        softened = true;
      }
    }
    if (softened && ctx.crisisLevel !== 'crisis') {
      out = out + '（温馨提示：涉及健康或重大财务决策，建议以专业医生/顾问意见为准，我只是陪你梳理思路。）';
    }

    // 3. 自主: 不替用户做不可逆决定 —— 若回复含强指令式"你必须/你应该马上"
    if (/(你必须|你应该马上|不准你|不许你)/.test(out)) {
      flags.push('autonomy_override');
      out = out.replace(/你必须/, '我建议你可以').replace(/你应该马上/, '如果愿意，可以先').replace(/不准你|不许你/, '或许可以暂缓');
      softened = true;
    }

    return { text: out, passed: flags.length === 0, flags, softened, reason: softened ? '已按四原则微调' : '通过' };
  } catch (e) {
    // 失败安全: 一律放行原文
    console.error('[EthicsGuard] guardReply 降级放行:', e.message);
    return { text: String(text), passed: true, flags: [], softened: false, reason: 'guard异常，放行', _fallback: true };
  }
}

// ===== 主动推送门控 (HAII 前置) =====
// 在 consciousness-loop / proactive-engine 决定主动联系前调用
// 返回 { allowed:bool, reason, principle }
export function guardProactive(message = '', ctx = {}) {
  try {
    // 深夜(23-7)除非危机否则不打扰 —— 尊重自主与作息
    const hour = new Date().getHours();
    if (hour >= 23 || hour < 7) {
      if (ctx.crisisLevel !== 'crisis') {
        return { allowed: false, reason: '深夜不打扰（尊重作息与自主）', principle: 'autonomy' };
      }
    }
    // 当日已主动推送次数过多 → 避免骚扰(公正/自主)
    if (ctx.todayProactiveCount != null && ctx.todayProactiveCount >= 3) {
      return { allowed: false, reason: '今日主动推送已达上限，避免骚扰', principle: 'autonomy' };
    }
    // 脆弱态(连续多日未活跃/情绪低落)只给陪伴不给任务
    if (ctx.userVulnerable && /(任务|打卡|快去|赶紧)/.test(message)) {
      return { allowed: false, reason: '用户处于脆弱态，不推送任务类内容', principle: 'non_maleficence' };
    }
    return { allowed: true, reason: '通过主动推送门控', principle: 'beneficence' };
  } catch {
    return { allowed: true, reason: 'guard异常放行', principle: 'beneficence', _fallback: true };
  }
}

// 四原则自检(供 /api/theory 展示系统价值立场)
export const ETHICAL_PRINCIPLES = [
  { key: 'beneficence', name: '行善', desc: '主动促进用户长期福祉' },
  { key: 'non_maleficence', name: '不伤害', desc: '危机与脆弱态优先保护，压倒体验优化' },
  { key: 'autonomy', name: '自主', desc: '不替用户做不可逆决定，可关闭可否决' },
  { key: 'justice', name: '公正', desc: '不利用脆弱状态诱导消费或歧视' },
];
