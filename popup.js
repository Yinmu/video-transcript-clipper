const collectButton = document.getElementById('collect-btn');
const downloadButton = document.getElementById('download-btn');
const copyButton = document.getElementById('copy-btn');
const obsidianButton = document.getElementById('obsidian-btn');
const optionsButton = document.getElementById('options-btn');
const helpButton = document.getElementById('help-btn');
const copyLogButton = document.getElementById('copy-log-btn');
const clearLogButton = document.getElementById('clear-log-btn');
const toggleLogButton = document.getElementById('toggle-log-btn');
const resultBox = document.getElementById('result-box');
const resultOutput = document.getElementById('result-output');
const diagnosticsBox = document.getElementById('diagnostics-box');
const diagnosticsOutput = document.getElementById('diagnostics-output');
const statusEl = document.getElementById('status');

let latestTranscript = null;
let lastCollectDiagnostics = [];
let currentCollectLog = null;
let diagnosticsExpanded = false;
const MAX_MEDIA_BLOB_BYTES = 100 * 1024 * 1024;
const README_URL = 'https://github.com/Yinmu/video-transcript-clipper#readme';

function setStatus(text) {
  statusEl.textContent = text;
}

function resetDiagnostics() {
  lastCollectDiagnostics = [];
  diagnosticsOutput.value = '';
  diagnosticsBox.style.display = 'none';
  diagnosticsExpanded = false;
  diagnosticsBox.classList.add('collapsed');
  toggleLogButton.textContent = '展开';
}

function addDiagnostic(text) {
  if (!text) return;
  lastCollectDiagnostics.push(text);
  renderDiagnostics();
}

function formatDiagnostics() {
  return lastCollectDiagnostics.filter(Boolean).join('；');
}

function safeJson(value) {
  try {
    return JSON.stringify(value, (key, item) => {
      if (/apiKey|authorization|token|key/i.test(key)) return '[REDACTED]';
      if (typeof item === 'string' && /^https?:\/\//i.test(item)) return redactUrl(item);
      if (item instanceof Error) return item.message;
      return item;
    }, 2);
  } catch (error) {
    return String(value);
  }
}

function redactUrl(url) {
  try {
    const parsed = new URL(url);
    const sensitiveParams = ['msToken', 'a_bogus', 'X-Bogus', 'verifyFp', 'fp', 'uifid', 'token', 'sign', 'Signature', 'OSSAccessKeyId'];
    sensitiveParams.forEach(param => {
      if (parsed.searchParams.has(param)) parsed.searchParams.set(param, '[REDACTED]');
    });
    const text = parsed.href;
    return text.length > 260 ? `${text.slice(0, 220)}...<url-truncated>` : text;
  } catch (error) {
    return String(url).length > 260 ? `${String(url).slice(0, 220)}...<url-truncated>` : String(url);
  }
}

function truncateText(text, max = 3000) {
  const value = String(text || '');
  return value.length > max ? `${value.slice(0, max)}...<truncated:${value.length - max}>` : value;
}

function summarizeCandidates(candidates = [], limit = 8) {
  return candidates.slice(0, limit).map((item, index) => ({
    index,
    source: item.source,
    score: item.score,
    platform: item.platform,
    updatedAt: item.updatedAt,
    meta: item.meta,
    url: redactUrl(item.url),
  }));
}

function startCollectLog(meta) {
  currentCollectLog = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    startedAt: new Date().toISOString(),
    finishedAt: '',
    meta,
    events: [],
  };
  addLog('run.start', meta);
}

function addLog(event, data = {}) {
  if (!currentCollectLog) {
    currentCollectLog = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      startedAt: new Date().toISOString(),
      finishedAt: '',
      meta: {},
      events: [],
    };
  }

  currentCollectLog.events.push({
    at: new Date().toISOString(),
    event,
    data,
  });

  if (currentCollectLog.events.length > 300) {
    currentCollectLog.events = currentCollectLog.events.slice(-300);
  }

  chrome.storage.local.set({ latestCollectLog: currentCollectLog }).catch(() => {});
  renderDiagnostics();
}

function finishCollectLog(status, error) {
  if (!currentCollectLog) return;
  currentCollectLog.finishedAt = new Date().toISOString();
  currentCollectLog.status = status;
  if (error) {
    currentCollectLog.error = error.message || String(error);
  }
  chrome.storage.local.set({ latestCollectLog: currentCollectLog }).catch(() => {});
  renderDiagnostics();
}

function formatCollectLog() {
  if (!currentCollectLog) return '';
  const lines = [
    `日志ID：${currentCollectLog.id}`,
    `开始：${currentCollectLog.startedAt}`,
    currentCollectLog.finishedAt ? `结束：${currentCollectLog.finishedAt}` : '',
    currentCollectLog.status ? `状态：${currentCollectLog.status}` : '',
    currentCollectLog.error ? `错误：${currentCollectLog.error}` : '',
    `上下文：${safeJson(currentCollectLog.meta)}`,
    '',
    ...currentCollectLog.events.map((item, index) => [
      `[${index + 1}] ${item.at} ${item.event}`,
      safeJson(item.data),
    ].join('\n')),
  ].filter(Boolean);
  return lines.join('\n\n');
}

