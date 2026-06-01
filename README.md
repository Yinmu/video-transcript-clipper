# 视频文案采集器

一个轻量 Chrome 扩展，用于在抖音和小红书视频页面采集视频地址，调用用户自己的转写 API，将结果导出为 Markdown 或导入 Obsidian。

## 项目状态

本项目是一个仍在维护的开源浏览器扩展，目标用户是内容创作者、知识工作者和需要把短视频内容沉淀到 Markdown / Obsidian 工作流的人。

当前维护重点：

- 提升抖音、小红书页面媒体地址提取的稳定性。
- 扩展并维护多个 ASR 厂商适配，包括 DashScope、豆包语音、腾讯云、OpenAI Audio、Deepgram、AssemblyAI 和自定义 API。
- 改进错误日志、排查体验和不同平台的兼容性。
- 保持 Manifest V3 原生扩展形态，尽量降低安装和二次开发门槛。

维护资料：

- [贡献指南](CONTRIBUTING.md)
- [路线图](ROADMAP.md)
- [变更记录](CHANGELOG.md)
- [隐私说明](PRIVACY.md)

## 功能

- 支持抖音视频文案转写
- 支持小红书视频文案转写
- 支持直接粘贴抖音/小红书分享链接或整段分享文案后采集
- 支持阿里百炼 DashScope Paraformer
- 支持火山引擎/豆包语音、腾讯云 ASR、OpenAI Audio、Deepgram、AssemblyAI
- 支持自定义转写 API
- 支持下载 Markdown
- 支持复制 Markdown
- 支持通过 Obsidian URI 导入 Obsidian
- 本地保留最近一次运行日志，便于排查问题

## 工作方式

### 抖音

抖音视频地址通常带防盗链，不能直接交给转写服务访问。本扩展会：

1. 在当前页面提取可播放媒体地址。
2. 使用浏览器环境下载媒体 Blob。
3. 上传到用户自己的 DashScope 文件存储。
4. 使用上传后的文件 URL 调用 Paraformer 转写。

### 小红书

小红书目前使用直接链路：

1. 在当前页面提取真实视频地址。
2. 直接将视频 URL 提交给 Paraformer 转写。

## 安装开发版

1. 打开 Chrome 扩展管理页：`chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录：`video-transcript-clipper`
5. 打开扩展设置页，配置 API

## 使用方式

可以先打开抖音或小红书视频页面，再点击扩展里的「采集并转写」。

也可以把抖音/小红书 App 分享出来的整段文案或链接粘贴到扩展的「视频链接」输入框，然后点击「采集并转写」。插件会在当前标签页打开该链接，等待短链跳转到真实视频页面后继续提取和转写。

### 国内用户获取方式

如果无法访问 GitHub 或 Chrome Web Store，可以使用以下方式：

1. 让已下载项目的人把插件源码目录打包成 ZIP 发给你。
2. 解压 ZIP，确认解压后的目录里能看到 `manifest.json`。
3. 在浏览器扩展管理页开启「开发者模式」。
4. 点击「加载已解压的扩展程序」，选择解压后的目录。

也可以把项目同步到国内代码托管或网盘后再下载。只要目录里包含 `manifest.json`、`popup.js`、`options.html` 等文件，就可以用开发者模式加载。

注意：不要直接加载 GitHub 下载下来的外层压缩包目录。如果打开目录后看不到 `manifest.json`，说明选错层级了。

### Edge 浏览器安装

这个插件是 Manifest V3 浏览器扩展，不只 Chrome 能用，Microsoft Edge 也可以使用。

Edge 开发者模式安装步骤：

1. 打开 Edge 扩展管理页：`edge://extensions/`
2. 开启「开发人员模式」。
3. 点击「加载解压缩的扩展」。
4. 选择本项目目录：`video-transcript-clipper`
5. 打开扩展设置页，配置 API。

Chrome 和 Edge 的使用方式基本一致，后续配置 API、采集、导出 Markdown、导入 Obsidian 的流程相同。

## API 配置

### 阿里百炼 DashScope

推荐模型：

```text
paraformer-v2
```

需要填写：

- 接口类型：阿里百炼 Paraformer
- API Key：用户自己的 DashScope API Key
- 模型：默认 `paraformer-v2`

API Key 只保存在用户本机浏览器的 `chrome.storage.local` 中。

### 其他内置转写服务

设置页可以直接选择以下服务：

- 阿里百炼 Paraformer（推荐）：适合抖音防盗链场景，插件会先上传到 DashScope 文件存储再转写。
- 火山引擎/豆包语音（推荐）：新版控制台只填豆包语音 ASR 的 `X-Api-Key`，`App ID` 留空；旧版控制台 `App ID` 填 `X-Api-App-Key`，`API Key` 填 `X-Api-Access-Key`。火山方舟/大模型推理 API Key 不能用于豆包语音 ASR。模型填资源 ID，推荐 `volc.bigasr.auc_turbo`。
- 腾讯云 ASR：`API Key` 填 `SecretId`，`API Secret` 填 `SecretKey`，模型默认 `16k_zh`。
- OpenAI Audio：`API Key` 填 OpenAI API Key，模型默认 `gpt-4o-mini-transcribe`。
- Deepgram：`API Key` 填 Deepgram API Key，模型默认 `nova-3`。
- AssemblyAI：`API Key` 填 AssemblyAI API Key。

