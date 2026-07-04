import { requireAdmin } from '../../_lib/auth';
import { type Env } from '../../_lib/env';
import { badRequest, json, serverError } from '../../_lib/http';
import { appendLog } from '../../_lib/logs';
import { type SiteConfig, writeSiteConfig } from '../../_lib/site-config';

const REQUIRED_FIELDS: (keyof SiteConfig)[] = [
  'siteTitle',
  'siteDescription',
  'heroTitle',
  'heroSubtitle',
  'heroPrimaryLabel',
  'heroPrimaryHref',
  'heroSecondaryLabel',
  'heroSecondaryHref',
  'sidebarTagline',
  'sidebarSubtagline',
];

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth.response) return auth.response;

    const body = (await context.request.json().catch(() => ({}))) as {
      config?: Partial<SiteConfig>;
      sha?: string;
    };

    if (!body.config) return badRequest('缺少 config 字段');

    // 字段校验：必填、非空字符串
    const errors: string[] = [];
    for (const key of REQUIRED_FIELDS) {
      const val = body.config[key];
      if (typeof val !== 'string' || !val.trim()) {
        errors.push(`${key} 必填且需为非空字符串`);
      }
    }
    if (errors.length > 0) return badRequest('配置校验失败', errors);

    const config = body.config as SiteConfig;
    const result = await writeSiteConfig(context.env, auth.session!.token, config, body.sha);

    // 写入操作日志
    await appendLog(context.env, auth.session!.token, {
      action: 'note.update',
      actor: auth.session!.login,
      target: 'src/content/_admin/site-config.json',
      title: '站点设置',
      commit: result.commit,
    });

    return json({ ok: true, sha: result.sha, commit: result.commit });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Update site config failed');
  }
}
