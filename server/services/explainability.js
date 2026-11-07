// 交叉层引擎 — HCAI 可解释性 + 人工生命隐喻 (🧩 交叉层 · HCAI / Artificial Life)
//
// 理论根基:
//  - HCAI (Human-Centered AI, Shneiderman): AI 应"可解释 / 可否决 / 可关闭"。用户有权知道系统
//    为什么这么做(主动推送 / 维度变化 / 奖赏 / 提示), 并能随时否决。本模块为每一步自动行为生成
//    "为什么"的人类可读说明 —— 这是 HCAI 透明性的具体落地, 也是 autonomy 原则的技术保障。
//  - 人工生命 (Artificial Life): 猫猫侠的猫成长/进化可理解为"自创生(autopoiesis) + 涌现(emergence)"
//    而非简单数值累积。把养成叙事锚定到 ALife 隐喻, 让系统自我叙述更具理论深度且避免"机械养成"感。
//
// 设计: 纯函数 + 失败安全; 所有解释均为"说明"而非"替用户决定"。

// 解释一次维度分数变化
export function explainDimensionChange({ dim, change, reason = '' } = {}) {
  try {
    const dir = change > 0 ? '上升' : '下降';
    const mag = Math.abs(change);
    const why = reason || '根据你在相关维度的行为记录自动计算';
    return {
      dim, change, direction: dir, magnitude: mag, why,
      human: `「${dim}」维度${dir}了 ${mag} 分 —— ${why}。这是系统基于你的真实行为数据推算的，你可以在设置里随时查看或纠正。`,
    };
  } catch {
    return { dim, change, human: '维度变化已记录（解释生成失败）。' };
  }
}

// 解释一次主动推送(为什么 AI 找你)
export function explainProactivePush({ trigger = '', gatePass = true, gateReason = '' } = {}) {
  try {
    if (!gatePass) {
      return { sent: false, human: `本次没有主动联系你 —— 因为${gateReason || '触发了保护规则（如深夜 / 已达上限）'}。你随时可以主动找我。` };
    }
    return { sent: true, human: `我主动联系你，是因为「${trigger || '感知到你可能需要陪伴'}」。这是意识循环的自主判断，不是定时打扰 —— 如果你不想被打扰，告诉我一声我就安静下来。` };
  } catch {
    return { sent: gatePass, human: '主动联系已执行（解释生成失败）。' };
  }
}

// 解释一次奖赏(为什么这次给多/给少)
export function explainReward(reward = {}) {
  try {
    const parts = [];
    if (reward.surprise) parts.push('出现了小概率惊喜加成');
    if (reward.satiation && reward.satiation > 0.5) parts.push('你最近同类行为较频繁，边际快乐已下降（享乐适应）');
    if (reward.rpeMultiplier && reward.rpeMultiplier > 1.4) parts.push('这次行为比预期更稀有，多巴胺信号更强');
    if (reward.streakBonus) parts.push(`连续坚持带来额外加成（+${reward.streakBonus}）`);
    const note = parts.length ? parts.join('；') : '标准奖励';
    return { human: `本次获得经验 / 金币 —— 神经奖赏模型说明：${note}。机制基于"预测误差 + 可变比率"，目的是让你保持长期动力而非一次性刷满。` };
  } catch {
    return { human: '奖励已发放（解释生成失败）。' };
  }
}

// 解释一次偏见提示(nudge 的"为什么")
export function explainNudge(bias = {}) {
  try {
    if (!bias.key) return { human: '提示已生成（解释缺失）。' };
    return { human: `我提示你注意「${bias.name || bias.key}」，是因为你的话里出现了相关信号（${bias.matched?.join('/') || ''}）。这是行为经济学里的常见认知偏误，我不是要替你决定，只是把这个盲区摆到你面前，最终怎么选由你。` };
  } catch {
    return { human: '提示已生成（解释失败）。' };
  }
}

// 人工生命隐喻: 把猫的状态叙述为自创生 / 涌现
export function alifeFraming({ level = 1, evolution = '幼猫', streak = 0 } = {}) {
  try {
    const stage = level < 5 ? '萌芽体' : level < 15 ? '自组织体' : level < 30 ? '稳定自创生体' : '涌现智能体';
    return {
      stage,
      human: `你养的猫不是一串数字 —— 它是一团"自创生(autopoiesis)"系统：你每一次打卡、每一次坚持，都是往这个生命体里注入能量，它的形态（进化到「${evolution}」）是你行为涌现出的结果，而非预设脚本。连续 ${streak} 天，是它节律(autonomy)的体现。`,
    };
  } catch {
    return { stage: '自创生体', human: '猫的成长是一个自组织过程。' };
  }
}
