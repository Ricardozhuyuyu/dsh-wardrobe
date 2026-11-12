/**
 * 鱼鱼的衣橱 — Host 半边。
 * 只读扫描 default-workspace 的衣橱图库与衣橱清单，产出 JSON + 图片字节流。
 * 不写那边任何文件。
 */
import { readdir, readFile, stat, writeFile, rename, rm, mkdir } from 'node:fs/promises';
import { join, extname, basename, dirname, relative, isAbsolute, resolve } from 'node:path';
import { homedir } from 'node:os';
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

/**
 * 衣橱图库在哪。换电脑 / 换系统只改这一处：
 * 1) 插件配置 root（cordis.patch.yml 里 config.root）
 * 2) 环境变量 YUYU_WARDROBE_ROOT
 * 3) 默认 ~/Documents/deepseek-harness/default-workspace
 */
function resolveRoot(configRoot) {
  const pick = (value) => (typeof value === 'string' && value.trim() ? value.trim() : '');
  const chosen = pick(configRoot)
    || pick(process.env.YUYU_WARDROBE_ROOT)
    || join(homedir(), 'Documents', 'deepseek-harness', 'default-workspace');
  // Windows 上从资源管理器复制来的路径可能带引号、反斜杠或末尾分隔符
  const cleaned = chosen.replace(/^["']|["']$/g, '').replace(/[\\/]+$/, '');
  return cleaned || chosen;
}

let ROOT = resolveRoot();
let GALLERY = join(ROOT, 'ctx', '图库', '衣橱图库');
let LIST_FILE = join(ROOT, 'ctx', '衣橱', '衣橱清单.md');

function useRoot(root) {
  ROOT = resolveRoot(root);
  GALLERY = join(ROOT, 'ctx', '图库', '衣橱图库');
  LIST_FILE = join(ROOT, 'ctx', '衣橱', '衣橱清单.md');
  cache = { at: 0, data: null };
}

/** 读文本：Windows 的 CRLF 统一成 LF，解析表格/标题不会多出 \r。 */
async function readText(file) {
  const text = await readFile(file, 'utf8').catch(() => '');
  return text.replace(/\r\n?/g, '\n');
}

/** 原子写；Windows 上 rename 覆盖同名文件可能 EBUSY，失败就退回直接写。 */
async function writeTextAtomic(file, text) {
  await mkdir(dirname(file), { recursive: true }).catch(() => {});
  const temp = `${file}.tmp-${process.pid}`;
  await writeFile(temp, text, 'utf8');
  try {
    await rename(temp, file);
  } catch {
    await writeFile(file, text, 'utf8').catch(() => {});
    await rm(temp, { force: true }).catch(() => {});
  }
}

/** 这个绝对路径是否还在图库里（不用字符串前缀，省得盘符大小写、\ 和 / 打架）。 */
function insideGallery(abs) {
  const rel = relative(GALLERY, abs);
  return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
}

const IMG_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif']);
const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
};

const SERIES = [
  { key: 'G', label: '出门', note: '街头与旅行' },
  { key: 'Y', label: '宴会', note: '正式' },
  { key: 'H', label: '家里', note: '日常' },
  { key: 'S', label: '学生', note: '制服' },
  { key: 'C', label: '扮别人', note: 'Cosplay' },
  { key: 'X', label: '特殊场合', note: '只给一个人看' },
];

const TTL_MS = 10_000;
let cache = { at: 0, data: null };

/** 图的分类。顺序就是页面上的顺序。 */
/** 分类的出厂值；用户在后台改过的存在 overlay.meta.cats。 */
const PHOTO_CATS = [
  { key: 'setting', label: '设定整图', hint: '整套的样子，出图对着改' },
  { key: 'anime', label: '二次元', hint: '厚涂二次元主图，可当生图参考' },
  { key: 'real', label: '真人', hint: '真人风主图，可当生图参考' },
  { key: 'album', label: '相册橱窗', hint: '出门、旅行、那天拍的' },
  { key: 'private', label: '私密照', hint: '要密码才看' },
  { key: 'other', label: '其他', hint: '还没归类的' },
];

/** 文件名/所在子目录认品类；认不出来就归「其他」，页面上能手动改。 */
function photoCatOf(fileName, relPath = '') {
  const name = String(fileName || '');
  const dir = String(relPath || '').replace(/[^/]+$/, '');   // 只留目录部分
  if (dir && /二次元|厚涂|anime/i.test(dir)) return 'anime';
  if (dir && /真人|写实|real/i.test(dir)) return 'real';
  if (dir && /私密|私房|secret|private/i.test(dir)) return 'private';
  if (dir && /相册|橱窗|纪念|旅拍|album/i.test(dir)) return 'album';
  if (dir && /设定|setting/i.test(dir)) return 'setting';
  if (/私密|私房|私影|secret|private/i.test(name)) return 'private';
  if (/二次元|厚涂|anime/i.test(name)) return 'anime';
  if (/真人|写实|real/i.test(name)) return 'real';
  if (/设定集|设定整版|设定图|整版设定/i.test(name)) return 'setting';
  if (/相册|橱窗|纪念|旅拍|出游|album/i.test(name)) return 'album';
  if (/参考|ref\b/i.test(name)) return 'other';
  if (/^合集/.test(name)) return 'album';
  if (/参考|ref\b/i.test(name)) return 'other';
  // 没写关键词的就是这套的标准主图（-01、-02 那种）
  return 'anime';
}

/** 当前生效的分类表：出厂顺序 + overlay.meta.cats 的改名/排序/新增。 */
function catList(overlay) {
  const saved = Array.isArray(overlay?.meta?.cats) ? overlay.meta.cats : null;
  if (!saved || !saved.length) return PHOTO_CATS;
  const known = new Map(PHOTO_CATS.map((cat) => [cat.key, cat]));
  const out = [];
  for (const row of saved) {
    const key = String(row?.key || '').trim();
    if (!key) continue;
    const base = known.get(key) || { key, hint: '' };
    out.push({
      key,
      label: stripMd(row?.label || base.label || key) || key,
      hint: stripMd(row?.hint || base.hint || ''),
    });
  }
  for (const cat of PHOTO_CATS) if (!out.some((row) => row.key === cat.key)) out.push(cat);
  return out;
}

/** overlay 里手工改过的分类优先（name 带扩展名）。 */
function catOfImage(img, photos, cats = PHOTO_CATS) {
  const forced = photos && photos[img.name];
  if (forced && cats.some((cat) => cat.key === forced)) return forced;
  const auto = photoCatOf(img.name, img.rel);
  return cats.some((cat) => cat.key === auto) ? auto : (cats[0]?.key || auto);
}


const stripMd = (v) => String(v ?? '')
  .replace(/\*\*/g, '')
  .replace(/~~/g, '')
  .replace(/`/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** 从「关键件」长段里截一句简介。 */
function summarize(desc) {
  const text = String(desc || '');
  const at = text.search(/气质[:：]/);
  let body = at >= 0 ? text.slice(at).replace(/^气质[:：]\s*/, '') : text;
  body = body.split(/[。；;]/)[0].trim();
  if (!body) body = text.split(/[。；;]/)[0].trim();
  if (body.length > 110) body = body.slice(0, 108).trim() + '…';
  return body;
}

/** 解析 `| 编号 | 名字 | 关键件 | 图 |` 表格；X 组列含义不同，按首列形状分辨。 */
function parseList(text) {
  const rows = new Map();
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line.startsWith('|')) continue;
    if (/^\|[\s|:-]+\|$/.test(line)) continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 2) continue;
    if (cells[0].includes('~~')) continue;            // 已删/降级的条目
    const head = stripMd(cells[0]);
    const standard = /^([A-Z])-(\d{1,2}[a-z]?)$/.exec(head);
    let id;
    let name;
    let desc;
    if (standard) {
      id = `${standard[1]}-${standard[2]}`;
      name = stripMd(cells[1]);
      desc = stripMd(cells[2] ?? '');
    } else {
      const combined = /^([A-Z]-\d{1,2}[a-z]?)-?(.*)$/.exec(head);
      if (!combined) continue;
      id = combined[1];
      const parts = combined[2].split('-').filter(Boolean);
      name = parts.length ? parts[parts.length - 1] : '';
      desc = stripMd(cells[1] ?? '');
    }
    if (!name) name = id;
    if (!rows.has(id)) rows.set(id, { id, name, desc });
  }
  return rows;
}

async function collectImages() {
  const out = [];
  async function walk(absDir, relDir, depth) {
    let entries = [];
    try {
      entries = await readdir(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (depth >= 1) continue;
        if (entry.name.startsWith('_')) continue;    // _归档：旧图不进衣橱
        await walk(join(absDir, entry.name), rel, depth + 1);
        continue;
      }
      if (!IMG_EXT.has(extname(entry.name).toLowerCase())) continue;
      out.push({ rel, name: entry.name, dir: relDir });
    }
  }
  await walk(GALLERY, '', 0);
  return out;
}

async function collectFolders() {
  let entries = [];
  try {
    entries = await readdir(GALLERY, { withFileTypes: true });
  } catch {
    return [];
  }
  const folders = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const m = /^([A-Z])-(\d{1,2}[a-z]?)-(.+)$/.exec(entry.name);
    if (!m) continue;
    const parts = m[3].split('-').filter(Boolean);
    folders.push({
      id: `${m[1]}-${m[2]}`,
      folder: entry.name,
      guessName: parts.length ? parts[parts.length - 1] : m[3],
    });
  }
  return folders;
}

/** 文件名 → 简短标签。 */
function labelOf(fileName, id, name) {
  let base = fileName.replace(/\.[^.]+$/, '');
  let tokens = base.split('-').filter(Boolean);
  tokens.shift();                                     // 第一个 token 是编号
  // 去掉日期三段
  const out = [];
  for (let i = 0; i < tokens.length; i += 1) {
    if (/^\d{4}$/.test(tokens[i]) && /^\d{1,2}$/.test(tokens[i + 1] || '') && /^\d{1,2}$/.test(tokens[i + 2] || '')) {
      i += 2;
      continue;
    }
    if (tokens[i] === name) continue;
    out.push(tokens[i]);
  }
  if (!out.length) return '整版';
  if (out.length === 1 && /^\d{1,2}$/.test(out[0])) return `图 ${out[0]}`;
  return out.join(' · ');
}

/** 合集文件名 → 「合集 · 下山 落叶 午后」。 */
function groupLabel(fileName) {
  const parts = fileName.replace(/\.[^.]+$/, '').split('-').filter(Boolean).slice(1)
    .filter((token) => !/^\d{1,2}$/.test(token));
  return `合集 · ${parts.join(' ') || '合照'}`;
}

async function build() {
  const [listText, images, folders] = await Promise.all([
    readText(LIST_FILE).catch(() => ''),
    collectImages(),
    collectFolders(),
  ]);
  const listed = parseList(listText);
  const wearMap = parseWear(listText);
  const overlayAll = await readOverlay();
  const cats = catList(overlayAll);
  const byId = new Map();

  for (const folder of folders) {
    const row = listed.get(folder.id);
    byId.set(folder.id, {
      id: folder.id,
      name: row?.name || folder.guessName,
      desc: row?.desc || '',
      folder: folder.folder,
    });
  }
  for (const [id, row] of listed) {
    if (byId.has(id)) continue;
    byId.set(id, { id, name: row.name, desc: row.desc, folder: null });
  }

  const compilations = images.filter((img) => img.name.startsWith('合集'));

  const series = SERIES.map((meta) => ({ key: meta.key, label: meta.label, note: meta.note, items: [] }));

  for (const outfit of byId.values()) {
    const seriesKey = outfit.id[0];
    const bucket = series.find((s) => s.key === seriesKey);
    if (!bucket) continue;
    if (outfit.id.startsWith('O-')) continue;

    const compact = outfit.id.replace(/-/g, '').toLowerCase();
    const boundary = new RegExp(`^${compact}(?![a-z0-9])`, 'i');
    const own = images.filter((img) => boundary.test(img.name));

    const related = compilations.filter((img) => outfit.name && img.name.includes(outfit.name));

    const all = [
      ...own.map((img) => ({ img, kind: img.name.includes('设定集') ? 'set' : 'own' })),
      ...related.map((img) => ({ img, kind: 'group' })),
    ];

    const photos = overlayAll[outfit.id]?.photos || {};
    const hidden = Array.isArray(overlayAll[outfit.id]?.hidden) ? overlayAll[outfit.id].hidden : [];
    const catOrder = new Map(cats.map((cat, index) => [cat.key, index]));
    const scored = all.map((entry) => {
      const cat = catOfImage(entry.img, photos, cats);
      let within = 2;
      if (cat === 'setting' || entry.kind === 'set') within = 0;
      else if (/01\./.test(entry.img.name)) within = 1;
      else if (entry.img.name.includes('参考')) within = 3;
      else if (entry.kind === 'group') within = 4;
      const stale = /旧/.test(entry.img.name) ? 1 : 0;   // 旧版排到同类最后
      return { ...entry, cat, score: catOrder.get(cat) * 100 + within * 2 + stale };
    }).sort((a, b) => a.score - b.score || a.img.name.localeCompare(b.img.name));

    const seen = new Set();
    const list = [];
    const hiddenHere = [];
    for (const entry of scored) {
      if (seen.has(entry.img.rel)) continue;
      seen.add(entry.img.rel);
      if (hidden.includes(entry.img.name)) {
        hiddenHere.push(entry.img.name);
        continue;
      }
      list.push({
        src: `img?p=${encodeURIComponent(entry.img.rel)}`,
        label: entry.kind === 'group' ? groupLabel(entry.img.name) : labelOf(entry.img.name, outfit.id, outfit.name),
        kind: entry.kind,
        cat: entry.cat,
        name: entry.img.name,
        private: entry.cat === 'private',
      });
    }

    const groups = cats
      .map((cat) => ({
        key: cat.key,
        label: cat.label,
        hint: cat.hint,
        images: list.filter((image) => image.cat === cat.key),
      }))
      .filter((group) => group.images.length > 0);

    const coverImage = list.find((image) => !image.private) || null;
    const privateCount = list.filter((image) => image.private).length;

    bucket.items.push({
      id: outfit.id,
      name: outfit.name,
      summary: summarize(outfit.desc),
      detail: outfit.desc.replace(/气质[:：]/, '\n气质：'),
      cover: coverImage ? coverImage.src : null,
      images: list,
      groups,
      hiddenImages: hiddenHere,
      privateCount,
      count: list.length,
      folder: outfit.folder,
      hasFolder: Boolean(outfit.folder),
      wear: wearMap.get(outfit.id) || null,
      wearLabel: WEAR_LABEL[wearMap.get(outfit.id)] || '未定',
      fields: buildFields(outfit.desc, overlayAll[outfit.id]),
      fieldsText: outfitTextOf(outfit.desc),
      missingImages: list.length === 0,
      overlayNote: overlayAll[outfit.id]?.note || null,
      aliases: Array.isArray(overlayAll[outfit.id]?.aliases) ? overlayAll[outfit.id].aliases : [],
    });
  }

  const flat = series.flatMap((bucket) => bucket.items);
  const flatById = new Map(flat.map((item) => [item.id, item]));
  for (const item of flat) {
    const same = /衣服同\s*([A-Z]-\d{1,2}[a-z]?)/.exec(item.detail || '');
    if (same && flatById.has(same[1])) item.inheritFrom = same[1];
  }
  for (let round = 0; round < 3; round += 1) {
    let changed = false;
    for (const item of flat) {
      if (!item.inheritFrom) continue;
      const source = flatById.get(item.inheritFrom);
      if (!source?.fields?.length) continue;
      const have = new Set(item.fields.map((field) => field.key));
      for (const field of source.fields) {
        if (have.has(field.key)) continue;
        item.fields.push({ ...field, inherited: source.id });
        changed = true;
      }
      item.fields = FIELD_KINDS
        .filter((kind) => item.fields.some((field) => field.key === kind.key))
        .map((kind) => item.fields.find((field) => field.key === kind.key));
    }
    if (!changed) break;
  }

  // 标签放在继承之后算：继承来的字段（X-07b 之类）也要算进可搜的词里。
  for (const item of flat) {
    item.manualTags = overlayAll[item.id]?.tags || [];
    item.tags = computeTags(item, item.fields, item.manualTags);
    const worn = composeWorn(item.fields);
    if (worn) item.fieldsText = worn;
  }

  for (const bucket of series) {
    bucket.items.sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    bucket.count = bucket.items.length;
    bucket.withImages = bucket.items.filter((item) => item.count > 0).length;
    bucket.missingImages = bucket.items.filter((item) => item.count === 0).length;
    bucket.wearableOut = bucket.items.filter((item) => item.wear === 'out').length;
  }

  const present = new Set();
  for (const bucket of series) {
    for (const item of bucket.items) for (const field of item.fields) present.add(field.key);
  }

  return {
    generatedAt: new Date().toISOString(),
    root: GALLERY,
    total: series.reduce((sum, s) => sum + s.items.length, 0),
    fieldKinds: FIELD_KINDS.filter((kind) => present.has(kind.key)).map((kind) => ({ key: kind.key, label: kind.label })),
    photoCats: cats.map((cat) => ({ key: cat.key, label: cat.label, hint: cat.hint })),
    state: await readState(),
    series: series.filter((s) => s.items.length > 0),
  };
}

async function getData(force) {
  if (!force && cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  const data = await build();
  cache = { at: Date.now(), data };
  return data;
}

async function serveImage(req, res, relPath, unlocked = false) {
  let decoded = '';
  try {
    decoded = decodeURIComponent(relPath || '');
  } catch {
    decoded = String(relPath || '');
  }
  if (!decoded || decoded.includes('\0')) {
    res.writeHead(400);
    res.end('bad path');
    return;
  }
  const abs = resolve(GALLERY, decoded);
  if (!insideGallery(abs)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  const ext = extname(abs).toLowerCase();
  if (!IMG_EXT.has(ext)) {
    res.writeHead(415);
    res.end('unsupported type');
    return;
  }
  if (!unlocked) {
    const name = basename(abs);
    const overlay = await readOverlay();
    const forced = Object.values(overlay).find((entry) => entry?.photos && entry.photos[name]);
    if (forced ? forced.photos[name] === 'private' : photoCatOf(name, decoded) === 'private') {
      res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('locked');
      return;
    }
  }
  let info;
  try {
    info = await stat(abs);
  } catch {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  if (!info.isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': 'public, max-age=86400' });
    res.end();
    return;
  }
  const body = await readFile(abs);
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'content-length': body.length,
    'cache-control': 'public, max-age=86400',
    etag,
  });
  res.end(req.method === 'HEAD' ? undefined : body);
}


/* ---------- 结构化字段：把「关键件」拆成 发型/上衣/下衣/袜/鞋/配饰/包 ---------- */

const HERE = dirname(fileURLToPath(import.meta.url));
/** 用户改的那份（编辑字段/加标签都落这里，重装插件也不会丢）。 */
const STATE_DIR = process.env.YUYU_WARDROBE_STATE || join(homedir(), '.dsh', 'yuyu-wardrobe');
const OVERLAY_FILE = join(STATE_DIR, 'fields.json');
const OVERLAY_SEED = join(HERE, 'data/fields.json');
/** 此刻-穿着.md 的位置也跟着 ROOT 走（换电脑只改 root）。 */
const stateFile = () => join(ROOT, 'ctx', '状态', '此刻-穿着.md');

/* ---------- 私密照：密码 + 解锁令牌 ---------- */

const SETTINGS_FILE = join(STATE_DIR, 'settings.json');
const UNLOCK_TTL_MS = 12 * 60 * 60 * 1000;
/** token -> 过期时间。放内存，重启就失效。 */
const unlockTokens = new Map();

async function readSettings() {
  const text = await readText(SETTINGS_FILE).catch(() => '');
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

async function writeSettings(next) {
  await writeTextAtomic(SETTINGS_FILE, `${JSON.stringify(next, null, 2)}\n`);
}

function hashPassword(password, salt) {
  return scryptSync(String(password), String(salt), 32).toString('hex');
}

function passwordMatches(password, settings) {
  if (!settings?.hash || !settings?.salt) return false;
  const want = Buffer.from(settings.hash, 'hex');
  const got = Buffer.from(hashPassword(password, settings.salt), 'hex');
  return want.length === got.length && timingSafeEqual(want, got);
}

/** 设密码；已经有密码时必须给对的旧密码。 */
async function setPassword({ password, current }) {
  const pass = String(password ?? '');
  if (pass.trim().length < 4) throw new Error('密码至少 4 位');
  const settings = await readSettings();
  if (settings.hash && !passwordMatches(current, settings)) throw new Error('旧密码不对');
  const salt = randomBytes(16).toString('hex');
  const next = {
    ...settings,
    salt,
    hash: hashPassword(pass, salt),
    updatedAt: new Date().toISOString(),
  };
  await writeSettings(next);
  unlockTokens.clear();          // 换密码 = 所有旧令牌作废
  return { hasPassword: true, updatedAt: next.updatedAt };
}

function pruneTokens() {
  const now = Date.now();
  for (const [token, expiry] of unlockTokens) if (expiry <= now) unlockTokens.delete(token);
}

function issueToken() {
  pruneTokens();
  const token = randomBytes(24).toString('hex');
  const expiresAt = Date.now() + UNLOCK_TTL_MS;
  unlockTokens.set(token, expiresAt);
  return { token, expiresAt };
}

function tokenValid(token) {
  if (!token) return false;
  const expiry = unlockTokens.get(token);
  if (!expiry) return false;
  if (expiry <= Date.now()) {
    unlockTokens.delete(token);
    return false;
  }
  return true;
}

/** 一条图是不是私密：文件名规则 + overlay 里手工改过的分类优先。 */
function isPrivateImage(name, photos) {
  if (photos && photos[name]) return photos[name] === 'private';
  return photoCatOf(name) === 'private';
}

function withLock(data, unlocked) {
  const mark = (image) => (image.private ? { ...image, src: null, locked: true } : image);
  return {
    ...data,
    unlocked,
    series: unlocked ? data.series : data.series.map((bucket) => ({
      ...bucket,
      items: bucket.items.map((item) => ({
        ...item,
        cover: item.cover && item.images.some((image) => image.src === item.cover && image.private) ? null : item.cover,
        images: item.images.map(mark),
        groups: item.groups.map((group) => (
          group.key === 'private' ? { ...group, images: group.images.map(mark) } : group
        )),
      })),
    })),
  };
}


const WEAR_LABEL = { out: '能出门', home: '只在家', once: '只一次' };

/** 标签：搜「长靴」要能搜到写着「白高筒靴」的那套，所以按词义归类。 */
const TAG_RULES = [
  { tag: '长靴', re: /长靴|高筒靴|过膝靴|筒到大腿|及膝靴|马靴|骑士靴|靴筒高/ },
  { tag: '短靴', re: /短靴|踝靴|堆堆靴|切尔西|袜靴/ },
  { tag: '过膝袜', re: /过膝袜|大腿袜|过膝棉袜/ },
  { tag: '中筒袜', re: /中筒袜|小腿袜/ },
  { tag: '丝袜', re: /丝袜|黑丝|白丝|灰丝|连裤袜|渔网/ },
  { tag: '棉袜', re: /棉袜/ },
  { tag: '光脚', re: /光脚|赤脚|没穿袜/ },
  { tag: '乐福鞋', re: /乐福/ },
  { tag: '高跟鞋', re: /高跟鞋|细跟|高跟|粗跟|方跟/ },
  { tag: '凉鞋', re: /凉鞋|拖鞋|凉拖/ },
  { tag: '短裙', re: /短裙|迷你裙|短摆|包臀裙/ },
  { tag: '长裙', re: /长裙|及踝|到脚踝/ },
  { tag: '百褶', re: /百褶/ },
  { tag: '旗袍', re: /旗袍/ },
  { tag: '睡裙', re: /睡裙|睡衣/ },
  { tag: '浴衣', re: /浴衣|和服/ },
  { tag: '吊带', re: /吊带|挂脖|halter/i },
  { tag: '露肩', re: /露肩|一字肩|斜肩|off[- ]?shoulder/i },
  { tag: '露腰', re: /露腰|短到肋骨|露整段腰|露脐/ },
  { tag: '针织', re: /针织|毛衣|粗针/ },
  { tag: '开衫', re: /开衫/ },
  { tag: '西装', re: /西装|西裤|套裙/ },
  { tag: '衬衫', re: /衬衫|衬衣|立领/ },
  { tag: '外套', re: /大衣|风衣|外套|夹克/ },
  { tag: '披发', re: /披发|散着头发/ },
  { tag: '马尾', re: /马尾/ },
  { tag: '盘发', re: /盘发|盘髻|丸子头/ },
  { tag: '项圈', re: /项圈|choker/i },
  { tag: '腰带', re: /腰带|皮带|腰封/ },
  { tag: '包', re: /拎包|背包|方包|单肩包|手提包|手袋|斜挎/ },
  { tag: '黑色', re: /黑/ },
  { tag: '白色', re: /白/ },
  { tag: '红色', re: /红/ },
  { tag: '蓝色', re: /蓝/ },
  { tag: '绿色', re: /绿/ },
  { tag: '棕色', re: /棕|咖啡色|驼/ },
  { tag: '米色', re: /米白|米色|燕麦|奶油|奶白/ },
  { tag: '灰色', re: /灰/ },
  { tag: '卡其', re: /卡其/ },
  { tag: '通勤', re: /通勤|工位|办公室|上班/ },
  { tag: '宴会', re: /宴会|晚宴|礼服/ },
  { tag: '居家', re: /家居|在家里|睡|浴缸/ },
  { tag: '制服', re: /制服|校服|校|领结/ },
  { tag: 'Cosplay', re: /cos|扮别人|谕女|角色/i },
];

/** 一句话版本：按穿上身的顺序拼，出图就照这一行。 */
const WORN_ORDER = ['top', 'dress', 'bottom', 'legs', 'shoes', 'acc', 'bag'];

function composeWorn(fields) {
  const valueOf = (key) => (fields || []).find((field) => field.key === key)?.value || '';
  const pieces = WORN_ORDER.map(valueOf).filter(Boolean);
  const hair = valueOf('hair');
  const body = pieces.join('＋');
  if (!body) return hair;
  return hair ? `${body}；${hair}` : body;
}

/** 自动标签 + 手工标签（data/fields.json 里那套的 tags 数组）。 */function computeTags(outfit, fields, extra = []) {
  const text = [outfit.name, outfit.desc, ...(fields || []).map((field) => field.value)].join(' ');
  const tags = TAG_RULES.filter((rule) => rule.re.test(text)).map((rule) => rule.tag);
  for (const tag of extra) {
    const clean = stripMd(String(tag || '')).trim();
    if (clean) tags.push(clean);
  }
  return [...new Set(tags)];
}

const FIELD_KINDS = [
  { key: 'hair', label: '发型', re: /(头发|马尾|盘发|盘髻|刘海|辫|披发|发夹|发圈|发饰|齐肩|半盘)/ },
  { key: 'legs', label: '袜', re: /(袜|黑丝(?!质)|白丝(?!质)|灰丝(?!质)|连裤|打底裤)/ },
  { key: 'shoes', label: '鞋', re: /(靴|鞋|乐福|高跟|细跟|拖鞋|凉拖)/ },
  { key: 'dress', label: '连身', re: /(连身|连衣裙|吊带裙|浴衣|睡裙|旗袍|和服)/ },
  { key: 'bottom', label: '下衣', re: /(裙|裤|短摆|热裤|摆)/ },
  { key: 'bag', label: '包', re: /(拎包|背包|方包|大包|手提包|手袋|斜挎)/ },
  { key: 'top', label: '上衣', re: /(上衣|衬衫|毛衣|针织|开衫|吊带|背心|夹克|外套|大衣|西装|披肩|马甲|内搭|打底|T恤|卫衣|衬衣|罩衫|袍)/ },
  { key: 'acc', label: '配饰', re: /(项圈|皮带|腰带|项链|耳环|戒指|蝴蝶结|眼镜|围巾|帽子|手套|长枪|红缨|银链|铁链|链条|腰链|领带|发带|发饰|臂环)/ },
];

/** 只在括号外切分：括号里的「、」「＋」是细节，不是分件。 */
function splitTopLevel(text) {
  const parts = [];
  let depth = 0;
  let buffer = '';
  for (const char of text) {
    if (char === '（' || char === '(' || char === '【') depth += 1;
    else if (char === '）' || char === ')' || char === '】') depth = Math.max(0, depth - 1);
    if (depth === 0 && /[＋+；;。，、]/.test(char)) {
      if (buffer.trim()) parts.push(buffer.trim());
      buffer = '';
      continue;
    }
    buffer += char;
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}

/** 一段里同时有鞋和袜时（「乐福鞋白棉袜」）拆成两条。 */
const SOCK_RE = /(白棉袜|黑棉袜|棉袜|渔网袜|丝袜|连裤袜|过膝袜|短袜|长袜|黑丝(?!质)|白丝(?!质)|灰丝(?!质)|袜)/;

function splitSocks(chunk) {
  const hit = SOCK_RE.exec(chunk);
  if (!hit || hit.index === 0) return [chunk];
  const before = chunk.slice(0, hit.index).trim();
  const after = chunk.slice(hit.index).trim();
  if (!after || !/鞋|靴|乐福|高跟|细跟/.test(before)) return [chunk];
  return [before, after];
}

/** 认品类时只看括号外的主语：`细黑皮项圈（藏在毛衣领口里）` 别被「毛衣」抢走。 */
function subjectOf(chunk) {
  return chunk.replace(/（[^）]*）|\([^)]*\)/g, '').trim() || chunk.trim();
}

/** 「关键件」→ 分件：砍掉「气质：」后的形容词，按括号外的 ＋；。 拆，认不出品类的丢掉。 */
function splitPieces(desc) {
  const text = stripMd(desc).split(/气质[:：]/)[0];
  const pieces = [];
  for (const chunk of splitTopLevel(text)) {
    if (/只换状态|设定 ctx|^衣服同|^状态|原名|已撤|^账上|^衣服|^后摆|^尾巴|^缝|^靴子没脱|^眼睛|^脸红/.test(chunk)) continue;
    for (const subRaw of splitSocks(chunk)) {
      const sub = subRaw.replace(/^[^：:]{1,10}那套[：:]/, '').trim();
      const kind = FIELD_KINDS.find((item) => item.re.test(subjectOf(sub)));
      if (kind) pieces.push({ key: kind.key, label: kind.label, text: sub });
    }
  }
  return pieces;
}

/** 合并清单自动拆分 + data/fields.json 人工补的字段。 */
function buildFields(desc, overlay) {
  const auto = splitPieces(desc);
  const merged = new Map();
  for (const piece of auto) {
    if (!merged.has(piece.key)) merged.set(piece.key, []);
    merged.get(piece.key).push(piece.text);
  }
  const extra = overlay?.extra || [];
  if (overlay?.fields) {
    for (const [key, value] of Object.entries(overlay.fields)) {
      const label = FIELD_KINDS.find((item) => item.key === key)?.label || key;
      const list = Array.isArray(value) ? value : [value];
      merged.set(key, list.map((entry) => stripMd(entry)).filter(Boolean));
      void label;
    }
  }
  const fields = FIELD_KINDS
    .filter((kind) => merged.has(kind.key) && merged.get(kind.key).length)
    .map((kind) => ({ key: kind.key, label: kind.label, value: merged.get(kind.key).join('＋') }));
  for (const entry of extra) {
    const found = fields.find((field) => field.key === entry.key);
    if (found) found.value = `${found.value}＋${stripMd(entry.text)}`;
    else fields.push({ key: entry.key, label: entry.label || '其他', value: stripMd(entry.text) });
  }
  return fields;
}

/** 清单第九节：| 编号 | 名字 | 能不能 | */
function parseWear(text) {
  const map = new Map();
  const lines = String(text || '').split(/\r?\n/);
  let inside = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (/^##\s/.test(line)) {
      inside = /^##\s*九、/.test(line);
      continue;
    }
    if (!inside || !line.startsWith('|')) continue;
    if (/^\|[\s|:-]+\|$/.test(line)) continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => stripMd(cell));
    const id = /^([A-Z]-\d{1,2}[a-z]?)$/.exec(cells[0] || '');
    if (!id) continue;
    const verdict = cells[cells.length - 1] || '';
    let level = null;
    if (verdict.includes('能出门')) level = 'out';
    else if (verdict.includes('只在家')) level = 'home';
    else if (verdict.includes('只一次')) level = 'once';
    if (level) map.set(id[1], level);
  }
  for (const id of ['X-07a', 'X-07b', 'X-08', 'X-08b', 'X-08c']) {
    if (!map.has(id)) map.set(id, 'once');
  }
  return map;
}

/** 读「此刻-穿着.md」的「现在」那一行。 */
function parseState(text) {
  const lines = String(text || '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    const head = /^\*\*现在（([^）]*)）\*\*：/.exec(line);
    if (!head) continue;
    const rest = line.slice(head[0].length);
    const dash = rest.indexOf('——');
    const label = stripMd(dash >= 0 ? rest.slice(0, dash) : rest);
    const body = dash >= 0 ? rest.slice(dash + 2) : '';
    const idMatch = /（([A-Z]-\d{1,2}[a-z]?)）/.exec(label);
    const name = stripMd(label.replace(/（[^）]*）/, ''));
    const dot = body.indexOf('。');
    return {
      line: index,
      when: head[1].trim(),
      id: idMatch ? idMatch[1] : null,
      name,
      outfitText: stripMd(dot >= 0 ? body.slice(0, dot) : body),
      stateText: dot >= 0 ? body.slice(dot + 1).trim() : '',
      raw: line,
    };
  }
  return null;
}

function stampNow(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** 历史表：`| 时间 | 整套 | 上身 | 下身 | 脚 | 备注 |`，倒序。 */
function parseHistory(text) {
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex((line) => /^##\s*历史/.test(line.trim()));
  if (start < 0) return [];
  const rows = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^##\s/.test(line)) break;
    if (!line.startsWith('|')) continue;
    if (/^\|[-\s|:]+\|$/.test(line)) continue;
    const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => stripMd(cell));
    if (cells.length < 2 || /^时间$/.test(cells[0])) continue;
    rows.push({
      when: cells[0] || '',
      whole: cells[1] || '',
      upper: cells[2] || '',
      lower: cells[3] || '',
      feet: cells[4] || '',
      note: cells[5] || '',
    });
  }
  return rows;
}

async function readState() {
  const text = await readText(stateFile()).catch(() => '');
  const parsed = parseState(text);
  if (!parsed) return { file: stateFile(), missing: true, history: parseHistory(text) };
  return { ...parsed, file: stateFile(), history: parseHistory(text) };
}

/** 换衣服：改「现在」那一行 + 在历史表里加一行。只改这两处，别的字节不动。 */
async function wearNow({ id, state: stateText, when }) {
  const outfit = (await getData(false)).series
    .flatMap((bucket) => bucket.items)
    .find((item) => item.id === id);
  if (!outfit) throw new Error(`衣橱里没有 ${id}`);

  const raw = await readFile(stateFile(), 'utf8').catch(() => '');
  const eolIn = raw
    ? (raw.includes('\r\n') ? '\r\n' : '\n')
    : (process.platform === 'win32' ? '\r\n' : '\n');
  const original = raw.replace(/\r\n?/g, '\n');
  const parsed = parseState(original);
  if (!parsed) throw new Error('此刻-穿着.md 里没找到「现在」那一行');

  const stamp = (when && String(when).trim()) || stampNow();
  const lines = original.split(/\r?\n/);
  const note = String(stateText ?? parsed.stateText ?? '').trim();

  // 「现在」那一行要能直接拿去出图：按 上衣→连身→下衣→袜→鞋→配饰→包 拼，缺一件图就画错。
  const pieces = briefFields(outfit, ['top', 'dress', 'bottom', 'legs', 'shoes', 'acc', 'bag'], 30);
  const worn = pieces.length ? pieces.join('＋') : (outfit.fieldsText || outfit.summary || '');
  const hair = briefFields(outfit, ['hair'], 20)[0];
  lines[parsed.line] = `**现在（${stamp}）**：**${outfit.name}（${outfit.id}）**——${worn}${hair ? `；${hair}` : ''}。${note}`.trim();

  // 历史表是六列窄表，只取每件的第一小段，袜子跟鞋同归「脚」。
  const upper = briefFields(outfit, ['top'], 24)[0] || '—';
  const dress = briefFields(outfit, ['dress'], 18)[0];
  const lower = briefFields(outfit, ['bottom'], 24)[0] || '—';
  const feet = [...briefFields(outfit, ['legs'], 16), ...briefFields(outfit, ['shoes'], 22)].join('＋') || '—';
  const row = `| ${stamp} | **${outfit.name}（${outfit.id}）** | ${upper}${dress ? `（${dress}）` : ''} | ${lower} | ${feet} | ${note || '衣橱里点的「穿这套」'} |`;

  const historyAt = lines.findIndex((line) => /^##\s*历史/.test(line.trim()));
  if (historyAt >= 0) {
    let insertAt = -1;
    for (let index = historyAt; index < lines.length; index += 1) {
      if (/^\|[\s|:-]+\|$/.test(lines[index].trim())) {
        insertAt = index + 1;
        break;
      }
    }
    if (insertAt > 0) lines.splice(insertAt, 0, row);
  }

  await writeTextAtomic(stateFile(), lines.join(eolIn));
  return readState();
}

/** 取某品类字段的第一小段（表格/一行版用）：括号里不切、不切出半个括号。 */
function briefFields(outfit, keys, max = 24) {
  const brief = (value) => {
    const text = stripMd(String(value || ''));
    let out = '';
    let depth = 0;
    for (const ch of text) {
      if (ch === '（' || ch === '(') depth += 1;
      else if (ch === '）' || ch === ')') depth = Math.max(0, depth - 1);
      else if (depth === 0 && /[，,；;。]/.test(ch)) break;
      out += ch;
      if (out.length >= max) break;
    }
    out = out.trim();
    if (depth > 0) {
      const openAt = Math.max(out.lastIndexOf('（'), out.lastIndexOf('('));
      if (openAt >= 0) out = out.slice(0, openAt).trim();
    }
    if (out.length >= max) out = `${out.replace(/[，,；;。、]$/, '')}…`;
    return out;
  };
  return keys
    .map((key) => brief((outfit.fields || []).find((field) => field.key === key)?.value))
    .filter(Boolean);
}

/** 用户那份 overlay：~/.dsh/yuyu-wardrobe/fields.json，第一次从插件自带的那份种子复制过来。 */
async function readOverlay() {
  let text = await readText(OVERLAY_FILE).catch(() => '');
  if (!text.trim()) {
    const seed = await readText(OVERLAY_SEED).catch(() => '');
    if (seed.trim()) {
      await mkdir(STATE_DIR, { recursive: true }).catch(() => {});
      await writeFile(OVERLAY_FILE, seed, 'utf8').catch(() => {});
      text = seed;
    }
  }
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** 保存一套的字段/标签：写用户那份 overlay（原子），清缓存，返回重算后的这一套。 */
/** 后台：整份图库的平铺清单（每张图一条）。 */
async function gallery() {
  const [data, overlay] = await Promise.all([getData(false), readOverlay()]);
  const cats = catList(overlay);
  const rows = [];
  for (const bucket of data.series) {
    for (const item of bucket.items) {
      const photos = overlay[item.id]?.photos || {};
      const hidden = Array.isArray(overlay[item.id]?.hidden) ? overlay[item.id].hidden : [];
      for (const image of item.images) {
        rows.push({
          outfitId: item.id,
          outfitName: item.name,
          name: image.name,
          label: image.label,
          src: image.src,
          cat: image.cat,
          manual: Boolean(photos[image.name]),
        });
      }
      for (const name of hidden) {
        rows.push({
          outfitId: item.id, outfitName: item.name, name,
          label: labelOf(name, item.id, item.name), src: null, cat: 'hidden',
          manual: true, hidden: true,
        });
      }
    }
  }
  return { cats, rows, total: rows.length };
}

/** 后台：改分类表（改名 / 排序 / 加新类）。 */
async function saveCats(list) {
  const clean = (Array.isArray(list) ? list : [])
    .map((row) => ({
      key: String(row?.key || '').trim().replace(/[^A-Za-z0-9_-]/g, ''),
      label: stripMd(row?.label || '').slice(0, 12),
      hint: stripMd(row?.hint ?? '').slice(0, 40),
    }))
    .filter((row) => row.key && row.label);
  if (!clean.length) throw new Error('分类列表是空的');
  const seen = new Set();
  const dedup = clean.filter((row) => (seen.has(row.key) ? false : (seen.add(row.key), true)));
  const overlay = await readOverlay();
  overlay.meta = { ...(overlay.meta || {}), cats: dedup };
  await writeTextAtomic(OVERLAY_FILE, `${JSON.stringify(overlay, null, 2)}\n`);
  cache = { at: 0, data: null };
  return dedup;
}

/** 读「故事」要扫的地方（都是小 md，不含会话导出）。 */
const MEMORY_DIRS = [
  'ctx/记忆', 'ctx/记录', 'ctx/状态', 'ctx/旅行', 'ctx/设定', 'ctx/资料',
  'ctx/同步', 'xingxi', '合并-总记忆线', 'ctx/历史',
];
/** 改过名的套：老名字也认，不然改名前的记录搜不到。 */
const BUILT_IN_ALIASES = {
  'G-01': ['白靴套', '白靴'],
  'G-02': ['黑靴套', '黑靴'],
};
const STORY_SKIP = /README|怎么合|更新日志|插件-|索引\.md$|世界快照|来源对照|每天的设备/;

async function listMdFiles(dir, depth = 0) {
  if (depth > 3) return [];
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const out = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await listMdFiles(abs, depth + 1));
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(abs);
  }
  return out;
}

const dateOf = (text) => {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
};

/** 设定集按 `## ` 分节。 */
function splitSections(text) {
  const out = [];
  let current = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    const head = /^##\s+(.+)$/.exec(line.trim());
    if (head) {
      if (current) out.push(current);
      current = { heading: head[1].trim(), lines: [] };
      continue;
    }
    if (current) current.lines.push(line);
  }
  if (current) out.push(current);
  return out
    .map((section) => ({ heading: section.heading, text: cleanStory(section.lines.join('\n')) }))
    .filter((section) => section.text.length > 4)
    .slice(0, 8);
}

/** 故事正文：洗掉路径、文件名、markdown、引用块，只留人话。 */
function cleanStory(text) {
  return String(text || '')
    .replace(/<sub>[\s\S]*?<\/sub>/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`[^`]*`/g, ' ')
    .replace(/(ctx|合并-总记忆线|~\.dsh)[^\s，。；、）]*/g, ' ')
    .replace(/[A-Za-z0-9_-]+\.(md|json|jpg|jpeg|png|webp)/gi, ' ')
    .replace(/\*\*/g, '')
    .replace(/~~/g, '')
    .replace(/^[\s>*+\-\d.、]+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const pad2 = (value) => String(value).padStart(2, '0');

/** 从正文里认日期；认不到就用文件名里的日期。 */
function storyDate(text, file = '') {
  let m = /(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text || '');
  if (m) return `${m[1]}-${pad2(m[2])}-${pad2(m[3])}`;
  const year = (/(20\d{2})\s*年/.exec(text || '') || [])[1] || '2026';
  m = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/.exec(text || '');
  if (m) return `${year}-${pad2(m[1])}-${pad2(m[2])}`;
  m = /(?<!\d)(\d{1,2})\/(\d{1,2})(?!\d)/.exec(text || '');
  if (m) return `${year}-${pad2(m[1])}-${pad2(m[2])}`;
  return dateOf(file);
}

const storyKey = (text) => {
  let hash = 5381;
  const body = String(text || '').slice(0, 200);
  for (let index = 0; index < body.length; index += 1) hash = ((hash << 5) + hash + body.charCodeAt(index)) | 0;
  return `s${(hash >>> 0).toString(36)}`;
};

/** 这套的衣服都能怎么叫：正名 + 内置别名 + 自己在编辑里加的别名。 */
function namesOf(outfit, overlay) {
  const extra = Array.isArray(overlay?.[outfit.id]?.aliases) ? overlay[outfit.id].aliases : [];
  const list = [outfit.name, ...(BUILT_IN_ALIASES[outfit.id] || []), ...extra]
    .map((name) => String(name || '').trim())
    .filter((name) => name.length >= 2);
  return [...new Set(list)];
}

/** 编号归一：G-1 / g-1 → G-01；X-07a 保留小写尾。 */
function normId(value) {
  const text = String(value || '').trim();
  const hit = text.match(/^([A-Za-z])-?(\d{1,2})\s*([a-z]?)$/);
  if (!hit) return text.toUpperCase();
  return `${hit[1].toUpperCase()}-${String(Number(hit[2])).padStart(2, '0')}${hit[3]}`;
}

const mentions = (body, names) => names.some((name) => body.includes(name));

/** 故事要写成「那天上午穿着这套做了…；下午…」，不是原文摘抄。 */
const SLOTS = ['凌晨', '上午', '中午', '下午', '傍晚', '晚上', '夜里'];
const ACT_RE = /(出门|去|到|走|坐|站|听|看|吃|喝|买|拍|逛|试|跳|唱|睡|换|脱|穿|抱|吻|飞|登机|回|洗|躺|跪|趴|开|约|见|等|跑|爬|上|下|进|出|聊|笑|醒|起|刷|收|挑|付|打|带)/;
const PLACE_RE = /(香港|尖沙咀|旺角|启德|海港城|机场|酒店|演唱会|工位|公司|家里|房间|街上|店里|商场|咖啡店|餐厅|车上|地铁|飞机|床边|床上|桌上|沙发)/;
const META_RE = /(本鱼说|他说|我问|他问|汇报|文件|编号|这一行|设定|草稿|原文|摘|转录|待办|TODO|指令|提示|token|模型|插件|代码|报错|摘要)/;

function slotOf(sentence) {
  const clock = sentence.match(/(\d{1,2})[:：](\d{2})/);
  if (clock) {
    const hour = Number(clock[1]);
    if (hour < 5) return '凌晨';
    if (hour < 11) return '上午';
    if (hour < 13) return '中午';
    if (hour < 17) return '下午';
    if (hour < 19) return '傍晚';
    if (hour < 23) return '晚上';
    return '夜里';
  }
  if (/凌晨|半夜|零点/.test(sentence)) return '凌晨';
  if (/早上|清晨|上午|一早/.test(sentence)) return '上午';
  if (/中午|午饭|午饭前/.test(sentence)) return '中午';
  if (/下午|午后/.test(sentence)) return '下午';
  if (/傍晚|黄昏|日落/.test(sentence)) return '傍晚';
  if (/晚上|晚饭|入夜/.test(sentence)) return '晚上';
  if (/夜里|深夜/.test(sentence)) return '夜里';
  return '';
}

/** 把一段记忆改写成「时段，穿着这套，做了什么」。 */
function narrate(text) {
  const body = cleanStory(String(text || ''))
    .replace(/[「『][^」』]{0,400}[」』]/g, ' ')
    .replace(/（[^）]{0,120}）/g, ' ');
  const sentences = body.split(/[。；;！!？?\n]+/).map((line) => line.trim()).filter((line) => line.length >= 6);
  if (!sentences.length) return '';
  const bySlot = new Map();
  let carry = '';
  for (const [index, sentence] of sentences.entries()) {
    const slot = slotOf(sentence) || carry;
    if (slot) carry = slot;
    let score = 0;
    if (ACT_RE.test(sentence)) score += 3;
    if (PLACE_RE.test(sentence)) score += 2;
    if (/穿|这身|这套/.test(sentence)) score += 1;
    if (/(肩带|靴筒|筒身|铆钉|拉链|材质|剪裁|褶皱|鞋跟|厚底|内衬|版型|配色|设计|画师|立绘|三视图|设定)/.test(sentence)) score -= 3;
    if (META_RE.test(sentence)) score -= 5;
    if (sentence.length > 46) score -= 2;
    score -= index * 0.15;
    const bucket = slot || '不定时';
    const best = bySlot.get(bucket);
    if (!best || score > best.score) bySlot.set(bucket, { score, sentence: shorten(sentence, 46) });
  }
  const order = [...bySlot.entries()]
    .filter(([, hit]) => hit.score > 0)
    .sort((a, b) => {
      const rank = (name) => (name === '不定时' ? 99 : SLOTS.indexOf(name));
      return rank(a[0]) - rank(b[0]) || 0;
    });
  if (!order.length) return '';
  const pieces = order.slice(0, 4).map(([slot, hit]) => {
    const head = slot === '不定时' ? '' : `${slot}，`;
    return `${head}${hit.sentence}`;
  });
  let line = pieces.join('；');
  if (!/穿|这身|这套/.test(line)) line = line.replace(/^([^，]*，)?/, (head) => `${head || ''}穿着这套，`);
  line = line.replace(/本鱼/g, '鱼鱼').replace(/\s+/g, ' ').replace(/^[，、]/, '');
  return /[。！？]$/.test(line) ? line : `${line}。`;
}

function shorten(sentence, max) {
  const clean = sentence.replace(/^[，、。]+/, '').replace(/^（|）$/g, '').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const comma = Math.max(cut.lastIndexOf('，'), cut.lastIndexOf('、'));
  return `${comma > max * 0.5 ? cut.slice(0, comma) : cut}…`;
}

/** 把一份 md 切成「段落 + 它最近的日期标题」。 */
function storyChunks(text) {
  const out = [];
  let headingDate = '';
  let buffer = [];
  const flush = () => {
    const body = buffer.join('\n').trim();
    buffer = [];
    if (body) out.push({ text: body, date: headingDate });
  };
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^#{1,4}\s/.test(trimmed)) {
      flush();
      const dated = storyDate(trimmed, '');
      if (dated) headingDate = dated;
      continue;
    }
    if (!trimmed) { flush(); continue; }
    if (/^\s*[-*]\s/.test(line) && buffer.length) flush();
    buffer.push(line);
  }
  flush();
  return out;
}

/** 记忆库里跟这套有关的段落（候选），不去重历史表里已经有的。 */
async function storyCandidates(id, keyword = '') {
  const key = normId(id);
  const data = await getData(false);
  const outfit = data.series.flatMap((bucket) => bucket.items).find((item) => item.id === key);
  if (!outfit) throw new Error(`衣橱里没有 ${key}`);
  const overlay = await readOverlay();
  const picked = new Set((overlay[key]?.story || []).map((row) => row.key));
  const seen = new Set();
  const items = [];
  const names = namesOf(outfit, overlay);
  for (const rel of MEMORY_DIRS) {
    const files = await listMdFiles(join(ROOT, rel));
    for (const file of files) {
      if (STORY_SKIP.test(file)) continue;
      const text = await readText(file).catch(() => '');
      if (!text || text.length > 500_000) continue;
      for (const chunk of storyChunks(text)) {
        const body = cleanStory(chunk.text);
        if (body.length < 24 || body.length > 600) continue;
        const term = String(keyword || '').trim();
        if (term ? !body.includes(term) : (!body.includes(key) && !mentions(body, names))) continue;
        if (body.includes('|---') || (body.match(/\|/g) || []).length >= 4) continue;   // 表格不算故事
        if ((body.match(/[A-Z]-\d{2}/g) || []).length >= 3) continue;                    // 一列套装的清单
        if (/^\s*[>「]?\s*(以下是此前交流的摘要|摘要)/.test(body)) continue;
        const fingerprint = body.slice(0, 50);
        if (seen.has(fingerprint)) continue;
        seen.add(fingerprint);
        const score = (/穿|这身|一身|那天|第一次|出门|演唱会|旅行|去了|带到/.test(body) ? 3 : 0)
          + (/香港|苏州|日本|工位|家里|房间|街上|机场|酒店/.test(body) ? 2 : 0);
        const date = storyDate(chunk.text, '') || chunk.date || dateOf(file);
        const k = storyKey(`${date}|${body}`);
        if (picked.has(k)) continue;
        items.push({ key: k, date, text: body, score });
      }
    }
  }
  items.sort((a, b) => (b.score - a.score) || (b.date || '').localeCompare(a.date || ''));
  const out = [];
  const kept = new Set();
  for (const item of items) {
    const fingerprint = item.text.slice(0, 40);
    if (kept.has(fingerprint)) continue;
    kept.add(fingerprint);
    out.push(item);
    if (out.length >= 80) break;
  }
  return { id: key, name: outfit.name, items: out, scanned: items.length, keyword: String(keyword || '').trim(), aliases: names };
}

/** 存一条进故事（人挑进来的那些）。 */
async function storyPick({ id, items }) {
  const key = normId(id);
  const list = Array.isArray(items) ? items : [];
  const overlay = await readOverlay();
  const entry = overlay[key] && typeof overlay[key] === 'object' ? overlay[key] : {};
  const story = Array.isArray(entry.story) ? [...entry.story] : [];
  for (const row of list) {
    const text = cleanStory(row?.text);
    if (!text) continue;
    const date = String(row?.date || '').trim() || storyDate(text);
    const k = storyKey(`${date}|${text}`);
    if (story.some((item) => item.key === k)) continue;
    story.push({ key: k, date, text: text.slice(0, 600), addedAt: new Date().toISOString() });
  }
  entry.story = story;
  entry.editedAt = new Date().toISOString();
  overlay[key] = entry;
  await writeTextAtomic(OVERLAY_FILE, `${JSON.stringify(overlay, null, 2)}
`);
  cache = { at: 0, data: null };
  return storyFor(key);
}

/** 从故事里拿掉一条（只动 overlay 里的，历史表不碰）。 */
async function storyDrop({ id, key: rowKey }) {
  const key = normId(id);
  const overlay = await readOverlay();
  const entry = overlay[key] && typeof overlay[key] === 'object' ? overlay[key] : {};
  if (String(rowKey || '').startsWith('worn-')) {
    // 历史表里的行不改原文件，只在这套的 overlay 里标记不看
    const hidden = new Set(Array.isArray(entry.storyHidden) ? entry.storyHidden : []);
    hidden.add(rowKey);
    entry.storyHidden = [...hidden];
    delete entry.storyOverrides?.[rowKey];
  } else {
    entry.story = (Array.isArray(entry.story) ? entry.story : []).filter((row) => row.key !== rowKey);
  }
  entry.editedAt = new Date().toISOString();
  overlay[key] = entry;
  await writeTextAtomic(OVERLAY_FILE, `${JSON.stringify(overlay, null, 2)}
`);
  cache = { at: 0, data: null };
  return storyFor(key);
}

/** 改一条故事：手挑的直接改，历史表那行只存一份覆盖，不动原文件。 */
async function storyEdit({ id, key: rowKey, date, text }) {
  const key = normId(id);
  const rowKeyStr = String(rowKey || '');
  const nextText = cleanStory(text).slice(0, 600);
  if (!nextText) throw new Error('这条得写点东西');
  const overlay = await readOverlay();
  const entry = overlay[key] && typeof overlay[key] === 'object' ? overlay[key] : {};
  const nextDate = String(date || '').trim() || storyDate(nextText);
  if (rowKeyStr.startsWith('worn-')) {
    const overrides = entry.storyOverrides && typeof entry.storyOverrides === 'object' ? { ...entry.storyOverrides } : {};
    overrides[rowKeyStr] = { date: nextDate, text: nextText };
    entry.storyOverrides = overrides;
  } else {
    const story = Array.isArray(entry.story) ? [...entry.story] : [];
    const at = story.findIndex((row) => row.key === rowKeyStr);
    if (at < 0) throw new Error('故事里没有这一条');
    story[at] = { ...story[at], date: nextDate, text: nextText, editedAt: new Date().toISOString() };
    entry.story = story;
  }
  entry.editedAt = new Date().toISOString();
  overlay[key] = entry;
  await writeTextAtomic(OVERLAY_FILE, `${JSON.stringify(overlay, null, 2)}
`);
  cache = { at: 0, data: null };
  return storyFor(key);
}

/** 这套衣服的故事：设定集里的分节 + 按时间排的经历 + 挑进来的记忆。 */
/** 让模型把一条记忆改写成「那天上午，穿着这套，做了什么」。 */
async function rewriteStory(ctx, { id, key }) {
  const llm = ctx?.get?.('llm');
  if (!llm) throw new Error('这台机器上没有 llm 服务，改不了');
  const data = await getData(false);
  const outfit = data.series.flatMap((bucket) => bucket.items).find((item) => item.id === normId(id));
  if (!outfit) throw new Error(`衣橱里没有 ${id}`);
  const overlay = await readOverlay();
  const entry = overlay[outfit.id] || {};
  let raw = '';
  if (String(key).startsWith('worn-')) {
    const state = await readState();
    const row = (state.history || []).find((item) => `worn-${item.when}` === key);
    if (!row) throw new Error('找不到这条历史');
    raw = [row.upper, row.lower, row.feet, row.note].filter(Boolean).join(' · ');
  } else {
    raw = (entry.story || []).find((item) => item.key === key)?.text || '';
  }
  if (!raw) throw new Error('这条没有可改的原文');
  const config = readRewriteConfig();
  const system = [
    `你在整理「${outfit.name}（${outfit.id}）」这套衣服的穿着记录。`,
    '把下面这段记忆改写成一行时间线，不抄原文、不加解释。',
    '句式：那天上午，穿着这套，做A；下午，做B。',
    '硬规矩：只写原文里明确出现的时间、地点、动作；原文没写的不要补、不要推测；原文没说时段就不写时段；不写衣服的材质版型、不写对话原话、不写情绪分析；不超过 90 字；只输出这一行。',
  ].join('\n');
  let text = '';
  const stream = llm.stream({
    provider: config.provider,
    model: config.model,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: raw.slice(0, 1800) }] }],
    maxTokens: 2000,
    temperature: 0.1,
  });
  let failure = '';
  for await (const chunk of stream) {
    if (chunk.type === 'text-delta') text += chunk.text;
    if (chunk.type === 'finish' && chunk.reason?.kind === 'error') {
      failure = chunk.reason.failure?.message || 'stream error';
    }
    if (chunk.type === 'finish' && chunk.reason?.kind === 'aborted') {
      failure = chunk.reason.failure?.message || 'aborted';
    }
  }
  if (!text.trim() && failure) throw new Error(failure);
  const line = text.trim().replace(/^["「『]|["」』]$/g, '').split('\n')[0].trim();
  if (!line) throw new Error('模型没给东西');
  const next = { ...(entry.storyOverrides || {}) };
  next[key] = { ...(next[key] || {}), line };
  overlay[outfit.id] = { ...entry, storyOverrides: next, editedAt: new Date().toISOString() };
  await writeTextAtomic(OVERLAY_FILE, `${JSON.stringify(overlay, null, 2)}
`);
  cache = { at: 0, data: null };
  return { ok: true, key, line };
}

function readRewriteConfig() {
  return {
    provider: process.env.YUYU_WARDROBE_PROVIDER || 'deepseek-account',
    model: process.env.YUYU_WARDROBE_MODEL || 'deepseek-flash',
  };
}

async function storyFor(id) {
  const key = normId(id);
  if (!key) throw new Error('缺编号');
  const data = await getData(false);
  const outfit = data.series.flatMap((bucket) => bucket.items).find((item) => item.id === key);
  if (!outfit) throw new Error(`衣橱里没有 ${key}`);
  const overlay = await readOverlay();

  // 1) 设定集：ctx/衣橱/<编号>-<名字>/ 下最新的那份
  let design = null;
  if (outfit.folder) {
    const dir = join(ROOT, 'ctx', '衣橱', outfit.folder);
    const files = (await readdir(dir).catch(() => []))
      .filter((name) => /设定集|设定/.test(name) && name.endsWith('.md'))
      .sort();
    if (files.length) {
      const file = files[files.length - 1];
      const text = await readText(join(dir, file)).catch(() => '');
      design = { file, sections: splitSections(text) };
    }
  }

  // 2) 时间线：历史表里属于这套的行 + 人挑进来的；改过的套 override，删掉的进 storyHidden
  const entry = overlay[key] || {};
  const names = namesOf(outfit, overlay);
  const overrides = entry.storyOverrides && typeof entry.storyOverrides === 'object' ? entry.storyOverrides : {};
  const hiddenRows = new Set(Array.isArray(entry.storyHidden) ? entry.storyHidden : []);
  const nowState = await readState();
  const timeline = [];
  for (const row of nowState.history || []) {
    const whole = `${row.whole || ''}${row.note || ''}`;
    if (!whole.includes(key) && !mentions(whole, names)) continue;
    const rowKey = `worn-${row.when}`;
    if (hiddenRows.has(rowKey)) continue;
    const parts = [row.upper, row.lower, row.feet].map((part) => String(part || '').trim()).filter((part) => part && part !== '—');
    const text = [parts.join('＋'), row.note].filter(Boolean).join(' · ');
    const fixed = overrides[rowKey];
    timeline.push({
      key: rowKey,
      line: fixed?.line || narrate(fixed?.note ?? row.note ?? '') || narrate(fixed?.text || '') || '穿着这套',
      slot: slotOf(row.when || '') || '',
      date: (fixed?.date || row.when || '').slice(0, 10),
      kind: 'worn',
      from: '此刻-穿着',
      edited: Boolean(fixed),
      generated: Boolean(fixed?.line),
      text: fixed?.text || cleanStory(text) || '穿过这套',
      raw: fixed?.text || cleanStory(text) || '穿过这套',
    });
  }
  for (const row of entry.story || []) {
    timeline.push({
      key: row.key,
      date: row.date || '',
      kind: 'picked',
      from: '手挑',
      slot: slotOf(row.text || '') || '',
      line: (overrides[row.key]?.line) || narrate(row.text) || cleanStory(row.text),
      generated: Boolean(overrides[row.key]?.line),
      raw: cleanStory(row.text),
      text: row.text,
    });
  }
  timeline.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const pickedCount = (overlay[key]?.story || []).length;

  return {
    id: key,
    name: outfit.name,
    design,
    timeline,
    picked: pickedCount,
    historyCount: (nowState.history || []).length,
  };
}

async function saveEdit({ id, fields, tags, photos, hide, restore, aliases }) {
  const key = String(id || '').trim();
  if (!key) throw new Error('缺编号');
  const known = (await getData(false)).series.some((bucket) => bucket.items.some((item) => item.id === key));
  if (!known) throw new Error(`衣橱里没有 ${key}`);
  const overlay = await readOverlay();
  const entry = overlay[key] && typeof overlay[key] === 'object' ? overlay[key] : {};
  const nextFields = { ...(entry.fields || {}) };

  if (fields && typeof fields === 'object') {
    for (const [kind, value] of Object.entries(fields)) {
      const list = (Array.isArray(value) ? value : String(value ?? '').split('＋'))
        .map((part) => stripMd(String(part)).trim())
        .filter(Boolean);
      if (list.length) nextFields[kind] = list;
      else delete nextFields[kind];
    }
  }

  const nextEntry = { ...entry, fields: nextFields };
  if (Array.isArray(tags)) {
    const list = tags.map((tag) => stripMd(String(tag)).trim()).filter(Boolean);
    if (list.length) nextEntry.tags = [...new Set(list)];
    else delete nextEntry.tags;
  }
  if (Array.isArray(hide) || Array.isArray(restore)) {
    const names = new Set(Array.isArray(entry.hidden) ? entry.hidden : []);
    for (const name of (Array.isArray(hide) ? hide : [])) {
      const clean = String(name || '').trim();
      if (clean) names.add(clean);
    }
    for (const name of (Array.isArray(restore) ? restore : [])) {
      names.delete(String(name || '').trim());
    }
    if (names.size) nextEntry.hidden = [...names];
    else delete nextEntry.hidden;
  }
  if (photos && typeof photos === 'object') {
    const nextPhotos = { ...(entry.photos || {}) };
    for (const [name, cat] of Object.entries(photos)) {
      const key2 = String(name || '').trim();
      const value = String(cat || '').trim();
      if (!key2) continue;
      if (value && catList(overlay).some((item) => item.key === value)) nextPhotos[key2] = value;
      else delete nextPhotos[key2];          // 空 = 交回自动判断
    }
    if (Object.keys(nextPhotos).length) nextEntry.photos = nextPhotos;
    else delete nextEntry.photos;
  }
  if (aliases !== undefined) {
    const list = (Array.isArray(aliases) ? aliases : String(aliases ?? '').split(/[、,，\s]+/))
      .map((name) => stripMd(String(name)).trim())
      .filter(Boolean)
      .slice(0, 12);
    if (list.length) nextEntry.aliases = [...new Set(list)];
    else delete nextEntry.aliases;
  }
  nextEntry.editedAt = new Date().toISOString();
  overlay[key] = nextEntry;

  await writeTextAtomic(OVERLAY_FILE, `${JSON.stringify(overlay, null, 2)}
`);
  cache = { at: 0, data: null };

  const data = await getData(false);
  return data.series.flatMap((bucket) => bucket.items).find((item) => item.id === key) || null;
}

/** 出图用的那一行：砍掉「气质」与场外话，只留件。 */
function outfitTextOf(desc) {
  const head = stripMd(desc).split(/气质[:：]/)[0];
  const kept = head
    .split(/[；;]/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .filter((chunk, index) => index === 0 || FIELD_KINDS.some((kind) => kind.re.test(chunk)));
  return kept.join('＋');
}

function sendJson(res, code, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

export {
  build as __build, wearNow as __wear, saveEdit as __save,
  gallery as __gallery, storyFor as __story, saveCats as __saveCats,
  narrate as __narrate, rewriteStory as __rewrite, storyCandidates as __candidates, storyPick as __pick, storyDrop as __drop, storyEdit as __editStory,
  setPassword as __setPassword, issueToken as __issueToken, tokenValid as __tokenValid, withLock as __withLock,
};

export const inject = ['webServer'];

export function apply(ctx, config) {
  useRoot(config?.root);
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/yuyu-wardrobe',
    async handler(req, res) {
      const url = new URL(req.url || '/', 'http://localhost');
      try {
        const key = url.searchParams.get('k') || String(req.headers['x-wardrobe-key'] || '');
        const unlocked = tokenValid(key);
        if (url.pathname === '/yuyu-wardrobe/data.json') {
          const data = await getData(url.searchParams.has('refresh'));
          const settings = await readSettings();
          const payload = {
            ...withLock(data, unlocked),
            hasPassword: Boolean(settings.hash),
            passwordUpdatedAt: settings.updatedAt || null,
          };
          sendJson(res, 200, payload);
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/img') {
          await serveImage(req, res, url.searchParams.get('p'), unlocked || tokenValid(url.searchParams.get('k')));
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/settings' && req.method !== 'POST') {
          const settings = await readSettings();
          sendJson(res, 200, { hasPassword: Boolean(settings.hash), updatedAt: settings.updatedAt || null });
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/settings' && req.method === 'POST') {
          const payload = await readBody(req);
          const result = await setPassword(payload);
          sendJson(res, 200, result);
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/unlock' && req.method === 'POST') {
          const payload = await readBody(req);
          const settings = await readSettings();
          if (!settings.hash) {
            sendJson(res, 400, { error: '还没设密码' });
            return;
          }
          if (!passwordMatches(payload?.password, settings)) {
            sendJson(res, 401, { error: '密码不对' });
            return;
          }
          const token = issueToken();
          sendJson(res, 200, { ok: true, ...token });
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/lock' && req.method === 'POST') {
          if (key) unlockTokens.delete(key);
          sendJson(res, 200, { ok: true });
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/state') {
          const state = await readState();
          sendJson(res, 200, state);
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/wear' && req.method === 'POST') {
          const payload = await readBody(req);
          const state = await wearNow(payload).catch((error) => {
            ctx.logger?.warn?.(`[yuyu-wardrobe] wear failed: ${error.message}`);
            throw error;
          });
          cache = { at: 0, data: null };
          sendJson(res, 200, state);
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/gallery' && req.method === 'GET') {
          sendJson(res, 200, await gallery());
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/cats' && req.method === 'POST') {
          const payload = await readBody(req);
          sendJson(res, 200, { ok: true, cats: await saveCats(payload?.cats) });
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/story/candidates' && req.method === 'GET') {
          sendJson(res, 200, await storyCandidates(url.searchParams.get('id'), url.searchParams.get('q') || ''));
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/story/rewrite' && req.method === 'POST') {
          const payload = await readBody(req);
          sendJson(res, 200, await rewriteStory(ctx, payload || {}));
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/story/pick' && req.method === 'POST') {
          const payload = await readBody(req);
          sendJson(res, 200, await storyPick(payload || {}));
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/story/edit' && req.method === 'POST') {
          const payload = await readBody(req);
          sendJson(res, 200, await storyEdit(payload || {}));
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/story/drop' && req.method === 'POST') {
          const payload = await readBody(req);
          sendJson(res, 200, await storyDrop(payload || {}));
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/story' && req.method === 'GET') {
          sendJson(res, 200, await storyFor(url.searchParams.get('id')));
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/export' && req.method === 'GET') {
          const overlay = await readOverlay();
          const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
          const body = Buffer.from(`${JSON.stringify(overlay, null, 2)}\n`, 'utf8');
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'content-disposition': `attachment; filename="yuyu-wardrobe-fields-${stamp}.json"`,
            'content-length': String(body.length),
            'cache-control': 'no-store',
          });
          res.end(body);
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/import' && req.method === 'POST') {
          const payload = await readBody(req);
          if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
            sendJson(res, 400, { error: '这不像衣橱的备份文件' });
            return;
          }
          const incoming = payload.overlay && typeof payload.overlay === 'object' ? payload.overlay : payload;
          const current = await readOverlay();
          let merged = 0;
          for (const [id, entry] of Object.entries(incoming)) {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
            current[id] = { ...(current[id] || {}), ...entry };
            merged += 1;
          }
          await writeTextAtomic(OVERLAY_FILE, `${JSON.stringify(current, null, 2)}\n`);
          cache = { at: 0, data: null };
          sendJson(res, 200, { ok: true, merged, total: Object.keys(current).length });
          return;
        }
        if (url.pathname === '/yuyu-wardrobe/edit' && req.method === 'POST') {
          const payload = await readBody(req);
          const item = await saveEdit(payload);
          sendJson(res, 200, item || { ok: true, id: payload?.id });
          return;
        }
        res.writeHead(404);
        res.end('not found');
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.logger?.warn?.(`[yuyu-wardrobe] ${message}`);
        sendJson(res, 500, { error: message });
      }
    },
  }), 'yuyu-wardrobe: routes');
}