function renderDiagnostics() {
  const text = [
    formatDiagnostics(),
    formatCollectLog(),
  ].filter(Boolean).join('\n\n--- 完整日志 ---\n\n');

  diagnosticsOutput.value = text;
  diagnosticsBox.style.display = text ? 'block' : 'none';
  diagnosticsBox.classList.toggle('collapsed', !diagnosticsExpanded);
  toggleLogButton.textContent = diagnosticsExpanded ? '收起' : '展开';
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error('找不到当前标签页');
  return tab;
}

function runVideoExtractor(platform) {
  function getVideoDuration() {
    const video = Array.from(document.querySelectorAll('video')).find(item => Number.isFinite(item.duration) && item.duration > 0);
    return video ? Math.ceil(video.duration) : 0;
  }

  function normalizeUrlText(text) {
    return String(text || '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#34;/g, '"')
      .replace(/&#x2F;/g, '/')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\\u0026/g, '&')
      .replace(/\\u002F/gi, '/')
      .replace(/\\\//g, '/')
      .trim();
  }

  function collectUrlsFromText(text) {
    const normalized = normalizeUrlText(text);
    const matches = normalized.match(/https?:\/\/[^"'\s<>）)]+/g) || [];
    const decoded = [];
    matches.forEach((url) => {
      decoded.push(url);
      try {
        decoded.push(decodeURIComponent(url));
      } catch (error) {}
    });
    return decoded.map(normalizeUrlText);
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname;
    } catch (error) {
      return url.slice(0, 60);
    }
  }

  function extractXhs() {
    function isDirectXhsVideoResource(url) {
      return /^https?:\/\//.test(url) &&
        /xiaohongshu|xhscdn|sns-video|redcdn|xhs/i.test(url) &&
        (/\.mp4(\?|$)/i.test(url) || /\.m3u8(\?|$)/i.test(url) || /\/stream\//i.test(url)) &&
        !/\.ico(\?|$)|avatar|cover|poster|image|jpeg|jpg|png|webp|css|font|favicon|sprite|api\/sns|unread_count/i.test(url);
    }

    function score(url) {
      let value = 0;
      if (/\.mp4(\?|$)/i.test(url)) value += 100;
      if (/sns-video|xhscdn/i.test(url)) value += 50;
      if (/\/stream\//i.test(url)) value += 30;
      if (/\.m3u8(\?|$)/i.test(url)) value += 10;
      return value;
    }

    const resources = performance.getEntriesByType('resource').map(entry => entry.name);
    const htmlUrls = collectUrlsFromText(document.documentElement.innerHTML);
    const scriptUrls = Array.from(document.querySelectorAll('script'))
      .flatMap(script => collectUrlsFromText(script.textContent || ''));
    const allUrls = [...resources, ...htmlUrls, ...scriptUrls];
    const matches = Array.from(new Set(allUrls.filter(isDirectXhsVideoResource)))
      .sort((a, b) => score(b) - score(a));
    const suspicious = allUrls.filter(url =>
      /video|mp4|m3u8|xhscdn|sns|media|stream|play/i.test(url) &&
      !/\.js(\?|$)|\.css(\?|$)|\.ico(\?|$)|unread_count/i.test(url)
    ).slice(0, 8);

    return {
      pageUrl: location.href,
      platform: 'xhs',
      videoUrl: matches[0] || '',
      durationSeconds: getVideoDuration(),
      foundCount: allUrls.length,
      candidateCount: matches.length,
      diagnostics: matches.length
        ? matches.slice(0, 6).map(hostOf).join('，')
        : `未找到可转写 mp4/m3u8/stream 地址；资源数：${allUrls.length}${suspicious.length ? `；疑似资源：${suspicious.join(' | ').slice(0, 500)}` : ''}`,
    };
  }

  function extractDouyin() {
    function collectDouyinApiUrlsFromObject(data, source) {
      const urls = [];

      function addUrl(url, meta = {}) {
        const clean = normalizeUrlText(url);
        if (!clean || !/^https?:\/\//i.test(clean)) return;
        if (/\.(png|jpe?g|webp|gif|svg|ico|json|js|css)(\?|$)|byteimg|bytednsdoc|douyinpic|manifest\.json/i.test(clean)) return;
        if (!/douyinvod|bytecdn|ixigua|zjcdn|v3-dy|v26-web|v9-web|tos-cn/i.test(clean)) return;
        urls.push({ url: clean, source, meta });
      }

      function addAddress(address, meta = {}) {
        if (!address || typeof address !== 'object') return;
        const urlList = address.url_list || address.urlList || [];
        if (Array.isArray(urlList)) urlList.forEach(url => addUrl(url, meta));
      }

      function collectVideo(video, path) {
        if (!video || typeof video !== 'object') return;
        const bitRates = Array.isArray(video.bit_rate) ? video.bit_rate : [];
        bitRates
          .slice()
          .sort((a, b) => Number(b.bit_rate || 0) - Number(a.bit_rate || 0))
          .forEach((item, index) => addAddress(item.play_addr || item.playAddr, {
            path: `${path}.bit_rate[${index}].play_addr`,
            bitRate: item.bit_rate || 0,
            sourceKind: 'douyin-api-bitrate',
          }));
        addAddress(video.play_addr || video.playAddr, {
          path: `${path}.play_addr`,
          sourceKind: 'douyin-api-play',
        });
        addAddress(video.download_addr || video.downloadAddr, {
          path: `${path}.download_addr`,
          sourceKind: 'douyin-api-download',
        });
      }

      function walk(value, path, depth) {
        if (!value || depth > 9) return;
        if (Array.isArray(value)) {
          value.forEach((item, index) => walk(item, `${path}[${index}]`, depth + 1));
          return;
        }
        if (typeof value !== 'object') return;
        if (value.video && typeof value.video === 'object') collectVideo(value.video, `${path}.video`);
        if (value.aweme_detail) walk(value.aweme_detail, `${path}.aweme_detail`, depth + 1);
        if (value.aweme_list) walk(value.aweme_list, `${path}.aweme_list`, depth + 1);
        Object.entries(value).forEach(([key, child]) => {
          if (!/aweme|detail|video|play|download|bit_rate|data/i.test(key)) return;
          walk(child, `${path}.${key}`, depth + 1);
        });
      }

      walk(data, '$', 0);
      return Array.from(new Map(urls.map(item => [item.url, item])).values());
    }

    function scoreDouyinApiUrl(item) {
      let value = 0;
      const url = item.url || '';
      if (/douyin-api/i.test(item.source || '')) value += 200;
      if (/download/i.test(item.meta?.sourceKind || item.meta?.path || '')) value += 80;
      if (/bitrate|bit_rate/i.test(item.meta?.sourceKind || item.meta?.path || '')) value += 70;
      if (/watermark=0/i.test(url)) value += 90;
      if (/\.mp4(\?|$)/i.test(url)) value += 100;
      if (/media-audio/i.test(url)) value -= 120;
      if (/douyinvod|bytecdn|ixigua|zjcdn|v3-dy|v26-web|v9-web|tos-cn/i.test(url)) value += 50;
      value += Math.min(80, Math.floor(Number(item.meta?.bitRate || 0) / 50000));
      return value;
    }

    function fromApiJsonInPage() {
      const candidates = [];
      ['__INITIAL_STATE__', 'RENDER_DATA'].forEach((key) => {
        try {
          if (key === 'RENDER_DATA') {
            const el = document.getElementById('RENDER_DATA');
            if (!el) return;
            candidates.push(...collectDouyinApiUrlsFromObject(JSON.parse(decodeURIComponent(el.textContent || '')), `douyin-api:${key}`));
            return;
          }
          if (window[key]) candidates.push(...collectDouyinApiUrlsFromObject(window[key], `douyin-api:${key}`));
        } catch (error) {}
      });

      Array.from(document.querySelectorAll('script')).forEach((script, index) => {
        const text = script.textContent || '';
        if (!/aweme_detail|play_addr|download_addr|bit_rate|url_list/i.test(text)) return;
        const jsonMatches = text.match(/\{[\s\S]{50,}\}/g) || [];
        jsonMatches.slice(0, 5).forEach((chunk) => {
          try {
            candidates.push(...collectDouyinApiUrlsFromObject(JSON.parse(chunk), `douyin-api:script-${index}`));
          } catch (error) {}
        });
      });

      const unique = Array.from(new Map(candidates.map(item => [item.url, item])).values())
        .map(item => ({ ...item, score: scoreDouyinApiUrl(item) }))
        .sort((a, b) => b.score - a.score);
      const best = unique[0];
      if (!best) return null;
      return {
        pageUrl: location.href,
        platform: 'douyin',
        videoUrl: best.url,
        durationSeconds: getVideoDuration(),
        foundCount: candidates.length,
        candidateCount: unique.length,
        source: 'douyinApiJson',
        diagnostics: `抖音API地址：${unique.slice(0, 6).map(item => `${hostOf(item.url)}(${item.score}/${item.meta?.sourceKind || item.source})`).join('，')}`,
      };
    }

    function fromRenderData() {
      const el = document.getElementById('RENDER_DATA');
      if (!el) return null;
      try {
        const data = JSON.parse(decodeURIComponent(el.textContent || ''));
        const urls = [];

        function walk(value, depth) {
          if (!value || depth > 12) return;
          if (typeof value === 'string') {
            const clean = normalizeUrlText(value);
            if (/douyinvod|bytecdn|ixigua|zjcdn|v3-dy|v3-web|v26-web|v9-web|tos-cn/i.test(clean) && /^https?:\/\//.test(clean) &&
                !/media-video-hvc1|media-video-avc1|media-audio|byteimg|bytednsdoc|douyinpic|\.(png|jpe?g|webp|gif|svg|ico|json)(\?|$)/i.test(clean)) {
              urls.push(clean);
            }
            return;
          }
          if (Array.isArray(value)) {
            value.forEach(item => walk(item, depth + 1));
            return;
          }
          if (typeof value === 'object') {
            const keys = Object.keys(value);
            const priority = keys.filter(key => /play_addr|download_addr|playAddr|downloadAddr|playApi/i.test(key));
            const rest = keys.filter(key => !priority.includes(key));
            priority.concat(rest).forEach(key => walk(value[key], depth + 1));
          }
        }

        walk(data, 0);
        const unique = Array.from(new Set(urls));
        const best = unique.find(url => !/watermark/i.test(url)) || unique[0];
        if (!best) return null;
        return {
          pageUrl: location.href,
          platform: 'douyin',
          videoUrl: best,
          durationSeconds: getVideoDuration(),
          foundCount: unique.length,
          candidateCount: unique.length,
          diagnostics: `RENDER_DATA：${unique.slice(0, 4).map(hostOf).join('，')}`,
        };
      } catch (error) {
        return null;
      }
    }

    function fromResourcesAndHtml() {
      const resources = performance.getEntriesByType('resource').map(entry => entry.name);
      const htmlUrls = collectUrlsFromText(document.documentElement.innerHTML);
      const scriptUrls = Array.from(document.querySelectorAll('script'))
        .flatMap(script => collectUrlsFromText(script.textContent || ''));
      const videoUrls = Array.from(document.querySelectorAll('video'))
        .flatMap(video => [
          video.currentSrc,
          video.src,
          video.getAttribute('src'),
          ...Array.from(video.querySelectorAll('source')).map(source => source.src || source.getAttribute('src')),
        ])
        .filter(Boolean);
      const allUrls = [...resources, ...htmlUrls, ...scriptUrls, ...videoUrls].map(normalizeUrlText);
      const matches = Array.from(new Set(allUrls)).filter(url =>
        /^https?:\/\//.test(url) &&
        /douyin|bytecdn|douyinvod|ixigua|zjcdn|v3-dy|v3-web|v26-web|v9-web|tos-cn/i.test(url) &&
        (/\.mp4(\?|$)/i.test(url) || /\.m3u8(\?|$)/i.test(url) || /douyinvod|byte-vod|bytecdn|ixigua|zjcdn|v3-dy|media-audio|media-video|v3-web|v26-web|v9-web|tos-cn/i.test(url)) &&
        !/\.(js|css|json|png|jpe?g|webp|gif|svg|ico)(\?|$)|avatar|cover|poster|image|font|favicon|sprite|byteimg|bytednsdoc|douyinpic|manifest\.json/i.test(url)
      ).sort((a, b) => {
        const score = (url) => {
          let value = 0;
          if (/media-audio/i.test(url)) value += 120;
          if (/\.mp4(\?|$)/i.test(url)) value += 100;
          if (/douyinvod|bytecdn|ixigua|zjcdn|v3-dy|v3-web|v26-web|v9-web|tos-cn/i.test(url)) value += 50;
          if (/media-video/i.test(url)) value += 20;
          if (/watermark/i.test(url)) value -= 50;
          return value;
        };
        return score(b) - score(a);
      });
      const suspicious = allUrls.filter(url =>
        /video|mp4|m3u8|douyinvod|bytecdn|zjcdn|v3-dy|media|play|v3-web|v26-web|v9-web|tos-cn/i.test(url)
      ).slice(0, 8);

      return {
        pageUrl: location.href,
        platform: 'douyin',
        videoUrl: matches[0] || '',
        durationSeconds: getVideoDuration(),
        foundCount: allUrls.length,
        candidateCount: matches.length,
        diagnostics: matches.length
          ? `资源扫描：${matches.slice(0, 6).map(hostOf).join('，')}`
          : `未找到抖音可转写地址；资源数：${allUrls.length}${suspicious.length ? `；疑似资源：${suspicious.join(' | ').slice(0, 500)}` : ''}`,
      };
    }

    return fromApiJsonInPage() || fromRenderData() || fromResourcesAndHtml();
  }

  if (platform === 'xhs') return extractXhs();
  if (platform === 'douyin') return extractDouyin();
  return {
    pageUrl: location.href,
    platform,
    videoUrl: '',
    foundCount: 0,
    candidateCount: 0,
    diagnostics: '不支持当前平台',
  };
}

function extractContentFromResponse(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (data.content) return data.content;
  if (data.text) return data.text;
  if (data.transcript) return data.transcript;
  if (data.result) return data.result;
  if (data.data?.content) return data.data.content;
  if (data.data?.text) return data.data.text;
  return '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizePageUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    return parsed.href;
  } catch (error) {
    return String(url || '').split('#')[0];
  }
}

function isDefinitelyNonMediaUrl(url) {
  return /\.(png|jpe?g|webp|gif|svg|ico|json|js|css)(\?|$)/i.test(url || '') ||
    /byteimg|bytednsdoc|douyinpic|manifest\.json|mssdk|notice\/detail|avatar|cover|poster|image|favicon|sprite/i.test(url || '');
}

function pickCachedVideo(cache, platform, pageUrl) {
  const rawCandidates = (cache?.candidates || [])
    .filter(item => item?.url && (!item.platform || item.platform === platform))
    .filter(item => isTranscribableVideoUrl(item.url))
    .filter(item => !isDefinitelyNonMediaUrl(item.url));
  const freshCandidates = rawCandidates.filter(item => item.updatedAt && Date.now() - Number(item.updatedAt) < 10 * 60 * 1000);
  const candidates = (freshCandidates.length > 0 ? freshCandidates : rawCandidates)
    .sort((a, b) => {
      const score = (item) => {
        let value = Number(item.score || 0);
        const url = item.url || '';
        if (platform === 'douyin' && /douyin-api/i.test(item.source || '')) value += 300;
        if (platform === 'douyin' && /watermark=0/i.test(url)) value += 100;
        if (platform === 'douyin' && /mime_type=video_mp4|video_mp4|br=\d{3,}/i.test(url)) value += 120;
        if (platform === 'douyin' && /video-element|fetch-response|xhr-response/i.test(item.source || '')) value += 60;
        if (platform === 'douyin' && /media-audio/i.test(url)) value -= 220;
        if (item.updatedAt) value += Math.max(-120, Math.min(80, Math.floor((Number(item.updatedAt) - Date.now()) / 10000) + 80));
        return value;
      };
      return score(b) - score(a);
    });

  const best = candidates[0];
  if (!best) return null;

  return {
    pageUrl: cache.pageUrl || pageUrl,
    platform,
    videoUrl: best.url,
    durationSeconds: 0,
    foundCount: cache.candidates?.length || candidates.length,
    candidateCount: candidates.length,
    source: best.source || '',
    score: best.score || 0,
    meta: best.meta || {},
    diagnostics: `缓存命中：${best.source || 'unknown'}；候选数：${candidates.length}`,
  };
}

async function getPageCachedVideoFromTab(tab, platform) {
  const pageUrl = normalizePageUrl(tab.url || '');

  try {
    const cache = await chrome.tabs.sendMessage(tab.id, {
      type: 'GET_VIDEO_CANDIDATES',
      pageUrl,
    });
    addDiagnostic(`页面缓存候选：${cache?.candidates?.length || 0}`);
    addLog('cache.page.result', {
      pageUrl,
      candidateCount: cache?.candidates?.length || 0,
      candidates: summarizeCandidates(cache?.candidates || []),
    });
    const video = pickCachedVideo(cache, platform, pageUrl);
    if (video) {
      addLog('cache.page.selected', video);
      return video;
    }
  } catch (error) {
    addDiagnostic(`页面缓存读取失败：${error.message || error}`);
    addLog('cache.page.error', { message: error.message || String(error) });
  }

  return null;
}

async function getStoredCachedVideoFromTab(tab, platform) {
  const pageUrl = normalizePageUrl(tab.url || '');
  const { videoCandidateCache = {} } = await getStorage(['videoCandidateCache']);
  const storedCache = videoCandidateCache[pageUrl];
  addDiagnostic(`本地缓存候选：${storedCache?.candidates?.length || 0}`);
  addLog('cache.storage.result', {
    pageUrl,
    candidateCount: storedCache?.candidates?.length || 0,
    candidates: summarizeCandidates(storedCache?.candidates || []),
  });
  const video = pickCachedVideo(storedCache, platform, pageUrl);
  if (video) addLog('cache.storage.selected', video);
  return video;
}

async function clearPageCandidateCache(pageUrl) {
  const normalized = normalizePageUrl(pageUrl || '');
  if (!normalized) return;
  try {
    const { videoCandidateCache = {} } = await getStorage(['videoCandidateCache']);
    if (!videoCandidateCache[normalized]) return;
    delete videoCandidateCache[normalized];
    await setStorage({ videoCandidateCache });
    addLog('cache.page.cleared', { pageUrl: normalized });
  } catch (error) {
    addLog('cache.page.clear_error', { message: error.message || String(error) });
  }
}

async function scanCurrentPageVideo(tab, platform) {
  setStatus('正在扫描当前页面...');
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: runVideoExtractor,
      args: [platform],
    });
    const video = result?.result;
    addDiagnostic(`页面扫描候选：${video?.candidateCount || 0}`);
    if (video?.diagnostics) addDiagnostic(`页面扫描诊断：${video.diagnostics}`);
    addLog('scan.page.result', video || {});
    return video || null;
  } catch (error) {
    addDiagnostic(`页面扫描失败：${error.message || error}`);
    addLog('scan.page.error', { message: error.message || String(error) });
    throw error;
  }
}

async function submitDashScopeTranscription(config, fileUrl) {
  const requestBody = {
    model: config.model || 'paraformer-v2',
    input: { file_urls: [fileUrl] },
    parameters: { language_hints: ['zh'] },
  };
  addLog('dashscope.submit.request', {
    url: 'https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription',
    body: requestBody,
  });

  const submitResponse = await fetch('https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'X-DashScope-Async': 'enable',
    },
    body: JSON.stringify(requestBody),
  });
  const submitText = await submitResponse.text();
  addLog('dashscope.submit.response', {
    ok: submitResponse.ok,
    status: submitResponse.status,
    text: truncateText(submitText),
  });
  if (!submitResponse.ok) throw new Error(`DashScope 提交失败：${submitResponse.status} ${submitText.slice(0, 200)}`);

  const submitData = JSON.parse(submitText);
  const taskId = submitData.output?.task_id;
  if (!taskId) throw new Error('DashScope 未返回 task_id');
  addLog('dashscope.task.created', { taskId });

  for (let i = 0; i < 80; i++) {
    await sleep(3000);
    setStatus(`DashScope 转写中... ${i + 1}`);
    const pollResponse = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: { Authorization: `Bearer ${config.apiKey}` },
    });
    const pollText = await pollResponse.text();
    addLog('dashscope.task.poll', {
      index: i + 1,
      ok: pollResponse.ok,
      status: pollResponse.status,
      text: truncateText(pollText),
    });
    if (!pollResponse.ok) throw new Error(`DashScope 查询失败：${pollResponse.status} ${pollText.slice(0, 200)}`);

    const pollData = JSON.parse(pollText);
    const status = pollData.output?.task_status;
    if (status === 'FAILED') {
      throw new Error(pollData.output?.message || 'DashScope 转写失败');
    }
    if (status !== 'SUCCEEDED') continue;

    const result = pollData.output?.results?.[0];
    const transcriptionUrl = result?.transcription_url;
    if (!transcriptionUrl) throw new Error('DashScope 未返回 transcription_url');
    addLog('dashscope.result.url', { transcriptionUrl });

    const transcriptionResponse = await fetch(transcriptionUrl);
    const transcriptionText = await transcriptionResponse.text();
    addLog('dashscope.result.download', {
      ok: transcriptionResponse.ok,
      status: transcriptionResponse.status,
      text: truncateText(transcriptionText),
    });
    if (!transcriptionResponse.ok) throw new Error(`下载转写结果失败：${transcriptionResponse.status}`);

    const transcriptionData = JSON.parse(transcriptionText);
    const sentences = transcriptionData.transcripts || transcriptionData.transcript || [];
    if (Array.isArray(sentences) && sentences.length > 0) {
      return sentences.map(sentence => sentence.text || '').join('');
    }
    if (transcriptionData.text) return transcriptionData.text;
    return extractContentFromResponse(transcriptionData) || JSON.stringify(transcriptionData).slice(0, 5000);
  }

  throw new Error('DashScope 转写超时');
}

