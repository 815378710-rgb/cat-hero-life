// 猫猫侠 社交影响力图谱 - 关系建模、影响力计算、洞察生成
import { v4 as uuid } from 'uuid';

// 添加/更新社交关系
export function upsertSocialPerson(db, userId, name, relationship = 'other') {
  const existing = db.prepare('SELECT * FROM social_graph WHERE user_id = ? AND person_name = ?').get(userId, name);
  if (existing) {
    db.prepare('UPDATE social_graph SET relationship = ?, updated_at = datetime("now") WHERE id = ?').run(relationship, existing.id);
    return existing.id;
  }
  const id = uuid();
  db.prepare('INSERT INTO social_graph (id, user_id, person_name, relationship) VALUES (?, ?, ?, ?)').run(id, userId, name, relationship);
  return id;
}

// 记录社交互动
export function recordInteraction(db, userId, personId, interactionType, emotionBefore, emotionAfter, context = '') {
  const id = uuid();
  const energyChange = (emotionAfter || 3) - (emotionBefore || 3);
  db.prepare('INSERT INTO social_interactions (id, user_id, person_id, interaction_type, emotion_before, emotion_after, energy_change, context) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, personId, interactionType, emotionBefore, emotionAfter, energyChange, context);

  // 更新最后联系时间和亲密度
  db.prepare('UPDATE social_graph SET last_contact = date("now"), closeness = MIN(100, closeness + 1) WHERE id = ?').run(personId);

  return id;
}

// 计算影响力
export function calculateInfluence(db, personId) {
  const interactions = db.prepare('SELECT * FROM social_interactions WHERE person_id = ? ORDER BY created_at DESC LIMIT 30').all(personId);
  if (interactions.length < 2) return 0;

  let totalMoodChange = 0, totalEnergyChange = 0;
  for (const i of interactions) {
    totalMoodChange += (i.emotion_after || 3) - (i.emotion_before || 3);
    totalEnergyChange += i.energy_change || 0;
  }

  const avgMood = totalMoodChange / interactions.length;
  const avgEnergy = totalEnergyChange / interactions.length;
  const influence = (avgMood * 0.6 + avgEnergy * 0.4) * 20;

  // 更新数据库
  db.prepare('UPDATE social_graph SET influence_score = ?, updated_at = datetime("now") WHERE id = ?')
    .run(Math.max(-100, Math.min(100, Math.round(influence * 10) / 10)), personId);

  return influence;
}

// 从对话自动提取社交关系
export function extractSocialFromMessage(db, userId, message) {
  const patterns = [
    /(?:和|跟|约了|见了|陪|找)\s*([^\s，。,.]{1,6}?)(?:一起|出去|吃饭|聊天|见面|聚|打球|逛街|喝|玩|聊|打了|打)/,
    /(?:和|跟)\s*([^\s，。,.]{1,6}?)(?:聊了|打了|见了|吃了|玩了|逛了)/,
    /(?:朋友|同事|同学|家人|亲戚|妈妈|爸爸|哥哥|姐姐|弟弟|妹妹)\s*([^\s，。,.]{1,4}?)/,
    /([^\s，。,.]{1,4}?)\s*(?:找我|叫我|约我|请我|找我聊天)/
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1] && match[1].length >= 2) {
      const name = match[1].replace(/[的了过着]/g, '');
      if (name.length >= 2 && !['我们', '他们', '大家', '什么'].includes(name)) {
        const personId = upsertSocialPerson(db, userId, name);
        // 从消息推断情绪
        const positive = ['开心', '高兴', '快乐', '不错', '棒', '好吃', '好玩'];
        const negative = ['烦', '讨厌', '不开心', '无聊'];
        let moodChange = 0;
        if (positive.some(w => message.includes(w))) moodChange = 1;
        if (negative.some(w => message.includes(w))) moodChange = -1;
        if (moodChange !== 0) {
          recordInteraction(db, userId, personId, 'chat', 3, 3 + moodChange, message.slice(0, 50));
        }
        return { name, personId };
      }
    }
  }
  return null;
}

// 生成社交洞察
export function generateSocialInsights(db, userId) {
  const people = db.prepare('SELECT * FROM social_graph WHERE user_id = ? ORDER BY closeness DESC').all(userId);
  const insights = [];

  // 重新计算所有人的影响力
  for (const p of people) {
    calculateInfluence(db, p.id);
  }

  // 刷新数据
  const updatedPeople = db.prepare('SELECT * FROM social_graph WHERE user_id = ? ORDER BY closeness DESC').all(userId);

  // 疏远预警
  for (const p of updatedPeople) {
    if (p.closeness > 60 && p.last_contact) {
      const daysSince = Math.floor((Date.now() - new Date(p.last_contact)) / 86400000);
      if (daysSince > p.contact_frequency * 2) {
        insights.push({ type: 'distance', severity: 'warning', person: p.person_name, message: `你已经${daysSince}天没联系${p.person_name}了，之前你们平均${p.contact_frequency}天联系一次` });
      }
    }
  }

  // 负面影响者
  const negativePeople = updatedPeople.filter(p => p.influence_score < -15);
  if (negativePeople.length > 0) {
    insights.push({ type: 'negative_influence', severity: 'alert', people: negativePeople.map(p => p.person_name), message: `注意：和${negativePeople.map(p => p.person_name).join('、')}相处后你的情绪通常会下降` });
  }

  // 正面影响者
  const positivePeople = updatedPeople.filter(p => p.influence_score > 20);
  if (positivePeople.length > 0) {
    insights.push({ type: 'positive_influence', severity: 'info', people: positivePeople.map(p => p.person_name), message: `${positivePeople.map(p => p.person_name).join('、')}对你有很正面的影响，多和他们相处` });
  }

  // 社交多样性
  const typeGroups = {};
  for (const p of updatedPeople) {
    if (!typeGroups[p.relationship]) typeGroups[p.relationship] = 0;
    typeGroups[p.relationship]++;
  }
  if (Object.keys(typeGroups).length <= 2 && updatedPeople.length > 3) {
    insights.push({ type: 'diversity', severity: 'suggestion', message: '你的社交圈比较单一，可以尝试拓展不同类型的关系' });
  }

  return insights;
}

// 获取社交图谱数据
export function getSocialGraph(db, userId) {
  const people = db.prepare('SELECT * FROM social_graph WHERE user_id = ? ORDER BY closeness DESC').all(userId);
  return people.map(p => ({
    id: p.id, name: p.person_name, relationship: p.relationship,
    closeness: p.closeness, influence: p.influence_score,
    lastContact: p.last_contact, frequency: p.contact_frequency
  }));
}
