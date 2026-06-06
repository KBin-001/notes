import type { CollectionEntry } from 'astro:content';

export const categoryOrder = ['mtk', 'gms', 'camera', 'audio', 'display', 'tools', 'templates'];

export const topicOrder = ['charging', 'camera', 'display_tp', 'audio', 'sensor'] as const;

export type TopicId = (typeof topicOrder)[number];

export const topicMeta: Record<TopicId, { title: string; description: string }> = {
  charging: {
    title: '充电',
    description: '充电路径、节点、电流策略、PD/USB 相关问题复盘。',
  },
  camera: {
    title: 'Camera',
    description: '摄像头 bring-up、供电时序、FOV、方向和画质问题复盘。',
  },
  display_tp: {
    title: '屏幕与 TP',
    description: '屏幕、亮度、刷新率、分辨率、TP/触控交互问题复盘。',
  },
  audio: {
    title: '音频',
    description: '功放、音效、通路、耳机、音量和音频测试问题复盘。',
  },
  sensor: {
    title: 'Sensor',
    description: 'G-sensor、陀螺仪、距离传感器和相关声明问题复盘。',
  },
};

export const categoryMeta: Record<string, { title: string; description: string; accent: string }> = {
  mtk: {
    title: 'MTK 平台',
    description: '平台驱动、显示、相机、传感器与系统定制问题记录。',
    accent: 'cyan',
  },
  gms: {
    title: 'GMS 认证',
    description: '认证项、声明裁剪、测试失败与兼容性处理。',
    accent: 'emerald',
  },
  camera: {
    title: 'Camera',
    description: 'Camera bring-up、FOV、供电时序和调试经验。',
    accent: 'violet',
  },
  audio: {
    title: 'Audio',
    description: '音频效果、功放调试、通路与测试记录。',
    accent: 'amber',
  },
  display: {
    title: 'Display',
    description: '屏幕亮度、刷新率、分辨率和显示相关配置。',
    accent: 'rose',
  },
  tools: {
    title: 'Tools',
    description: 'ADB、Git、Logcat 等常用排查工具速查。',
    accent: 'sky',
  },
  templates: {
    title: 'Templates',
    description: '问题记录、调试复盘和 Diff 归档模板。',
    accent: 'slate',
  },
  home: {
    title: '首页',
    description: 'kevin知识库入口。',
    accent: 'cyan',
  },
};

export function docUrl(id: string) {
  if (id === 'index') return '/';
  return `/${id.replace(/\/index$/, '')}/`;
}

export function topicDocUrl(id: string, topic: TopicId) {
  return `${docUrl(id)}?topic=${topic}`;
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function sortDocsByUpdated(docs: CollectionEntry<'docs'>[]) {
  return [...docs].sort((a, b) => b.data.updated.getTime() - a.data.updated.getTime());
}

export function isIndexDoc(id: string) {
  return id === 'index' || id.endsWith('/index') || categoryOrder.includes(id);
}

export function getCategoryFromId(id: string) {
  if (categoryOrder.includes(id)) return id;
  return id.includes('/') ? id.split('/')[0] : 'home';
}