async function withTemporaryRequestHeaders(videoUrl, sourceUrl, callback) {
  if (!chrome.declarativeNetRequest?.updateSessionRules || !sourceUrl) {
    return callback();
  }

  let requestHost = '';
  try {
    requestHost = new URL(videoUrl).hostname;
  } catch (error) {
    return callback();
  }

  const ruleId = Math.floor(Date.now() % 1000000) + 1000;
  const origin = new URL(sourceUrl).origin;
  const rule = {
    id: ruleId,
    priority: 1,
    action: {
      type: 'modifyHeaders',
      requestHeaders: [
        { header: 'Referer', operation: 'set', value: sourceUrl },
        { header: 'Origin', operation: 'set', value: origin },
      ],
    },
    condition: {
      requestDomains: [requestHost],
      resourceTypes: ['xmlhttprequest', 'media', 'other'],
    },
  };

  addLog('dnr.headers.install.request', {
    ruleId,
    requestHost,
    referer: sourceUrl,
    origin,
  });

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [rule],
    });
    addLog('dnr.headers.install.success', { ruleId });
    return await callback();
  } catch (error) {
    addLog('dnr.headers.install.error', { message: error.message || String(error) });
    return await callback();
  } finally {
    try {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
      addLog('dnr.headers.cleanup', { ruleId });
    } catch (error) {
      addLog('dnr.headers.cleanup.error', { message: error.message || String(error) });
    }
  }
}

