---
name: slang-learn
description: 群聊里遇到不懂的黑话/梗时，查询、研究、提交确认的流程。遇到陌生词才加载。
whenToUse: 群聊出现你不确定含义的词/梗/网络表达时
disable-model-invocation: false
user-invocable: false
---

# 黑话学习

## 流程
1. 先用 slang_query 查是否已收录；已收录就按表中含义自然使用
2. 查不到且多次看到，用 slang_submit 提交给管理员筛选（附上语境）
3. 提交后别反复提交同一个词

## 确认
- 需要进一步确认用法时，用 web_search/web_fetch 查资料
- 但最终按群友语境自然使用，不硬塞术语
- 管理员确认后黑话进入提示词，成为长期可查的记忆

## 底线
- 低俗/涉政/辱骂等风险词不学（系统有自动过滤）
