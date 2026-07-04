// 猫猫侠 数据质量引擎 - 提取确认、冲突检测、可信度管理
import { v4 as uuid } from 'uuid';

// 记录提取的数据及可信度
export function recordExtractedData(db, userId, sourceType, dataType, rawText, extractedValue, confidence = 0.5) {
  const id = uuid();
  db.prepare('INSERT INTO data_confidence (id, user_id, source_type, data_type, raw_text, extracted_value, confidence) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, userId, sourceType, dataType, rawText, JSON.stringify(extractedValue), confidence);
  return id;
}

// 检测数据冲突
export function detectConflicts(db, userId, newValue, dataType) {
  const today = new Date().toISOString().split('T')[0];

  // 获取今天同类型的数据
  const todayData = db.prepare('SELECT * FROM data_confidence WHERE user_id = ? AND data_type = ? AND date(created_at) = ? ORDER BY created_at DESC').all(userId, dataType, today);

  if (todayData.length === 0) return null;

  // 检查数值冲突
  const lastValue = JSON.parse(todayData[0].extracted_value || '{}');
  if (typeof newValue === 'number' && typeof lastValue.value === 'number') {
    const diff = Math.abs(newValue - lastValue.value);
    const threshold = lastValue.value * 0.3; // 30%变化视为冲突
    if (diff > threshold && diff > 5) {
      return {
        type: 'value_conflict',
        previous: { value: lastValue.value, time: todayData[0].created_at },
        current: { value: newValue },
        message: `你之前说${dataType}是${lastValue.value}，现在是${newValue}，差异较大`,
        needConfirmation: true
      };
    }
  }

  // 检查情绪冲突
  if (dataType === 'mood') {
    const prevMood = todayData[0].extracted_value;
    if (prevMood && newValue && Math.abs(newValue.score - JSON.parse(prevMood).score) >= 2) {
      return {
        type: 'mood_conflict',
        previous: JSON.parse(prevMood),
        current: newValue,
        message: `你上午的情绪和现在差别挺大的，发生什么了？`,
        needConfirmation: true
      };
    }
  }

  return null;
}

// 获取数据可信度
export function getDataConfidence(db, userId, dataType, days = 7) {
  const data = db.prepare('SELECT confidence, source_type FROM data_confidence WHERE user_id = ? AND data_type = ? AND created_at >= datetime("now", ?)').all(userId, dataType, `-${days} days`);

  if (data.length === 0) return { confidence: 0, samples: 0 };

  const avgConfidence = data.reduce((s, d) => s + d.confidence, 0) / data.length;

  // 来源加权
  const sourceWeights = { self_report: 1.0, chat: 0.7, checkin: 0.9, inferred: 0.4 };
  const weightedConfidence = data.reduce((s, d) => s + d.confidence * (sourceWeights[d.source_type] || 0.5), 0) / data.length;

  return {
    confidence: Math.round(weightedConfidence * 100) / 100,
    samples: data.length,
    bySource: Object.entries(sourceWeights).map(([src, w]) => ({
      source: src,
      count: data.filter(d => d.source_type === src).length,
      weight: w
    }))
  };
}

// 根据置信度获取数据权重
export function getWeightedValue(db, userId, dataType) {
  const data = db.prepare('SELECT extracted_value, confidence, source_type FROM data_confidence WHERE user_id = ? AND data_type = ? ORDER BY created_at DESC LIMIT 10').all(userId, dataType);

  if (data.length === 0) return null;

  const sourceWeights = { self_report: 1.0, checkin: 0.9, chat: 0.7, inferred: 0.4 };

  let totalWeight = 0, weightedSum = 0;
  for (const d of data) {
    const w = d.confidence * (sourceWeights[d.source_type] || 0.5);
    const val = JSON.parse(d.extracted_value || '{}');
    if (typeof val.value === 'number') {
      weightedSum += val.value * w;
      totalWeight += w;
    }
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight * 10) / 10 : null;
}

// 需要确认的模糊数据
export function getPendingConfirmations(db, userId) {
  return db.prepare('SELECT * FROM data_confidence WHERE user_id = ? AND verified = 0 AND confidence < 0.6 ORDER BY created_at DESC LIMIT 5').all(userId);
}

// 确认数据
export function verifyData(db, dataId, correctedValue = null) {
  if (correctedValue) {
    db.prepare('UPDATE data_confidence SET extracted_value = ?, confidence = 0.95, verified = 1 WHERE id = ?')
      .run(JSON.stringify(correctedValue), dataId);
  } else {
    db.prepare('UPDATE data_confidence SET verified = 1, confidence = 0.9 WHERE id = ?').run(dataId);
  }
}
