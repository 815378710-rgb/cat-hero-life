// 猫猫侠 对话数据提取引擎
// 从自然语言中自动提取结构化数据

import { v4 as uuid } from 'uuid';

// 从用户消息中提取数据并自动入库
export function extractAndSaveData(db, userId, message) {
  const results = [];
  
  // 健康数据提取
  const healthData = extractHealth(message);
  if (healthData.length > 0) {
    for (const h of healthData) {
      saveHealthData(db, userId, h);
      results.push({ type: 'health', detail: h });
    }
  }
  
  // 财务数据提取
  const financeData = extractFinance(message);
  if (financeData.length > 0) {
    for (const f of financeData) {
      saveFinanceData(db, userId, f);
      results.push({ type: 'finance', detail: f });
    }
  }
  
  // 情绪提取
  const mood = extractMood(message);
  if (mood) {
    saveMoodData(db, userId, mood);
    results.push({ type: 'mood', detail: mood });
  }
  
  // 学习数据提取
  const learning = extractLearning(message);
  if (learning) {
    saveLearningData(db, userId, learning);
    results.push({ type: 'learning', detail: learning });
  }
  
  // 运动数据提取
  const exercise = extractExercise(message);
  if (exercise) {
    saveExerciseData(db, userId, exercise);
    results.push({ type: 'exercise', detail: exercise });
  }
  
  // 睡眠数据提取
  const sleep = extractSleep(message);
  if (sleep) {
    saveSleepData(db, userId, sleep);
    results.push({ type: 'sleep', detail: sleep });
  }
  
  // 社交数据提取
  const social = extractSocial(message);
  if (social) {
    saveSocialData(db, userId, social);
    results.push({ type: 'social', detail: social });
  }
  
  return results;
}

// ===== 健康数据提取 =====

function extractHealth(msg) {
  const results = [];
  
  // 体重
  const weightMatch = msg.match(/(\d+\.?\d*)\s*(斤|公斤|kg|KG)/);
  if (weightMatch) {
    let weight = parseFloat(weightMatch[1]);
    if (weightMatch[2] === '斤') weight = weight / 2;
    results.push({ subtype: 'weight', value: weight, unit: 'kg' });
  }
  
  // 身高
  const heightMatch = msg.match(/(\d+\.?\d*)\s*(cm|CM|厘米|米)/);
  if (heightMatch) {
    let height = parseFloat(heightMatch[1]);
    if (heightMatch[2] === '米') height = height * 100;
    results.push({ subtype: 'height', value: height, unit: 'cm' });
  }
  
  // 血压
  const bpMatch = msg.match(/(\d{2,3})\s*[/／]\s*(\d{2,3})/);
  if (bpMatch && parseInt(bpMatch[1]) > 80) {
    results.push({ subtype: 'blood_pressure', sys: parseInt(bpMatch[1]), dia: parseInt(bpMatch[2]) });
  }
  
  // 心率
  const hrMatch = msg.match(/心率\s*(\d+)|心跳\s*(\d+)|脉搏\s*(\d+)/);
  if (hrMatch) {
    results.push({ subtype: 'heart_rate', value: parseInt(hrMatch[1] || hrMatch[2] || hrMatch[3]) });
  }
  
  // 喝水
  const waterMatch = msg.match(/喝了\s*(\d+)\s*(杯|ml|ML|毫升)\s*水|喝水\s*(\d+)\s*(杯|ml)/);
  if (waterMatch) {
    let ml = parseInt(waterMatch[1] || waterMatch[3]);
    if ((waterMatch[2] || waterMatch[4]) === '杯') ml = ml * 250;
    results.push({ subtype: 'water', value: ml, unit: 'ml' });
  }
  
  // 简单喝水
  if (msg.includes('喝水') && !waterMatch) {
    results.push({ subtype: 'water', value: 250, unit: 'ml' });
  }
  
  return results;
}

// ===== 财务数据提取 =====

