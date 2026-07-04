/**
 * 站点设置：加载配置到表单、保存、重置默认。
 */
import { fetchSiteConfig, updateSiteConfig, type SiteConfig } from './api';
import { $, escapeHtml } from './shared';

const FIELD_KEYS: (keyof SiteConfig)[] = [
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

const DEFAULTS: SiteConfig = {
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

function showMessage(text: string, type: 'info' | 'success' | 'error' = 'info'): void {
  const box = $('#settings-message');
  if (!box) return;
  if (!text) {
    box.innerHTML = '';
    return;
  }
  const iconMap: Record<string, string> = { success: '✓', error: '!', info: 'i' };
  box.innerHTML = `<div class="admin-message ${type}" style="margin-bottom:14px"><span style="font-weight:700">${iconMap[type] || ''}</span><span>${escapeHtml(text)}</span></div>`;
}

function fillForm(config: SiteConfig, sha: string): void {
  for (const key of FIELD_KEYS) {
    const el = $(`#cfg-${key}`) as HTMLInputElement | HTMLTextAreaElement | null;
    if (el) el.value = config[key] ?? '';
  }
  const shaEl = $('#cfg-sha') as HTMLInputElement | null;
  if (shaEl) shaEl.value = sha || '';
}

function readForm(): { config: SiteConfig; sha: string } {
  const config = {} as SiteConfig;
  for (const key of FIELD_KEYS) {
    const el = $(`#cfg-${key}`) as HTMLInputElement | HTMLTextAreaElement | null;
    (config as any)[key] = el?.value?.trim() ?? '';
  }
  const shaEl = $('#cfg-sha') as HTMLInputElement | null;
  const sha = shaEl?.value ?? '';
  return { config, sha };
}

function setSaving(saving: boolean): void {
  const btn = $('#settings-save-btn') as HTMLButtonElement | null;
  if (!btn) return;
  btn.disabled = saving;
  btn.style.opacity = saving ? '0.6' : '';
  btn.style.pointerEvents = saving ? 'none' : '';
}

export async function mountSettings(force = false): Promise<void> {
  if (!force && $('#cfg-siteTitle')?.value) return; // 已加载
  showMessage('', 'info');
  try {
    const data = await fetchSiteConfig();
    fillForm(data.config, data.sha);
  } catch (err) {
    showMessage(err instanceof Error ? err.message : '加载失败', 'error');
  }
}

export function bindSettingsEvents(): void {
  const saveBtn = $('#settings-save-btn');
  saveBtn?.addEventListener('click', async () => {
    const { config, sha } = readForm();

    // 简单非空校验
    for (const key of FIELD_KEYS) {
      if (!config[key]) {
        showMessage(`字段 ${key} 不能为空`, 'error');
        return;
      }
    }

    setSaving(true);
    showMessage('正在保存...', 'info');
    try {
      const result = await updateSiteConfig(config, sha);
      // 更新 sha
      const shaEl = $('#cfg-sha') as HTMLInputElement | null;
      if (shaEl) shaEl.value = result.sha || sha;
      showMessage('保存成功，重新部署后生效。', 'success');
    } catch (err) {
      showMessage(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  });

  const resetBtn = $('#settings-reset-btn');
  resetBtn?.addEventListener('click', () => {
    if (!confirm('确认将表单重置为默认值？（不会立即保存，需点击保存按钮提交）')) return;
    fillForm(DEFAULTS, '');
    showMessage('已重置为默认值，请点击保存按钮提交。', 'info');
  });
}