async function downloadMediaBlob(videoUrl, sourceUrl) {
  setStatus('正在下载媒体文件...');
  addLog('media.download.request', { url: videoUrl });

  const response = await withTemporaryRequestHeaders(videoUrl, sourceUrl, () => {
    return fetch(videoUrl, {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      referrer: sourceUrl || undefined,
    });
  });

  const contentType = response.headers.get('content-type') || '';
  const contentLength = response.headers.get('content-length') || '';
  addLog('media.download.response', {
    ok: response.ok,
    status: response.status,
    contentType,
    contentLength,
  });

  if (!response.ok) {
    throw new Error(`浏览器下载媒体失败：${response.status}`);
  }

  const blob = await response.blob();
  addLog('media.download.blob', {
    type: blob.type,
    size: blob.size,
  });

  if (blob.size < 1024) throw new Error('下载到的媒体文件太小');
  if (blob.size > MAX_MEDIA_BLOB_BYTES) {
    throw new Error(`媒体文件过大：${Math.ceil(blob.size / 1024 / 1024)}MB，当前限制 100MB`);
  }
  return blob;
}

function pickDashScopeUploadedFile(data) {
  const uploaded = data?.data?.uploaded_files?.[0] ||
    data?.data?.uploadedFiles?.[0] ||
    data?.uploaded_files?.[0] ||
    data?.uploadedFiles?.[0] ||
    data?.data ||
    data;

  return {
    fileId: uploaded?.file_id || uploaded?.fileId || uploaded?.id || '',
    url: uploaded?.url || uploaded?.file_url || uploaded?.fileUrl || uploaded?.download_url || '',
    raw: uploaded || null,
  };
}