function extractFinance(msg) {
  const results = [];
  
  // 花费模式：花了XX / 花了XX块 / 花XX元 / 买了XX花了XX
  const expensePatterns = [
    /花[了掉]?\s*(\d+\.?\d*)\s*(块|元|块钱|¥)/,
    /花了?\s*(\d+\.?\d*)/,
    /消费\s*(\d+\.?\d*)/,
    /支出\s*(\d+\.?\d*)/,
    /买了?[^，。]*?(\d+\.?\d*)\s*(块|元)/,
    /花了?\s*(\d+\.?\d*)\s*(?:块|元|块钱)?\s*(?:买了?|吃[了]?)?\s*(.+)/,
  ];
  
  for (const pattern of expensePatterns) {
    const match = msg.match(pattern);
    if (match) {
      const amount = parseFloat(match[1]);
      if (amount > 0 && amount < 100000) {
        const desc = match[3] || guessExpenseCategory(msg);
        results.push({ type: 'expense', amount, category: desc, description: msg.slice(0, 50) });
        break;
      }
    }
  }
  
  // 收入模式：工资XX / 收入XX / 赚了XX
  const incomeMatch = msg.match(/工资\s*(\d+)|收入\s*(\d+)|赚[了]?\s*(\d+)/);
  if (incomeMatch) {
    results.push({ type: 'income', amount: parseInt(incomeMatch[1] || incomeMatch[2] || incomeMatch[3]), category: '工资', description: msg.slice(0, 50) });
  }
  
  return results;
}

function guessExpenseCategory(msg) {
  if (msg.includes('吃') || msg.includes('饭') || msg.includes('餐') || msg.includes('外卖') || msg.includes('早餐') || msg.includes('午餐') || msg.includes('晚餐') || msg.includes('零食') || msg.includes('咖啡') || msg.includes('奶茶')) return '餐饮';
  if (msg.includes('打车') || msg.includes('地铁') || msg.includes('公交') || msg.includes('加油') || msg.includes('高铁') || msg.includes('飞机') || msg.includes('滴滴') || msg.includes('出租')) return '交通';
  if (msg.includes('买') && (msg.includes('衣') || msg.includes('鞋') || msg.includes('包') || msg.includes('手机') || msg.includes('电脑') || msg.includes('耳机'))) return '购物';
  if (msg.includes('电影') || msg.includes('游戏') || msg.includes('KTV') || msg.includes('演出') || msg.includes('门票') || msg.includes('旅游')) return '娱乐';
  if (msg.includes('房租') || msg.includes('水电') || msg.includes('物业') || msg.includes('宽带')) return '住房';
  if (msg.includes('药') || msg.includes('医院') || msg.includes('看病') || msg.includes('体检')) return '医疗';
  if (msg.includes('书') || msg.includes('课') || msg.includes('培训') || msg.includes('学费')) return '教育';
  if (msg.includes('红包') || msg.includes('礼物') || msg.includes('份子') || msg.includes('请客')) return '人情';
  return '其他';
}

// ===== 情绪提取 =====

function extractMood(msg) {
  const positive = ['开心', '高兴', '快乐', '爽', '棒', '不错', '满意', '成功', '进步', '收获', '太好了', '哈哈', '嘿嘿'];
  const negative = ['难过', '伤心', '郁闷', '焦虑', '烦躁', '痛苦', '失落', '心碎', '崩溃', '压力大', '受不了'];
  const tired = ['累', '疲惫', '困', '没精神', '想睡', '好累', '累死了'];
  const angry = ['生气', '愤怒', '烦死', '气死', '讨厌', '受够了'];
  const calm = ['平静', '放松', '舒服', '惬意', '自在'];
  
  let score = 3;
  let tags = [];
  
  const posCount = positive.filter(w => msg.includes(w)).length;
  const negCount = negative.filter(w => msg.includes(w)).length;
  const tirCount = tired.filter(w => msg.includes(w)).length;
  const angCount = angry.filter(w => msg.includes(w)).length;
  const calCount = calm.filter(w => msg.includes(w)).length;
  
  if (posCount > 0) { score = Math.min(5, 3 + posCount); tags.push('开心'); }
  if (negCount > 0) { score = Math.max(1, 3 - negCount); tags.push('难过'); }
  if (tirCount > 0) { score = Math.min(score, 2); tags.push('疲惫'); }
  if (angCount > 0) { score = Math.min(score, 2); tags.push('愤怒'); }
  if (calCount > 0) { tags.push('平静'); }
  
  // 能量推断
  let energy = 3;
  if (tirCount > 0) energy = 2;
  if (posCount > 0 && tirCount === 0) energy = 4;
  if (tirCount > 1) energy = 1;
  
  // 压力推断
  let stress = 3;
  if (negCount > 0 || angCount > 0) stress = 4;
  if (msg.includes('压力') || msg.includes('焦虑') || msg.includes('紧张')) stress = 5;
  if (calCount > 0) stress = 2;
  
  if (tags.length === 0 && posCount === 0 && negCount === 0) return null;
  
  return { score, tags, energy, stress, trigger: extractTrigger(msg) };
}

