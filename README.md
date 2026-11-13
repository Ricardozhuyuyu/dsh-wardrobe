# dsh-wardrobe

一个 DeepSeek Harness 的衣橱插件：左边栏一个衣架图标，点开是整座衣橱。

- 大 tab 按系列分组，小 tab 按件数编号
- 每件衣服：图片分六类（设定整图 / 二次元 / 真人 / 相册橱窗 / 私密照 / 其他）、八类明细（发型 / 上衣 / 连身 / 下衣 / 袜 / 鞋 / 配饰 / 包）
- 能出门筛选、随机一套、搜索（模糊匹配 + 标签）、缺图标记
- 「今天穿这套」直接写当前穿着文件，并往历史表插一行
- 「这套的故事」：时间线、从记忆里挑片段、模型改写成一句话、可改可删
- 「管理」面板：改分类名 / 排序 / 单张改归类 / 移出图库 / 备份恢复
- 私密照：密码解锁，scrypt 加盐哈希，解锁后 12 小时内有效

## 依赖

**零 npm 依赖。** 只用 Node 内置模块（`node:fs/promises`、`node:path`、`node:os`、`node:crypto`、`node:url`），React 用页面里已经有的，插件不自己装。

- Node ≥ 20（Harness 自带运行时即可）
- DeepSeek Harness，需要带 `webServer` 服务（插件用它挂静态路由）

可选：想用「模型改写故事」，需要 Harness 配好一个可用的 LLM provider，默认读 `provider` / `model` 配置，没配就退回本地规则拼句子。

## 安装

```bash
plugin_manager install_bundle target=file:/绝对路径/dsh-wardrobe
```

装完 profile 的 `package.json` 会多一条 `dsh-wardrobe`，`dsh.profile.bundles` 里多一项。
profile 下的 `node_modules/dsh-wardrobe/` 是**真实拷贝**，不是软链；改了源码要重新同步或重装。

## 配置

全部走插件的 `config`（`cordis.patch.yml` 里那条），路径类也能用环境变量覆盖。

```yaml
- id: wardrobe
  name: 'dsh-wardrobe'
  config:
    root: ''                            # 工作区根目录；留空 = $DSH_WARDROBE_ROOT，再空 = ~/Documents/deepseek-harness/default-workspace
    paths:
      gallery: ctx/gallery/wardrobe     # 图片目录：一层套一文件夹，文件夹名 <编号>-<名字>
      list: ctx/gallery/list.md         # 清单表格（可缺，缺了只靠文件夹名）
      state: ctx/state/wearing.md       # 当前穿着 + 历史表，插件会写这个
    series:                             # 系列分组；不填就按编号首字母自动分，标签叫「系列 X」
      - { key: A, label: 日常, note: 上班上学 }
      - { key: B, label: 正式, note: 宴会 }
    memoryDirs:                         # 故事从这些目录里的 md 找线索
      - ctx/memory
      - ctx/records
    provider: deepseek-account          # 可选：改写用的 LLM
    model: deepseek-flash
```

图片目录结构：

```
ctx/gallery/wardrobe/
  A-01-示例/
    A01-示例-设定集整版.png
    A01-示例-01.jpg
```

图片归类靠文件名关键词：`设定集` → 设定整图，`二次元` / `anime` → 二次元，`真人` / `real` → 真人，`相册` / `album` / `合照` → 相册橱窗，`私密` / `private` → 私密照，`参考` / `ref` → 其他，其余按二次元算。归错了可以在「管理」里单张改，也可以写进 overlay 覆盖。

清单表格（可选）：

```md
| 编号 | 名字 | 关键件 | 图 |
|---|---|---|---|
| A-01 | 示例 | 白衬衫＋黑长裤＋乐福鞋；气质：干净 | 2 |
```

## 数据放在哪

| 东西 | 位置 | 读写 |
|---|---|---|
| 图片 | `<root>/<paths.gallery>/` | 只读，不改名不移动不删除 |
| 清单 | `<root>/<paths.list>` | 只读 |
| 设定集 | 图片文件夹里的 `*设定*.md` | 只读，当故事的设计部分 |
| 当前穿着 | `<root>/<paths.state>` | 会写：「现在」那一行 + 历史表插一行 |
| 记忆 | `<root>/<memoryDirs>` 下的 md | 只读，故事候选从这儿挑 |
| 你的编辑 | `~/.dsh/dsh-wardrobe/fields.json` | 字段/标签/别名/图分类/故事；不在工作区，重装不丢 |
| 密码 | `~/.dsh/dsh-wardrobe/settings.json` | scrypt 加盐哈希，不是明文 |

## Windows

默认根目录是 `~/Documents/deepseek-harness/default-workspace`，装在别处就填 `config.root`：

```yaml
config:
  root: 'D:/deepseek-harness/default-workspace'
```

路径带引号、末尾带斜杠、用反斜杠都能认。换行、原子写、路径越界判断、大小写、中文文件名都做过适配：读 md 时 CRLF 归一；写回时保持原文件换行风格；rename 被占用时退回直接写；越界判断用 `path.relative`。

## 开发

```bash
node --check index.js && node --check client.js

# 拿一套假数据跑一遍，不碰真文件
DSH_WARDROBE_ROOT=/tmp/fixture DSH_WARDROBE_STATE=/tmp/state node -e "
import('./index.js').then(async m => console.log((await m.__build()).total, 'outfits'))"

# 改完同步进 profile
cp index.js client.js package.json ~/.dsh/profiles/<profile>/node_modules/dsh-wardrobe/
```

改 host 半：`plugin_manager set_plugin target=include:<条目 id> enabled=false` 再 `true`。
改 client 半：页面刷新（Cmd+R / F5）。

## 许可

MIT。
