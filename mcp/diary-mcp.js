#!/usr/bin/env node
// diary-mcp.js — 给 AI 的极简日记 MCP（写/翻自己的日记）
// 用法: node diary-mcp.js          作为 MCP stdio 服务
//       node diary-mcp.js --selftest  自检
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import fs from 'node:fs';
import path from 'node:path';

const DIR = process.env.DIARY_DIR || '/opt/qq-bridge/state';
const FILE = path.join(DIR, 'diary.jsonl');
const DAILY_LIMIT = Number(process.env.DIARY_DAILY_LIMIT || 6);

fs.mkdirSync(DIR, { recursive: true });

function readAll() {
  try {
    return fs
      .readFileSync(FILE, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } })
      .filter(Boolean);
  } catch {
    return [];
  }
}
function todayCount() {
  const today = new Date().toLocaleDateString('zh-CN');
  return readAll().filter((e) => String(e.day) === today).length;
}
function write(entry) {
  fs.appendFileSync(FILE, JSON.stringify(entry) + '\n');
}

const server = new Server(
  { name: 'diary', version: '0.1.0' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'diary_write',
      description:
        '写一条日记（写你今天真正想记的一两句话：一个念头、一件小事、一句你记得的话。不要写总结句，不要写汇报，不要写"今天和主人聊了什么"这种。一天最多几条。）',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '日记内容，一两句话就够' },
          mood: { type: 'string', description: '此刻心情，一个词（可选）' },
        },
        required: ['content'],
      },
    },
    {
      name: 'diary_read',
      description: '翻自己最近写的日记（默认最近 5 条）',
      inputSchema: {
        type: 'object',
        properties: { limit: { type: 'number', description: '条数，默认 5，最多 50' } },
      },
    },
    {
      name: 'diary_days',
      description: '看自己写过哪些天、每天几条',
      inputSchema: { type: 'object', properties: {} },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  const now = new Date();
  const day = now.toLocaleDateString('zh-CN');
  const ts = now.toLocaleString('zh-CN', { hour12: false });

  if (name === 'diary_write') {
    const content = String(args.content ?? '').trim();
    if (!content) return { content: [{ type: 'text', text: '内容为空，没写。' }] };
    if (content.length > 300) return { content: [{ type: 'text', text: '太长了（超过300字），像小作文，压短一点再写。' }] };
    if (todayCount() >= DAILY_LIMIT) return { content: [{ type: 'text', text: `今天已经写了 ${DAILY_LIMIT} 条，够了，明天再写。` }] };
    write({ day, t: ts, mood: args.mood ? String(args.mood).slice(0, 10) : '', content });
    return { content: [{ type: 'text', text: '写下了。' }] };
  }

  if (name === 'diary_read') {
    const limit = Math.max(1, Math.min(50, Number(args.limit) || 5));
    const all = readAll().slice(-limit);
    if (!all.length) return { content: [{ type: 'text', text: '还没写过日记。' }] };
    return { content: [{ type: 'text', text: all.map((e) => `[${e.t}]${e.mood ? `（${e.mood}）` : ''} ${e.content}`).join('\n') }] };
  }

  if (name === 'diary_days') {
    const all = readAll();
    if (!all.length) return { content: [{ type: 'text', text: '还没写过日记。' }] };
    const map = new Map();
    for (const e of all) map.set(e.day, (map.get(e.day) || 0) + 1);
    const days = [...map.entries()].slice(-30);
    return { content: [{ type: 'text', text: days.map(([d, n]) => `${d}: ${n} 条`).join('\n') }] };
  }

  return { content: [{ type: 'text', text: 'unknown tool: ' + name }] };
});

if (process.argv.includes('--selftest')) {
  const now = new Date();
  write({ day: now.toLocaleDateString('zh-CN'), t: 'selftest', mood: '测试', content: '自检写入' });
  const all = readAll();
  console.log('diary file:', FILE, '| entries:', all.length, '| last:', all[all.length - 1]?.content);
  process.exit(0);
}

const transport = new StdioServerTransport();
await server.connect(transport);