平台和上传方式：

- 小红书：通常提取到的是公开可访问 URL，插件会把 URL 直接提交给火山、腾讯、Deepgram、AssemblyAI 等厂商。
- 抖音：插件会优先提取 `media-audio` 音频地址，并在浏览器内下载音频。阿里百炼会上传到 DashScope 文件存储；火山会用极速版 `audio.data` 上传 base64；腾讯会用 `SourceType=1` 上传 base64；OpenAI 会用 multipart 上传文件。
- Deepgram 和 AssemblyAI 当前只接入了公开 URL 模式，适合小红书，不适合抖音防盗链 URL。若要支持抖音，需要先把音频上传到可公开访问的对象存储。

主要限制：

- 阿里百炼：抖音会先上传到 DashScope 文件存储，适合防盗链场景。
- 火山引擎：小红书公开 URL 和抖音下载上传都走极速版 `recognize/flash`。推荐资源 ID `volc.bigasr.auc_turbo`，音频不超过 100MB，官方建议上传二进制流尽量 20MB 内；需要开通对应资源 ID 权限。
- 腾讯云：抖音本地音频上传不超过 5MB；超过 5MB 需要先上传到腾讯 COS，再用 COS URL 创建识别任务。
- OpenAI Audio：浏览器下载后上传，单文件不超过 25MB。
- Deepgram / AssemblyAI：当前插件只传公开 URL。

## 详细配置教程

### 阿里百炼 Paraformer

适合场景：想省心使用，尤其是抖音防盗链视频。插件已经内置“下载抖音音频 -> 上传 DashScope 文件存储 -> 提交 Paraformer 转写”的完整流程。

控制台入口：

- 阿里云百炼控制台：<https://bailian.console.aliyun.com/>
- DashScope 文档：<https://help.aliyun.com/zh/model-studio/>
- 获取 DashScope API Key
- 确认账号已开通音频转写和文件服务能力

插件填写：

```text
接口类型：阿里百炼 Paraformer
API Key：DashScope API Key
模型：paraformer-v2
App ID：不填
API Secret：不填
自定义 API 地址：不填
```

插件调用方式：

- 小红书：直接提交公开视频 URL 给 DashScope 转写。
- 抖音：浏览器先下载音频，再上传到 DashScope 文件存储，然后提交转写。

常见问题：

- `401/403`：API Key 错误、服务未开通、额度不足或账号权限不足。
- 文件上传失败：检查 DashScope 文件服务是否可用，或视频音频是否超过插件限制。

### 火山引擎 / 豆包语音

适合场景：测试豆包语音识别大模型。推荐先用短音频测试。

控制台入口：

- 火山引擎控制台：<https://console.volcengine.com/>
- 豆包语音文档：<https://www.volcengine.com/docs/6561>
- 极速版 API 文档：<https://www.volcengine.com/docs/6561/1631584>
- 进入路径：火山引擎控制台 -> 豆包语音
- 不要使用火山方舟、大模型推理、OpenAI 兼容 API Key
- 新版控制台找 `X-Api-Key`
- 旧版控制台找 `X-Api-App-Key` 和 `X-Api-Access-Key`

插件推荐填写：

```text
接口类型：火山引擎/豆包语音
模型：volc.bigasr.auc_turbo
```

新版控制台：

```text
App ID：留空
API Key：豆包语音 ASR 的 X-Api-Key
```

旧版控制台：

```text
App ID：X-Api-App-Key
API Key：X-Api-Access-Key
```

插件调用方式：

- 小红书：提交公开 URL 到极速版 `recognize/flash`。
- 抖音：浏览器下载音频后，以 base64 方式上传到极速版 `recognize/flash`。

限制：

- 极速版音频不超过 2 小时、100MB。
- 官方建议上传二进制流尽量 20MB 内，更容易稳定返回。
- 需要开通 `volc.bigasr.auc_turbo` 资源权限。

常见问题：

- `Invalid X-Api-Key`：通常是填成了火山方舟 Key，或没有使用豆包语音 ASR 的 `X-Api-Key`。
- 资源无权限：确认模型字段是 `volc.bigasr.auc_turbo`，并在豆包语音控制台开通对应资源。

### 腾讯云 ASR

适合场景：小红书公开视频 URL。抖音只适合音频小于 5MB 的短视频。

控制台入口：

- 腾讯云 ASR 控制台：<https://console.cloud.tencent.com/asr>
- 产品文档：<https://cloud.tencent.com/document/product/1093>
- 录音文件识别文档：<https://cloud.tencent.com/document/product/1093/37823>
- 进入路径：腾讯云控制台 -> 语音识别 ASR
- 开通“录音文件识别”
- 在访问管理或 API 密钥页面获取 `SecretId` 和 `SecretKey`

