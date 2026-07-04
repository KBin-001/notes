/**
 * 前台站点配置：在构建时从 `src/content/_admin/site-config.json` 读取，
 * 若文件不存在则使用默认值。
 *
 * 后台通过 /api/settings/* 接口编辑该 JSON 文件，重新部署后前台生效。
 */

export interface SiteConfig {
  siteTitle: string;
  siteDescription: string;
  heroTitle: string;
  heroSubtitle: string;
  heroPrimaryLabel: string;
  heroPrimaryHref: string;
  heroSecondaryLabel: string;
  heroSecondaryHref: string;
  sidebarTagline: string;
  sidebarSubtagline: string;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  siteTitle: 'kevin知识库',
  siteDescription: '这里用于沉淀技术笔记、问题复盘、项目记录、工具使用和学习资料。',
  heroTitle: '把零散问题、学习记录和项目经验，整理成可复用的知识路径。',
  heroSubtitle:
    '这里用于沉淀技术笔记、问题复盘、项目记录、工具使用和学习资料。内容按主题、场景和处理过程归档，方便之后快速查找、复盘和复用。',
  heroPrimaryLabel: '浏览全部笔记',
  heroPrimaryHref: '#all-notes',
  heroSecondaryLabel: '查看整理模板',
  heroSecondaryHref: '/tools/templates/',
  sidebarTagline: '持续沉淀，长期复利。',
  sidebarSubtagline: '记录 · 整理 · 复用 · 成长',
};

let cachedConfig: SiteConfig | null = null;

/**
 * 读取站点配置。在 Astro 构建时通过动态 import JSON 实现；
 * 文件不存在或解析失败时回退到默认值。
 */
export async function getSiteConfig(): Promise<SiteConfig> {
  if (cachedConfig) return cachedConfig;
  try {
    // 构建时动态导入 JSON
    const mod = await import('../content/_admin/site-config.json');
    const data = (mod as any).default as Partial<SiteConfig>;
    cachedConfig = { ...DEFAULT_SITE_CONFIG, ...data };
    return cachedConfig;
  } catch {
    // 文件不存在（首次部署前）
    cachedConfig = DEFAULT_SITE_CONFIG;
    return cachedConfig;
  }
}

/** 同步获取已缓存的配置（首次需先调用 getSiteConfig） */
export function getCachedSiteConfig(): SiteConfig {
  return cachedConfig || DEFAULT_SITE_CONFIG;
}