async function getDashScopeFileUrl(config, fileId) {
  if (!fileId) return '';

  addLog('dashscope.file.get.request', { fileId });
  const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/files/${encodeURIComponent(fileId)}`, {
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: 'application/json',
    },
  });
  const text = await response.text();
  addLog('dashscope.file.get.response', {
    ok: response.ok,
    status: response.status,
    text: truncateText(text),
  });
  if (!response.ok) throw new Error(`查询 DashScope 文件失败：${response.status} ${text.slice(0, 200)}`);

  const data = JSON.parse(text);
  return data?.data?.url || data?.url || '';
}

async function uploadBlobToDashScopeFiles(config, blob, payload) {
  setStatus('正在上传到 DashScope 文件存储...');
  const uploadBlob = blob;
  const extension = uploadBlob.type.includes('audio') ? 'm4a' : 'mp4';
  const filename = `${payload.platform || 'video'}-${Date.now()}.${extension}`;
  const form = new FormData();
  form.append('files', uploadBlob, filename);
  form.append('purpose', 'file-extract');
  form.append('descriptions', 'video transcript clipper upload');

  addLog('dashscope.file.upload.request', {
    url: 'https://dashscope.aliyuncs.com/api/v1/files',
    filename,
    blobType: uploadBlob.type,
    blobSize: uploadBlob.size,
    originalBlobType: blob.type,
    originalBlobSize: blob.size,
    purpose: 'file-extract',
  });

  const response = await fetch('https://dashscope.aliyuncs.com/api/v1/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: form,
  });
  const text = await response.text();
  addLog('dashscope.file.upload.response', {
    ok: response.ok,
    status: response.status,
    text: truncateText(text),
  });

  if (!response.ok) throw new Error(`DashScope 文件上传失败：${response.status} ${text.slice(0, 300)}`);
  const data = JSON.parse(text);
  const uploaded = pickDashScopeUploadedFile(data);
  let fileUrl = uploaded.url;

  if (!fileUrl && uploaded.fileId) {
    fileUrl = await getDashScopeFileUrl(config, uploaded.fileId);
  }

  addLog('dashscope.file.upload.selected', {
    fileId: uploaded.fileId,
    fileUrl,
    raw: uploaded.raw,
  });

  if (!fileUrl) throw new Error('DashScope 文件上传成功，但没有返回可用于转写的 URL');
  return fileUrl;
}

async function transcribeWithDashScope(config, payload) {
  if (payload.platform === 'douyin') {
    setStatus('抖音视频需要先下载并上传到 DashScope...');
    const blob = await downloadMediaBlob(payload.videoUrl, payload.sourceUrl);
    const uploadedUrl = await uploadBlobToDashScopeFiles(config, blob, payload);
    addLog('dashscope.upload.transcribe_url', {
      originalUrl: payload.videoUrl,
      uploadedUrl,
    });
    return submitDashScopeTranscription(config, uploadedUrl);
  }

  return submitDashScopeTranscription(config, payload.videoUrl);
}

async function callTranscribeApi(config, payload) {
  addLog('transcribe.start', {
    provider: config.provider,
    apiUrl: config.provider === 'custom' ? config.apiUrl : 'dashscope',
    model: config.model,
    payload,
  });

  if (config.provider === 'dashscope') {
    return transcribeWithDashScope(config, payload);
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  addLog('custom.response', {
    ok: response.ok,
    status: response.status,
    text: truncateText(text),
  });
  let data = null;
  try {
    data = text ? JSON.parse(text) : {};
  } catch (error) {
    data = text;
  }

  if (!response.ok) {
    const message = typeof data === 'object' ? (data.error || data.message) : data;
    throw new Error(message || `转写接口返回 ${response.status}`);
  }

  const content = extractContentFromResponse(data).trim();
  if (!content) throw new Error('转写接口没有返回 content/text/transcript/result');
  return content;
}

function saveLatest(transcript) {
  latestTranscript = transcript;
  resultOutput.value = buildTranscriptMarkdown(transcript);
  resultBox.style.display = 'block';
  return setStorage({ latestTranscript: transcript });
}

async function loadLatest() {
  const { latestTranscript: stored, latestCollectLog } = await getStorage(['latestTranscript', 'latestCollectLog']);
  if (stored?.content) {
    latestTranscript = stored;
    resultOutput.value = buildTranscriptMarkdown(stored);
    resultBox.style.display = 'block';
  }
  if (latestCollectLog?.events?.length) {
    currentCollectLog = latestCollectLog;
    renderDiagnostics();
  }
}

function getMarkdownOrThrow() {
  if (!latestTranscript?.content) throw new Error('暂无转写结果');
  return buildTranscriptMarkdown(latestTranscript);
}

collectButton.addEventListener('click', async () => {
  collectButton.disabled = true;
  resetDiagnostics();
  try {
    const config = await getConfig();
    if (!config.apiKey || (config.provider === 'custom' && !config.apiUrl)) {
      chrome.runtime.openOptionsPage();
      throw new Error(config.provider === 'custom' ? '请先配置 API 地址和 API Key' : '请先配置阿里百炼 API Key');
    }

    const tab = await getActiveTab();
    const platform = detectPlatform(tab.url || '');
    if (!platform) throw new Error('请先打开抖音或小红书视频页面');
    startCollectLog({
      tabId: tab.id,
      tabUrl: tab.url,
      platform,
      provider: config.provider,
      model: config.model,
      apiUrl: config.provider === 'custom' ? config.apiUrl : 'dashscope',
    });

    setStatus('正在读取页面监听缓存...');
    const pageCachedVideo = await getPageCachedVideoFromTab(tab, platform);
    let video = pageCachedVideo;

    const shouldPreferPageScan = !video?.videoUrl ||
      (platform === 'douyin' && !/douyin-api|douyinApiJson/i.test(video.source || video.diagnostics || ''));

    if (shouldPreferPageScan) {
      if (video?.videoUrl) {
        addLog('cache.page.deprioritized', {
          reason: '当前候选不是抖音 API 地址，先扫描页面 JSON',
          video,
        });
      }
      video = await scanCurrentPageVideo(tab, platform);
    }

    if (!video?.videoUrl) {
      setStatus('页面扫描未命中，使用本地缓存兜底...');
      addLog('cache.storage.fallback', {
        reason: '页面缓存和页面扫描未得到可用地址',
      });
      video = await getStoredCachedVideoFromTab(tab, platform);
    }

    if (!video?.videoUrl || !isTranscribableVideoUrl(video.videoUrl) || isDefinitelyNonMediaUrl(video.videoUrl)) {
      const diagnostics = [
        `候选数：${video?.candidateCount || 0}`,
        video?.diagnostics,
        formatDiagnostics(),
      ].filter(Boolean).join('；');
      throw new Error(`没有找到可转写视频地址。${diagnostics || '无诊断信息'}`);
    }

    setStatus('已获取视频地址，正在调用转写 API...');
    addLog('video.selected', video);
    const content = await callTranscribeApi(config, {
      videoUrl: video.videoUrl,
      sourceUrl: video.pageUrl || tab.url,
      platform,
      durationSeconds: video.durationSeconds || 0,
    });

    const transcript = {
      title: `${platformLabel(platform)}视频转写`,
      content,
      sourceUrl: video.pageUrl || tab.url,
      videoUrl: video.videoUrl,
      platform,
      updatedAt: Date.now(),
    };
    await saveLatest(transcript);
    setStatus('转写完成');
    if (platform === 'douyin') {
      await clearPageCandidateCache(tab.url);
    }
    addLog('run.success', {
      contentLength: content.length,
      sourceUrl: transcript.sourceUrl,
      videoUrl: transcript.videoUrl,
    });
    finishCollectLog('success');

    if (config.autoOpenObsidian) {
      openObsidian(transcript, config);
    }
  } catch (error) {
    addLog('run.error', {
      message: error.message || String(error),
      stack: error.stack,
    });
    finishCollectLog('failed', error);
    setStatus(error.message || '采集失败');
    if (formatDiagnostics()) {
      renderDiagnostics();
    }
  } finally {
    collectButton.disabled = false;
  }
});

downloadButton.addEventListener('click', () => {
  try {
    const markdown = getMarkdownOrThrow();
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFilename(latestTranscript.title)}.md`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Markdown 已下载');
  } catch (error) {
    setStatus(error.message);
  }
});

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(getMarkdownOrThrow());
    setStatus('Markdown 已复制');
  } catch (error) {
    setStatus(error.message || '复制失败');
  }
});

