// hot-search.mjs —— 热搜数据获取与解析（纯逻辑，可测试，无 MCP SDK 依赖）。
// 数据源可配置，默认微博热搜，可选知乎热榜。供 hot-search-mcp.js 调用。

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// 解析微博热搜：统一成 { rank, title, hot, label, url }
export function parseWeibo(json) {
  const list = json?.data?.realtime ?? [];
  return list
    .map((it, i) => ({
      rank: i + 1,
      title: it?.word ?? it?.note ?? '',
      hot: it?.num ?? null,
      label: it?.label_name ?? '',
      url: it?.word ? `https://s.weibo.com/weibo?q=${encodeURIComponent(it.word)}` : '',
    }))
    .filter(x => x.title);
}

// 解析知乎热榜
export function parseZhihu(json) {
  const list = json?.data ?? [];
  return list
    .map((it, i) => ({
      rank: i + 1,
      title: it?.target?.title ?? '',
      hot: it?.detail_text ?? null,
      label: '',
      url: it?.target?.url ?? (it?.target?.id ? `https://www.zhihu.com/question/${it.target.id}` : ''),
    }))
    .filter(x => x.title);
}

const SOURCES = {
  weibo: { url: 'https://weibo.com/ajax/side/hotSearch', parse: parseWeibo, referer: 'https://weibo.com/' },
  zhihu: { url: 'https://api.zhihu.com/topstory/hot-list?limit=50', parse: parseZhihu, referer: 'https://www.zhihu.com/' },
};

// 拉取热搜：source 取 weibo/zhihu，limit 条数。fetchFn 可注入（测试用 mock）。
export async function fetchHot(source = 'weibo', limit = 10, { fetchFn = fetch, timeoutMs = 6000 } = {}) {
  const cfg = SOURCES[source];
  if (!cfg) throw new Error(`未知热搜源：${source}（支持 weibo/zhihu）`);
  const res = await fetchFn(cfg.url, {
    headers: { 'User-Agent': UA, 'Accept': 'application/json', 'Referer': cfg.referer },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${source} 热搜返回 HTTP ${res.status}`);
  const json = await res.json();
  return cfg.parse(json).slice(0, Math.max(1, Math.min(50, Number(limit) || 10)));
}