function extractTrigger(msg) {
  const triggers = ['因为', '由于', '所以', '导致', '原因是'];
  for (const t of triggers) {
    const idx = msg.indexOf(t);
    if (idx >= 0) return msg.slice(idx, idx + 30);
  }
  return null;
}

// ===== 学习数据提取 =====

function extractLearning(msg) {
  // 学了XX / 看了XX / 学习了XX
  const patterns = [
    /学[了习]?了?\s*(.{2,20})/,
    /看了?\s*(.{2,20})(?:的)?(?:书|课|教程|文档|视频)/,
    /练习[了]?\s*(.{2,20})/,
    /研究[了]?\s*(.{2,20})/,
  ];
  
  for (const p of patterns) {
    const match = msg.match(p);
    if (match) {
      const durationMatch = msg.match(/(\d+)\s*(?:小时|小时|分钟|min)/);
      return {
        content: match[1].trim(),
        duration_minutes: durationMatch ? parseInt(durationMatch[1]) : 30,
        type: guessLearningType(msg)
      };
    }
  }
  return null;
}

function guessLearningType(msg) {
  if (msg.includes('书') || msg.includes('阅读')) return '看书';
  if (msg.includes('课') || msg.includes('教程')) return '看课';
  if (msg.includes('练习') || msg.includes('刷题')) return '练习';
  if (msg.includes('项目') || msg.includes('代码')) return '项目';
  return '学习';
}

// ===== 运动数据提取 =====

function extractExercise(msg) {
  const types = {
    '跑步': ['跑步', '跑了个步', '晨跑', '夜跑', '慢跑', '跑了'],
    '走路': ['走路', '散步', '步行', '遛弯', '溜达'],
    '游泳': ['游泳', '游了个泳', '游了'],
    '健身': ['健身', '举铁', '力量训练', '去健身房', '撸铁', '器械'],
    '瑜伽': ['瑜伽', '练瑜伽'],
    '骑行': ['骑车', '骑行', '自行车', '共享单车'],
    '球类': ['打球', '篮球', '足球', '羽毛球', '乒乓球', '网球', '台球'],
    '跳绳': ['跳绳'],
    '爬山': ['爬山', '登山', '徒步'],
    '舞蹈': ['跳舞', '舞蹈', '街舞'],
  };
  
  for (const [type, keywords] of Object.entries(types)) {
    if (keywords.some(k => msg.includes(k))) {
      const durationMatch = msg.match(/(\d+)\s*(?:分钟|min)/);
      const distanceMatch = msg.match(/(\d+\.?\d*)\s*(?:公里|km|KM)/);
      const caloriesMatch = msg.match(/(\d+)\s*(?:卡|卡路里|千卡|大卡)/);
      
      return {
        type,
        duration_minutes: durationMatch ? parseInt(durationMatch[1]) : 30,
        distance_km: distanceMatch ? parseFloat(distanceMatch[1]) : null,
        calories: caloriesMatch ? parseInt(caloriesMatch[1]) : null
      };
    }
  }
  return null;
}

// ===== 睡眠数据提取 =====

function extractSleep(msg) {
  // X点睡 / 睡了X小时 / 昨晚X点睡X点起
  const sleepTimeMatch = msg.match(/(\d{1,2})\s*[点时:：]\s*(\d{0,2})\s*(?:才)?睡/);
  const wakeTimeMatch = msg.match(/(\d{1,2})\s*[点时:：]\s*(\d{0,2})\s*(?:起|醒)/);
  const durationMatch = msg.match(/睡[了觉]?了?\s*(\d+\.?\d*)\s*(?:个)?小时/);
  const qualityKeywords = { '好': 4, '不错': 4, '很好': 5, '很差': 2, '不好': 2, '失眠': 1, '没睡好': 2, '踏实': 4 };
  
  let result = null;
  
  if (sleepTimeMatch || wakeTimeMatch || durationMatch) {
    result = {};
    if (sleepTimeMatch) result.bedtime = `${sleepTimeMatch[1].padStart(2, '0')}:${(sleepTimeMatch[2] || '00').padStart(2, '0')}`;
    if (wakeTimeMatch) result.wake_time = `${wakeTimeMatch[1].padStart(2, '0')}:${(wakeTimeMatch[2] || '00').padStart(2, '0')}`;
    if (durationMatch) result.duration_hours = parseFloat(durationMatch[1]);
    
    for (const [keyword, quality] of Object.entries(qualityKeywords)) {
      if (msg.includes(keyword)) { result.quality = quality; break; }
    }
  }
  
  return result;
}

