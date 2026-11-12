# 鱼鱼的衣橱

DeepSeek Harness 的插件：左栏一个衣架图标，点开是整座衣橱。

- 大 tab 按系列（出门 G / 宴会 Y / 家里 H / 学生 S / 扮别人 C / 特殊场合 X），小 tab 按编号
- 每套：设定图 + 分类（设定整图 / 二次元 / 真人 / 相册橱窗 / 私密照 / 其他）+ 八类里外件明细
- 能出门筛选、随机一套、搜索（模糊匹配 + 标签）、缺图标记
- 「今天穿这套」直接改 `此刻-穿着.md` 的「现在」行并往历史表插一行
- 「这套的故事」：时间线、手挑记忆、模型改写、可改可删
- 「管理」面板：改分类名 / 排序 / 单张改归类 / 移出图库 / 备份恢复

## 依赖

**没有 npm 依赖。** 只用 Node 内置模块（`node:fs/promises`、`node:path`、`node:os`、`node:crypto`、`node:url`）和页面里已经有的 React（由 Harness 浏览器模块表提供，插件不自己装）。

- Node ≥ 20（Harness 自带的运行时即可）
- DeepSeek Harness ≥ 带 `webServer` 服务的版本（本插件用 `ctx.webServer.register` 挂静态路由）

## 装

```bash
# 在 Harness 里，指向这个目录
plugin_manager install_bundle target=file:/绝对路径/插件/yuyu-wardrobe
```

装完在 profile 的 `package.json` 里会多一条 `@local/yuyu-wardrobe`，`dsh.profile.bundles` 里多一项。
**注意：profile 下的 `node_modules/@local/yuyu-wardrobe/` 是真实拷贝，不是软链。** 改了源码要重新同步。

## 数据在哪

| 东西 | 位置 | 说明 |
|---|---|---|
| 图片 | `<workspace>/ctx/图库/衣橱图库/<编号>-<名字>/` | **只读**，插件不改名、不移动、不删除 |
| 清单 | `<workspace>/ctx/衣橱/衣橱清单.md` | **只读**，编号/名字/关键件的来源 |
| 设定集 | `<workspace>/ctx/衣橱/<编号>-<名字>/*设定*.md` | 读来当「故事」的设计部分 |
| 此刻穿着 | `<workspace>/ctx/状态/此刻-穿着.md` | **会写**：「现在」那一行 + 历史表插一行 |
| 记忆 | `<workspace>` 下 `ctx/{记忆,记录,状态,旅行,设定,资料,同步,历史}`、`xingxi/`、`合并-总记忆线/` | 只读，故事候选从这儿挑 |
| 你的编辑 | `~/.dsh/yuyu-wardrobe/fields.json` | 字段/标签/别名/图分类/故事；**不在工作区里**，重装不丢 |
| 密码 | `~/.dsh/yuyu-wardrobe/settings.json` | scrypt 加盐哈希，不是明文 |

## Windows 怎么填

工作区路径默认是 `~/Documents/deepseek-harness/default-workspace`。装在别处就改插件配置：

```yaml
# ~/.dsh/profiles/<profile>/cordis.patch.yml 该条目的 config
config:
  root: 'D:/deepseek-harness/default-workspace'
```

也可以用环境变量 `YUYU_WARDROBE_ROOT`。三种来源优先级：**config.root > 环境变量 > 默认 home 路径**。

路径写法：`D:/xxx`、`D:\xxx`、带引号、末尾带斜杠都能认（插件会去掉引号和尾部斜杠）。

## 为了 Windows 做的适配

1. **不拼死路径**：没有写死 `/Users/...`，一律 `path.join` + `os.homedir()`；根目录可配置。
2. **换行统一**：读 md 时把 `\r\n` 归成 `\n` 再解析表格和标题，不然 Windows 存的清单每行结尾都带 `\r`，表格会解析失败。
3. **写完保持原样**：写 `此刻-穿着.md` 时先看原文件是 CRLF 还是 LF，按原来的写回去；新文件在 Windows 上用 CRLF。
4. **原子写兜底**：`写临时文件 → rename` 在 Windows 上可能因为文件被占用报 EBUSY，失败就退回直接写，临时文件顺手删掉。
5. **路径越界判断**：不再用字符串前缀比（盘符大小写、`\` 和 `/` 会打架），改用 `path.relative` 判断相对路径是否以 `..` 开头。
6. **文件名大小写**：NTFS 不区分大小写，匹配一律 `toLowerCase()`；编号归一化单独处理尾缀（`X-07a` 不会被写成 `X-07A`）。
7. **路径分隔符**：对外给前端的图片路径统一用 `/`（URL 里本来就得是 `/`），服务端 `path.resolve` 会自己转回 `\`。
8. **中文文件名**：全程 `encodeURIComponent` / `decodeURIComponent`，解码失败不抛错、退回原串。

## 开发

```bash
# 语法
node --check index.js && node --check client.js

# 换套数据跑一遍（不碰真文件）
YUYU_WARDROBE_ROOT=/tmp/fixture YUYU_WARDROBE_STATE=/tmp/state node -e "
import('./index.js').then(async m => {
  console.log((await m.__build()).total, '套');
})"

# 改完同步进 profile（真实拷贝）
cp index.js client.js package.json ~/.dsh/profiles/desktop/node_modules/@local/yuyu-wardrobe/
```

改 host 半：`plugin_manager set_plugin target=include:yuyu-wardrobe enabled=false` 再 `true`。
改 client 半：页面 Cmd+R / F5。
