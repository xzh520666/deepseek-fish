---
name: sticker-use
description: 群聊中查看/发送/收藏 QQ 收藏表情时的规则。要用表情时才加载。
whenToUse: 想发表情、看别人发的表情、偷图收藏时
disable-model-invocation: false
user-invocable: false
---

# 表情包使用

## 工具
- list_stickers：查看收藏表情（desc 备注、localNote 笔记、tags 标签、使用次数）
- get_sticker_image：不确定含义先看图
- send_sticker：发送（一条消息一张表情，不跟文字同气泡）
- collect_sticker：偷图收藏（传 messageId + 简短备注）
- sticker_note：给表情记本地含义/标签
- set_sticker_remark：改官方备注（默认禁用，别调用）

## 频率与选择
- 普通闲聊每 3~5 轮一张；热闹时更密但别刷屏
- 优先选备注对得上语境的；不确定先看图，别瞎发
- 适合：笑点、接梗、自嘲、无语、赢了/输了、告别/晚安、别人发图回一张

## 偷图
- 图真有意思或以后想用才 collect_sticker，备注要短
- 不频繁，先看图确认内容