// ===== 社交数据提取 =====

function extractSocial(msg) {
  const socialKeywords = ['见了', '约了', '聊了', '聚了', '打电话', '视频通话', '吃饭', '聚会', '和朋友', '和家人'];
  
  if (socialKeywords.some(k => msg.includes(k))) {
    const peopleMatch = msg.match(/(?:和|跟|约了)\s*(.{1,10}?)(?:一起|出去|吃饭|聊天|见面|聚)/);
    return {
      type: guessSocialType(msg),
      people: peopleMatch ? peopleMatch[1] : null,
      description: msg.slice(0, 50)
    };
  }
  return null;
}

function guessSocialType(msg) {
  if (msg.includes('吃饭') || msg.includes('聚餐')) return '聚餐';
  if (msg.includes('电话') || msg.includes('视频')) return '通话';
  if (msg.includes('见面') || msg.includes('约')) return '见面';
  return '社交';
}

// ===== 数据入库 =====

function saveHealthData(db, userId, data) {
  const today = new Date().toISOString().split('T')[0];
  const id = uuid();
  
  switch (data.subtype) {
    case 'weight':
    case 'height':
    case 'blood_pressure':
    case 'heart_rate':
      db.prepare(`INSERT INTO health_body (id, user_id, record_date, ${data.subtype === 'weight' ? 'weight_kg' : data.subtype === 'height' ? 'height_cm' : data.subtype === 'heart_rate' ? 'heart_rate' : 'blood_pressure_sys, blood_pressure_dia'}) VALUES (?, ?, ?, ?${data.subtype === 'blood_pressure' ? ', ?' : ''})`)
        .run(...(data.subtype === 'blood_pressure' ? [id, userId, today, data.sys, data.dia] : [id, userId, today, data.value]));
      break;
    case 'water':
      db.prepare('INSERT INTO health_diet (id, user_id, diet_date, meal_type, water_ml) VALUES (?, ?, ?, ?, ?)')
        .run(id, userId, today, '饮水', data.value);
      break;
  }
}

function saveFinanceData(db, userId, data) {
  const today = new Date().toISOString().split('T')[0];
  db.prepare('INSERT INTO finance_transactions (id, user_id, transaction_date, type, category, amount, description) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uuid(), userId, today, data.type, data.category, data.amount, data.description);
}

function saveMoodData(db, userId, data) {
  const today = new Date().toISOString().split('T')[0];
  // 检查今天是否已有情绪记录
  const existing = db.prepare('SELECT id FROM mental_mood_diary WHERE user_id = ? AND diary_date = ?').get(userId, today);
  if (existing) {
    db.prepare('UPDATE mental_mood_diary SET mood_score = ?, mood_tags = ?, energy_level = ?, stress_level = ?, trigger_events = ? WHERE id = ?')
      .run(data.score, JSON.stringify(data.tags), data.energy, data.stress, data.trigger, existing.id);
  } else {
    db.prepare('INSERT INTO mental_mood_diary (id, user_id, diary_date, mood_score, mood_tags, energy_level, stress_level, trigger_events) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(uuid(), userId, today, data.score, JSON.stringify(data.tags), data.energy, data.stress, data.trigger);
  }
}

function saveLearningData(db, userId, data) {
  const today = new Date().toISOString().split('T')[0];
  db.prepare('INSERT INTO learning_logs (id, user_id, log_date, activity_type, content_description, duration_minutes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(uuid(), userId, today, data.type, data.content, data.duration_minutes);
}

function saveExerciseData(db, userId, data) {
  const today = new Date().toISOString().split('T')[0];
  db.prepare('INSERT INTO health_exercise (id, user_id, exercise_date, exercise_type, duration_minutes, distance_km, calories_burned) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uuid(), userId, today, data.type, data.duration_minutes, data.distance_km, data.calories);
}

function saveSleepData(db, userId, data) {
  const today = new Date().toISOString().split('T')[0];
  db.prepare('INSERT INTO health_sleep (id, user_id, sleep_date, bedtime, wake_time, duration_hours, quality) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(uuid(), userId, today, data.bedtime || null, data.wake_time || null, data.duration_hours || null, data.quality || null);
}

function saveSocialData(db, userId, data) {
  const today = new Date().toISOString().split('T')[0];
  db.prepare('INSERT INTO social_activities (id, user_id, activity_date, activity_type, description) VALUES (?, ?, ?, ?, ?)')
    .run(uuid(), userId, today, data.type, data.description);
}
