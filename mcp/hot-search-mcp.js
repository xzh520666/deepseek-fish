#!/usr/bin/env node
// hot-search-mcp.js —— 热搜 MCP：把微博/知乎热搜榜单暴露给 DSH。
// 用途：AI 冷场抛话题、聊时事、主动学习当下网络热点和梗。
// 用法：node hot-search-mcp.js           作为 MCP stdio 服务
//       node hot-search-mcp.js --selftest  自检（真实拉一次热搜）
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { fetchHot } from './hot-search.mjs';

const server = new Server(
  { name: 'hot-search', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'get_hot_search',
      description:
        '获取微博/知乎热搜榜单。用途：① 群里冷场时抛个当下热点当话题；② 群友聊到时事/热点时了解背景；③ 主动学习当下流行的网络梗和热词。不是被问到才查，冷场、想找话题、想学新梗都可以主动调。',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: '数据源：weibo（微博，默认）或 zhihu（知乎）' },
          limit: { type: 'number', description: '返回条数，默认 10，最多 50' },
        },
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  if (name !== 'get_hot_search') {
    return { content: [{ type: 'text', text: 'unknown tool: ' + name }], isError: true };
  }
  const source = String(args.source ?? 'weibo');
  const limit = Number(args.limit) || 10;
  try {
    const items = await fetchHot(source, limit);
    if (!items.length) {
      return { content: [{ type: 'text', text: '没有拿到热搜（可能接口异常），别硬编。' }] };
    }
    const text = items.map(it => `${it.rank}. ${it.title}${it.hot ? `（${it.hot}）` : ''}`).join('\n');
    return { content: [{ type: 'text', text: `【${source === 'weibo' ? '微博' : '知乎'}热搜】\n${text}\n\n挑一两条能自然接进对话的，别背榜单。` }] };
  } catch (error) {
    return { content: [{ type: 'text', text: `热搜获取失败：${error?.message ?? error}` }], isError: true };
  }
});

if (process.argv.includes('--selftest')) {
  for (const src of ['weibo', 'zhihu']) {
    try {
      const items = await fetchHot(src, 5);
      console.log(`${src} 热搜前5：`);
      items.forEach(it => console.log(`  ${it.rank}. ${it.title}`));
    } catch (e) {
      console.log(`${src} 失败：${e?.message ?? e}`);
    }
  }
  process.exit(0);
}

const transport = new StdioServerTransport();
await server.connect(transport);
