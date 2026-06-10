export const allowedCategories = ['mtk', 'gms', 'camera', 'audio', 'display', 'tools', 'templates'] as const;
export const allowedTopics = ['charging', 'camera', 'display_tp', 'audio', 'sensor'] as const;
export const allowedStatuses = ['整理中', '已验证', '待验证', '未完成', '废弃'] as const;
export const allowedVisibilities = ['public', 'private', 'draft'] as const;

export const docsRoot = 'src/content/docs';
export const maxMarkdownBytes = 2 * 1024 * 1024;

