// Server-only: Blogger node runner and helpers.
import type { Ctx, Runner } from './runners';
import { each, str } from './extra';
import { oauthCall } from './googleAuth';

const B = 'https://www.googleapis.com/blogger/v3';
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);
export const bloggerCall = (cred: Record<string, any> | null) => oauthCall('Blogger', cred, 'Blogger');

/** Plain text becomes paragraphs. Text that already has HTML tags is left alone. */
export const toHtml = (t: string) => (/<[a-z][\s\S]*>/i.test(t) ? t : t.split(/\n{2,}/).filter((p) => p.trim()).map((p) => `<p>${p.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</p>`).join('\n'));

export const flatPost = (p: any, withContent = true) => ({
  id: p.id, blogId: p.blog?.id, title: p.title, url: p.url, status: p.status, published: p.published, updated: p.updated, author: p.author?.displayName, labels: p.labels || [], comments: p.replies?.totalItems,
  ...(withContent && p.content ? { content: clip(String(p.content), 20000) } : {}),
});

export async function blogId(cred: Record<string, any> | null, v: string): Promise<string> {
  const s = v.trim();
  if (/^\d+$/.test(s)) return s;
  if (/^https?:\/\//i.test(s)) { const r = await bloggerCall(cred)('GET', `${B}/blogs/byurl?url=${encodeURIComponent(s)}`); return String(r.id); }
  throw new Error('Blog is empty or wrong. Use the blog address (https://yourblog.blogspot.com) or its numeric ID. Get blogs lists yours.');
}
const pid = (v: string) => { if (!/^\d+$/.test(v.trim())) throw new Error('Post ID must be a number. Get many posts returns it as id.'); return v.trim(); };
const labelsOf = (v: string) => v.split(',').map((s) => s.trim()).filter(Boolean);

export async function bloggerPosts(cred: Record<string, any> | null, blog: string, o: { query?: string; limit?: number; status?: string; full?: boolean }) {
  const b = await blogId(cred, blog);
  const n = Math.min(50, Math.max(1, o.limit || 10));
  const call = bloggerCall(cred);
  const r = o.query
    ? await call('GET', `${B}/blogs/${b}/posts/search?q=${encodeURIComponent(o.query)}&fetchBodies=${o.full ? 'true' : 'false'}`)
    : await call('GET', `${B}/blogs/${b}/posts?maxResults=${n}&orderBy=published&fetchBodies=${o.full ? 'true' : 'false'}${o.status && o.status !== 'all' ? `&status=${o.status}` : ''}`);
  return ((r.items || []) as any[]).slice(0, n).map((p) => flatPost(p, !!o.full));
}
export async function bloggerGet(cred: Record<string, any> | null, blog: string, post: string) {
  return flatPost(await bloggerCall(cred)('GET', `${B}/blogs/${await blogId(cred, blog)}/posts/${pid(post)}`));
}
export async function bloggerCreate(cred: Record<string, any> | null, blog: string, o: { title: string; content: string; labels: string[]; publish: boolean }) {
  if (!o.title.trim()) throw new Error('Title is empty.');
  const r = await bloggerCall(cred)('POST', `${B}/blogs/${await blogId(cred, blog)}/posts?isDraft=${o.publish ? 'false' : 'true'}`, { title: o.title, content: toHtml(o.content), ...(o.labels.length ? { labels: o.labels } : {}) });
  return flatPost(r, false);
}
export async function bloggerUpdate(cred: Record<string, any> | null, blog: string, post: string, o: { title?: string; content?: string; labels?: string[] }) {
  const patch: Record<string, any> = {};
  if (o.title) patch.title = o.title;
  if (o.content) patch.content = toHtml(o.content);
  if (o.labels?.length) patch.labels = o.labels;
  if (!Object.keys(patch).length) throw new Error('Nothing to change. Give a title, content or labels.');
  return flatPost(await bloggerCall(cred)('PATCH', `${B}/blogs/${await blogId(cred, blog)}/posts/${pid(post)}`, patch), false);
}

export const bloggerRunners: Record<string, Runner> = {
  blogger: each(async (c: Ctx, i: number) => {
    const cred = c.cred;
    const op = String(c.param('operation', i) || 'Get many posts');
    const call = bloggerCall(cred);
    if (op === 'Get blogs') return ((await call('GET', `${B}/users/self/blogs`)).items || []).map((b: any) => ({ id: b.id, name: b.name, url: b.url, posts: b.posts?.totalItems }));
    const blog = str(c, 'blog', i);
    if (op === 'Get many posts') return bloggerPosts(cred, blog, { limit: Number(c.raw('limit')) || 10, status: String(c.raw('status') || 'live'), full: c.raw('includeContent') === true });
    if (op === 'Search posts') return bloggerPosts(cred, blog, { query: str(c, 'query', i), limit: Number(c.raw('limit')) || 10, full: c.raw('includeContent') === true });
    if (op === 'Get a post') return bloggerGet(cred, blog, str(c, 'postId', i));
    if (op === 'Create a post') return bloggerCreate(cred, blog, { title: String(c.param('title', i) ?? ''), content: String(c.param('content', i) ?? ''), labels: labelsOf(str(c, 'labels', i)), publish: c.raw('publish') === 'Publish now' });
    if (op === 'Update a post') return bloggerUpdate(cred, blog, str(c, 'postId', i), { title: str(c, 'title', i), content: String(c.param('content', i) ?? ''), labels: labelsOf(str(c, 'labels', i)) });
    if (op === 'Publish a draft') return flatPost(await call('POST', `${B}/blogs/${await blogId(cred, blog)}/posts/${pid(str(c, 'postId', i))}/publish`, {}), false);
    if (op === 'Delete a post') { await call('DELETE', `${B}/blogs/${await blogId(cred, blog)}/posts/${pid(str(c, 'postId', i))}`); return { deleted: true, postId: str(c, 'postId', i) }; }
    throw new Error(`Unknown action "${op}"`);
  }),
};
