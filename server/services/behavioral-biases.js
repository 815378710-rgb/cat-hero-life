// 行为经济学偏见引擎 — 启发式与偏误识别 + 助推 (🧠 认知层 · Behavioral Economics)
//
// 理论根基:
//  - Kahneman 双系统: 系统1(直觉)易触发偏见, 系统2(反思)需被"助推"唤醒。
//  - 损失厌恶(loss aversion): 同等损失痛苦 > 同等收益快乐(~2:1, Tversky)。
//  - 现时偏好(present bias): 高估即时奖励, 低估长期收益(双曲线贴现)。
//  - 现状偏误(status quo bias): 倾向不行动/维持原状, 即使次优。
//  - 沉没成本(sunk cost): 因已投入而继续错误选择。
//  - 乐观偏误(optimism bias): 系统性低估风险/高估成功率。
//
// 设计: 仅"标注 + 温和助推", 不替用户决定(与 ethics 自主原则一致)。
// 纯函数 + 失败安全。

// 各偏误的触发词与解释(中文语境)
const BIAS_RULES = [
  {
    key: 'loss_aversion', name: '损失厌恶',
    signals: ['怕亏', '亏了', '舍不得', '亏钱', '赔了', '不想亏', '止损', '割肉', '亏太多'],
    explain: '人对损失的痛苦约为同等收益快乐的 2 倍，容易因害怕亏损而错过合理选择。',
    nudge: '不妨把"如果什么都不做"的长期代价也摆上天平——逃避损失有时本身才是更大的损失。',
  },
  {
    key: 'present_bias', name: '现时偏好',
    signals: ['现在爽', '以后再说', '明天开始', '先玩', '当下', '及时行乐', '懒得', '拖', '改天'],
    explain: '大脑天生高估即时满足、低估未来收益（双曲线贴现），所以"明天再做"总是赢。',
    nudge: '试试把未来的你当成另一个值得善待的人——给 ta 留一个更容易起步的小步骤。',
  },
  {
    key: 'status_quo', name: '现状偏误',
    signals: ['维持现状', '先不改', '再看看', '不动', '保持原样', '暂时这样', '没动力变'],
    explain: '人倾向维持现状即使次优，因为改变的"显性成本"比"隐性收益"更刺眼。',
    nudge: '问自己一句：如果一年后还是现在这样，我会满意吗？不满意，今天的最小一步是什么。',
  },
  {
    key: 'sunk_cost', name: '沉没成本',
    signals: ['已经投入', '都做了这么久', '不甘心', '都花了', '不能白', '前面付出了', '放弃太亏'],
    explain: '已付出且不可收回的成本不应影响未来决策，但人常因"不甘心"继续错误。',
    nudge: '沉没成本不是理由。只看从现在起，哪个选择让未来的你更轻松。',
  },
  {
    key: 'optimism_bias', name: '乐观偏误',
    signals: ['肯定行', '没问题', '稳了', '不会出事', '运气好', '应该能成', '大概率是'],
    explain: '人系统性高估成功概率、低估风险，导致准备不足。',
    nudge: '给自己留个 B 计划：如果最糟的情况发生，第一步该联系谁、做什么？',
  },
];

// ===== 从一段决策/想法文本中检测偏误 =====
// 返回 { biases:[{key,name,confidence,explain,nudge}], dominant }
export function detectBiases(text = '', ctx = {}) {
  try {
    const msg = String(text);
    const hits = [];
    for (const rule of BIAS_RULES) {
      const matched = rule.signals.filter(s => msg.includes(s));
      if (matched.length > 0) {
        hits.push({
          key: rule.key,
          name: rule.name,
          confidence: Math.min(0.95, 0.5 + matched.length * 0.15),
          matched,
          explain: rule.explain,
          nudge: rule.nudge,
        });
      }
    }
    // 按置信度排序, 取最强
    hits.sort((a, b) => b.confidence - a.confidence);
    return {
      biases: hits.slice(0, 3),
      dominant: hits[0] ? hits[0].key : null,
    };
  } catch {
    return { biases: [], dominant: null };
  }
}

// ===== 扫描近期决策, 给出"偏误倾向"洞察 =====
// decisions: [{ decision_text, dimension_affected, decided_at }]
export function summarizeBiasTendency(decisions = []) {
  try {
    const tally = {};
    for (const d of decisions) {
      const { biases } = detectBiases(d.decision_text || '');
      for (const b of biases) {
        tally[b.key] = (tally[b.key] || 0) + 1;
      }
    }
    const tendencies = Object.entries(tally)
      .map(([key, count]) => {
        const rule = BIAS_RULES.find(r => r.key === key);
        return { key, name: rule?.name || key, count, explain: rule?.explain || '', nudge: rule?.nudge || '' };
      })
      .sort((a, b) => b.count - a.count);
    return { totalDecisions: decisions.length, tendencies: tendencies.slice(0, 3) };
  } catch {
    return { totalDecisions: 0, tendencies: [] };
  }
}

// ===== 把偏见标注挂到 decision_events(可选, 影子模式) =====
// 不改动主流程, 仅追加一列 bias_hint 供后续分析
import { getDb } from '../db/init.js';
export function annotateDecisionBias(decisionId, text) {
  try {
    const db = getDb();
    // 表结构以 schema-final.sql 为准（id/user_id/bias_type/context）；
    // 原代码自建了另一套列（bias_key/nudge），与既有表冲突导致写入静默失败
    const { biases } = detectBiases(text);
    if (biases.length === 0) return null;
    const top = biases[0];
    const ev = db.prepare('SELECT user_id FROM decision_events WHERE id = ?').get(decisionId);
    const userId = ev?.user_id || db.prepare('SELECT id FROM users LIMIT 1').get()?.id;
    if (!userId) return null;
    const newId = `${decisionId}_${top.key}`;
    db.prepare(`INSERT OR REPLACE INTO decision_bias
      (id, user_id, decision_id, bias_type, confidence, context)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(newId, userId, decisionId, top.key, top.confidence, top.nudge || '');
    return top;
  } catch (e) {
    console.error('[bias] 标注失败:', e.message);
    return null;
  }
}
