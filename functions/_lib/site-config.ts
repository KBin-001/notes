import { type Env } from './env';
import { decodeBase64Content, getFile, putFile } from './github';

/**
 * 站点配置：以 JSON 形式存储在仓库 `src/content/_admin/site-config.json`。
 * 包含站点标题、描述、首页宣传文案、侧边栏页脚标语等可由后台编辑的全局参数。
 */

export const SITE_CONFIG_PATH = 'src/content/_admin/site-config.json';

export interface SiteConfig {
  /** 站点标题（显示在 header / 浏览器标题后缀） */
  siteTitle: string;
  /** 站点描述（meta description / 首页 hero 段落） */
  siteDescription: string;
  /** 首页 hero 主标题 */
  heroTitle: string;
  /** 首页 hero 副标题/段落 */
  heroSubtitle: string;
  /** 首页主按钮文案 */
  heroPrimaryLabel: string;
  /** 首页主按钮链接 */
  heroPrimaryHref: string;
  /** 首页次按钮文案 */
  heroSecondaryLabel: string;
  /** 首页次按钮链接 */
  heroSecondaryHref: string;
  /** 侧边栏页脚主标语 */
  sidebarTagline: string;
  /** 侧边栏页脚副标语 */
  sidebarSubtagline: string;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  siteTitle: 'kevin知识库',
  siteDescription:
    '这里用于沉淀技术笔记、问题复盘、项目记录、工具使用和学习资料。',
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

export async function readSiteConfig(env: Env, token: string): Promise<{ config: SiteConfig; sha: string }> {
  try {
    const file = await getFile(env, token, SITE_CONFIG_PATH);
    const text = decodeBase64Content(file.content);
    const data = JSON.parse(text) as Partial<SiteConfig>;
    // 合并默认值，保证字段完整
    const config: SiteConfig = { ...DEFAULT_SITE_CONFIG, ...data };
    return { config, sha: file.sha };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('Not Found')) {
      return { config: DEFAULT_SITE_CONFIG, sha: '' };
    }
    throw error;
  }
}

export async function writeSiteConfig(
  env: Env,
  token: string,
  config: SiteConfig,
  sha?: string,
): Promise<{ sha: string; commit?: string }> {
  const content = JSON.stringify(config, null, 2) + '\n';
  // 如果未提供 sha，尝试读取现有文件以获取 sha（用于更新而非新建）
  let existingSha = sha;
  if (!existingSha) {
    try {
      const file = await getFile(env, token, SITE_CONFIG_PATH);
      existingSha = file.sha;
    } catch {
      /* 新文件 */
    }
  }
  const result = await putFile(
    env,
    token,
    SITE_CONFIG_PATH,
    content,
    'chore: update site config',
    existingSha,
  );
  return { sha: result?.content?.sha || '', commit: result?.commit?.sha };
}