插件填写：

```text
接口类型：腾讯云 ASR
API Key：SecretId
API Secret：SecretKey
模型：16k_zh
App ID：不填
自定义 API 地址：不填
```

插件调用方式：

- 小红书：提交公开 URL 创建识别任务，然后轮询结果。
- 抖音：浏览器下载音频后 base64 上传；超过 5MB 会直接提示不支持直传。

限制：

- URL 必须能被腾讯云服务器公网下载。
- 本地音频上传 `Data` 方式不超过 5MB。
- 超过 5MB 的抖音音频需要 COS 中转；本插件暂不做 COS 中转，因为这会增加配置复杂度。

常见问题：

- `Failed to download audio file`：腾讯云服务器拉不到小红书/视频 URL。
- 鉴权失败：检查 `SecretId` / `SecretKey`，以及账号是否开通 ASR。

### 自定义厂商模板

没有服务器也可以接入一部分“简单 HTTP 转写接口”。设置页选择“自定义厂商模板”后，可以配置：

- API 地址：厂商的转写接口 URL。
- 鉴权方式：`Authorization: Bearer API_KEY`、自定义 Header，或不添加鉴权 Header。
- 输入方式：公开视频 URL、浏览器下载后 base64、浏览器下载后 multipart 文件上传、旧版插件格式。
- 字段名：URL 字段、base64 字段、文件字段、模型字段。
- 返回文本字段路径：例如 `text`、`data.text`、`result.transcript`，多个路径用英文逗号分隔。

适合的厂商接口：

- 简单 `POST` 请求即可转写。
- 鉴权只是 Bearer Token 或一个 API Key Header。
- 返回 JSON 中有明确的文本字段。
- 同步返回结果，或厂商接口自身在请求内完成转写。

不适合的厂商接口：

- 需要 HMAC/TC3/AK-SK 等复杂签名。
- 需要“提交任务 -> 轮询任务 -> 下载结果”的复杂流程。
- 需要回调地址。
- 需要先上传到对象存储，比如 COS/OSS/S3。
- 需要执行自定义脚本。

这些复杂厂商应做成内置 provider，而不是用自定义模板硬配。

自定义模板示例 1：提交公开视频 URL

```http
POST https://api.example.com/transcribe
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

设置：

```text
输入方式：提交公开视频 URL(JSON)
URL 字段名：audio_url
模型字段名：model
返回文本字段路径：text,data.text
```

插件会发送：

```json
{
  "audio_url": "https://example.com/audio.mp3",
  "model": "your-model",
  "sourceUrl": "https://example.com/page",
  "platform": "xhs",
  "durationSeconds": 120
}
```

自定义模板示例 2：下载后 multipart 上传

设置：

```text
输入方式：下载后 multipart 上传文件
文件字段名：file
模型字段名：model
返回文本字段路径：text
```

插件会先在浏览器下载音频或视频，再以表单方式上传：

```text
file: 二进制文件
model: your-model
sourceUrl: 原页面地址
platform: xhs 或 douyin
durationSeconds: 视频时长
```

旧版插件格式仍然支持。选择“兼容旧版插件格式”时，请求体为：

```http
POST your-api-url
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json
```

请求体：

```json
{
  "videoUrl": "https://example.com/video.mp4",
  "sourceUrl": "https://example.com/page",
  "platform": "xhs",
  "durationSeconds": 120
}
```

返回字段支持任意一个：

```json
{
  "content": "转写结果"
}
```

也支持 `text`、`transcript`、`result`。

## 隐私说明

请阅读 `PRIVACY.md`。

## 注意事项

- 本项目不内置任何 API Key。
- 用户需要自行配置自己的 API Key。
- 抖音转写会将当前视频媒体文件上传到用户自己的 DashScope 文件存储。
- 页面媒体地址可能随平台策略变化而失效。
- 本项目仅用于处理你有权访问和使用的内容。

## 开发

本项目是原生 Manifest V3 Chrome 扩展，没有构建步骤。

推荐开发流程：

1. 修改代码或文档。
2. 运行下面的语法检查。
3. 在 Chrome 或 Edge 开发者模式重新加载扩展。
4. 至少用一个抖音或小红书页面完成采集、转写、复制 Markdown / 下载 Markdown 的手动验证。

常用检查：

```bash
python3 -m json.tool manifest.json >/dev/null
node --check popup.js
node --check options.js
node --check content/page-hook.js
node --check content/cache-listener.js
node --check lib/extractors.js
node --check lib/markdown.js
node --check lib/storage.js
```

## 关于作者

- 🔥 获客操盘手，累计操盘成交 2 亿
- 🤖 AI 学习者，探索新时代的获客姿势
- 💡 公众号「BookNote」
- 🐦 X: https://x.com/Dunduncoming

## License

MIT
