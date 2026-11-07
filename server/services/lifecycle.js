// 猫猫侠 生命周期适配 - 人生阶段识别、任务/风格适配

// 人生阶段定义
const LIFE_STAGES = {
  exploration: { ageRange: [18, 22], name: '探索期', focus: ['learning', 'career', 'social', 'creativity'], taskBias: { learning: 0.3, career: 0.25, social: 0.25, creativity: 0.2 }, tone: 'energetic' },
  establishment: { ageRange: [23, 27], name: '建立期', focus: ['career', 'finance', 'social', 'learning'], taskBias: { career: 0.3, finance: 0.25, social: 0.2, learning: 0.15 }, tone: 'motivating' },
  deepening: { ageRange: [28, 35], name: '深耕期', focus: ['career', 'finance', 'health', 'habits'], taskBias: { career: 0.25, finance: 0.2, health: 0.2, habits: 0.15 }, tone: 'supportive' },
  stable: { ageRange: [36, 45], name: '稳定期', focus: ['health', 'career', 'social', 'mental'], taskBias: { health: 0.25, career: 0.2, social: 0.2, mental: 0.15 }, tone: 'balanced' },
  wisdom: { ageRange: [46, 100], name: '智慧期', focus: ['health', 'mental', 'social', 'creativity'], taskBias: { health: 0.3, mental: 0.25, social: 0.2, creativity: 0.15 }, tone: 'wise' }
};

// 识别用户人生阶段
export function detectLifeStage(profile) {
  if (!profile || !profile.birth_year) return null;

  const age = new Date().getFullYear() - profile.birth_year;

  for (const [key, stage] of Object.entries(LIFE_STAGES)) {
    if (age >= stage.ageRange[0] && age <= stage.ageRange[1]) {
      return { stage: key, age, ...stage };
    }
  }

  return { stage: 'wisdom', age, ...LIFE_STAGES.wisdom };
}

// 根据人生阶段调整任务权重
export function getTaskWeightForStage(dimensionId, profile) {
  const stage = detectLifeStage(profile);
  if (!stage) return 1.0;

  const bias = stage.taskBias[dimensionId] || 0.1;
  return 0.5 + bias * 2; // 范围 0.5 - 1.1
}

// 获取阶段适配的对话风格
export function getStageTone(profile) {
  const stage = detectLifeStage(profile);
  if (!stage) return 'neutral';

  const tones = {
    energetic: { style: '活力四射', greeting: '兄弟', emoji: '💪🔥' },
    motivating: { style: '积极鼓励', greeting: '加油', emoji: '⭐' },
    supportive: { style: '温暖支持', greeting: '', emoji: '🌟' },
    balanced: { style: '沉稳平衡', greeting: '', emoji: '🌈' },
    wise: { style: '温和智慧', greeting: '', emoji: '🕊️' }
  };

  return tones[stage.tone] || tones.balanced;
}

// 获取阶段适配的任务模板
export function getStageTaskTemplates(profile) {
  const stage = detectLifeStage(profile);
  if (!stage) return getDefaultTemplates();

  const templates = {
    exploration: {
      learning: ['投递3份简历', '学习一个新技能', '参加一个行业活动', '阅读一本专业书'],
      career: ['整理职业规划', '学习面试技巧', '拓展LinkedIn人脉'],
      social: ['参加一个社交活动', '认识一个新朋友', '和老朋友聚聚'],
      creativity: ['尝试一个新爱好', '写一篇博客', '做一个小项目']
    },
    establishment: {
      career: ['完成一个核心项目', '学习一项硬技能', '和领导做一次1on1'],
      finance: ['制定月度预算', '开始基金定投', '记账一周'],
      social: ['维护核心人脉', '参加行业聚会'],
      learning: ['完成一个在线课程', '考一个证书']
    },
    deepening: {
      career: ['优化工作流程', '培养团队能力', '探索副业可能'],
      finance: ['优化投资组合', '建立应急基金', '减少不必要开支'],
      health: ['建立运动习惯', '做一次体检', '改善饮食结构'],
      habits: ['建立晨间流程', '建立晚间流程', '每周复盘']
    },
    stable: {
      health: ['定期体检', '保持运动', '关注睡眠质量'],
      career: ['寻找导师', '培养接班人', '探索第二曲线'],
      social: ['陪伴家人', '维护老友', '社区贡献'],
      mental: ['冥想练习', '写感恩日记', '学习情绪管理']
    },
    wisdom: {
      health: ['养生保健', '适度运动', '定期检查'],
      mental: ['冥想修行', '整理人生智慧', '写回忆录'],
      social: ['传承经验', '陪伴家人', '社区贡献'],
      creativity: ['培养兴趣爱好', '记录人生故事', '学习新事物']
    }
  };

  return templates[stage.stage] || getDefaultTemplates();
}

function getDefaultTemplates() {
  return {
    health: ['运动30分钟', '喝8杯水', '早睡'],
    finance: ['记账', '查看支出'],
    learning: ['阅读30分钟', '学习新知识'],
    career: ['完成核心任务', '整理待办'],
    social: ['联系朋友', '家人关怀'],
    mental: ['冥想5分钟', '写日记'],
    habits: ['坚持习惯', '每日复盘'],
    creativity: ['记录灵感', '尝试新事物']
  };
}

// 获取阶段适配的建议语气
export function getStageAdviceStyle(profile) {
  const stage = detectLifeStage(profile);
  if (!stage) return 'neutral';

  const styles = {
    exploration: '你的路还很长，多尝试，找到真正热爱的方向。',
    establishment: '现在是打基础的关键期，每一步都在为未来积累。',
    deepening: '你已经知道自己要什么了，专注深耕，突破瓶颈。',
    stable: '平衡是这个阶段的关键词，照顾好自己和家人。',
    wisdom: '你积累了丰富的人生经验，是时候享受和传承了。'
  };

  return styles[stage.stage] || '';
}
