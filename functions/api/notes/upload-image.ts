import { requireAdmin } from '../../_lib/auth';
import { allowedCategories, allowedImageExtensions, docsRoot, maxImageBytes } from '../../_lib/constants';
import { type Env } from '../../_lib/env';
import { encodeBinaryBase64, getFile, putBinaryFile } from '../../_lib/github';
import { badRequest, conflict, json, serverError } from '../../_lib/http';

function sanitizeFilename(name: string) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'image';
}

function getImageExtension(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return (allowedImageExtensions as readonly string[]).includes(ext) ? ext : '';
}

export async function onRequestPost(context: { request: Request; env: Env }) {
  try {
    const auth = await requireAdmin(context.request, context.env);
    if (auth.response) return auth.response;

    const form = await context.request.formData();
    const file = form.get('file');
    const category = String(form.get('category') || '');
    const slug = String(form.get('slug') || '').trim();

    if (!(file instanceof File)) return badRequest('请选择图片文件');
    if (!allowedCategories.includes(category as any)) return badRequest('分类不合法');
    if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/.test(slug)) {
      return badRequest('Slug 格式不合法，请先填写 Slug');
    }

    const ext = getImageExtension(file.name);
    if (!ext) return badRequest(`不支持的图片格式，允许：${allowedImageExtensions.join(', ')}`);
    if (file.size > maxImageBytes) return badRequest(`图片不能超过 ${maxImageBytes / 1024 / 1024}MB`);

    const safeFilename = sanitizeFilename(file.name.replace(/\.[^.]+$/, '')) + '.' + ext;
    const path = `${docsRoot}/${category}/images/${slug}/${safeFilename}`;
    const relativePath = `./images/${slug}/${safeFilename}`;

    // Check if file already exists on GitHub
    try {
      await getFile(context.env, auth.session!.token, path);
      return conflict('同名图片已存在，请更换文件名。', { path });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (!message.includes('Not Found')) throw error;
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = encodeBinaryBase64(arrayBuffer);
    const commitMessage = `docs: add image ${safeFilename} for ${slug}`;

    const result = await putBinaryFile(context.env, auth.session!.token, path, base64, commitMessage);

    return json({
      ok: true,
      path,
      relativePath,
      markdown: `![${safeFilename.replace(/\.[^.]+$/, '')}](${relativePath})`,
      commit: result?.commit,
    });
  } catch (error) {
    return serverError(error instanceof Error ? error.message : 'Upload failed');
  }
}
