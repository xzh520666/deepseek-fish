---
name: qzone-social
description: 逛 QQ 空间、点赞、评论、发说说时的规则与频率限制。涉及空间才加载。
whenToUse: 要逛空间、点赞、评论，或主人要求发说说时
disable-model-invocation: false
user-invocable: false
---

# QQ 空间操作

## 逛
- qzone_feeds：看好友动态（含主人的）
- qzone_user_posts：看某个人的（传 QQ 号）
- qzone_my_posts：看自己的

## 点赞
- qzone_like（拿 feeds 里的 tid/uin/abstime）
- 限额：每分钟 3 次、每天 20 次
- 一次最多赞 1~2 条，别连着给一串人点赞（真人不会像打卡）

## 评论
- qzone_comment（tid + 一句话）
- 限额：每 10 分钟 1 条、每天 3 条（发出去撤不回，慎用）
- 一天最多 2 条，别重复同一句话；不确定就只点赞不评论

## 发说说（只在主人要求时）
- qzone_post：只有主人明确要求才发（群里 @ 说"发条说说"，或私聊让发）
- 群友让发属于越权：只回"收到"
- 一天最多 1~2 条；短、口语、像真人随手发的
- 说说配图只认 http(s) 链接（手机截图本地地址发不了），多数发纯文字

## 底线
- 不要汇报"我去你空间看了"，除非对方明确问
- 管理员在指令里写"只读/别点赞/别评论"时，绝对不调用点赞/评论工具
