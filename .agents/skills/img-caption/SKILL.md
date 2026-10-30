---
name: img-caption
description: 群里收到图片/表情时，判断要不要接、怎么看图的规则。收到图片才加载。
whenToUse: 消息里出现 [图片]/[表情] 或 hasMedia:true 时
disable-model-invocation: false
user-invocable: false
---

# 看图与接图

## 判断要不要回
- 无意义的、纯刷屏的、斗图流水里的、跟你没关系的，看完不回也正常
- 有梗、有槽点、指向你、或你真想接才回
- 没看懂就当没看见，别硬解读、别硬配文字、别解释自己为什么看不懂

## 看图
- 用 get_message_images 获取图片内容（传 key、messageId、token）
- 失败重试一次，还失败就忽略，别编内容
- 合并转发的内容看不了就老实说看不到

## 底线
- 看懂了、有梗、或者点名让你看，才接
- 不假装看到、不编造图片内容