function openObsidian(transcript, config = {}) {
  const prefix = config.obsidianPrefix ? `${config.obsidianPrefix} ` : '';
  const name = safeFilename(`${prefix}${transcript.title}`);
  const markdown = buildTranscriptMarkdown(transcript);
  chrome.tabs.create({
    url: `obsidian://new?name=${encodeURIComponent(name)}&content=${encodeURIComponent(markdown)}`,
  });
}

obsidianButton.addEventListener('click', async () => {
  try {
    const config = await getConfig();
    if (!latestTranscript?.content) throw new Error('暂无转写结果');
    openObsidian(latestTranscript, config);
    setStatus('正在打开 Obsidian');
  } catch (error) {
    setStatus(error.message || '打开 Obsidian 失败');
  }
});

optionsButton.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

helpButton.addEventListener('click', () => {
  chrome.tabs.create({ url: README_URL });
});

copyLogButton.addEventListener('click', async () => {
  try {
    const logText = formatCollectLog() || diagnosticsOutput.value;
    if (!logText) throw new Error('暂无日志');
    await navigator.clipboard.writeText(logText);
    setStatus('日志已复制');
  } catch (error) {
    setStatus(error.message || '复制日志失败');
  }
});

clearLogButton.addEventListener('click', async () => {
  try {
    currentCollectLog = null;
    lastCollectDiagnostics = [];
    await chrome.storage.local.remove(['latestCollectLog']);
    renderDiagnostics();
    setStatus('日志已清空');
  } catch (error) {
    setStatus(error.message || '清空日志失败');
  }
});

toggleLogButton.addEventListener('click', () => {
  diagnosticsExpanded = !diagnosticsExpanded;
  renderDiagnostics();
});

loadLatest();
