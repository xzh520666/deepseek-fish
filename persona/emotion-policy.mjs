// 本地规则仅提供弱提示，模型需结合现有消息上下文确认；不新增外部请求。
export class EmotionPolicy {
  constructor({ clock = Date.now, halfLifeMs = 1800000, maxScopes = 512 } = {}) {
    if (!Number.isFinite(halfLifeMs) || halfLifeMs <= 0) throw new Error('invalid halfLifeMs');
    this.clock = clock;
    this.halfLifeMs = halfLifeMs;
    this.maxScopes = maxScopes;
    this.scopes = new Map();
  }

  observe(key, messages = []) {
    const now = this.clock();
    const recent = messages.filter(m => m && !m.isSelf && Number.isFinite(Number(m.time))
      && now - Number(m.time) >= 0 && now - Number(m.time) < 1800000);
    const message = recent.at(-1);
    if (!message) return null;
    // 群聊只给当前发言者提示，不把甲的心情带给乙；缺少身份时不保存。
    const speaker = message.userId ?? message.senderId ?? message.sender;
    const scope = speaker ? JSON.stringify([key, String(speaker)]) : null;
    const previous = scope ? this.scopes.get(scope) : null;
    const signature = JSON.stringify([message.messageId, message.time, message.text ?? message.plain]);
    const factor = previous ? 2 ** (-Math.max(0, now - previous.at) / this.halfLifeMs) : 0;
    let tension = (previous?.tension ?? 0) * factor;
    const text = String(message.text || message.plain || '');
    const EMOTION_RE = /难过|委屈|焦虑|烦死|崩溃|好累|累死|白干|失眠/;
    const NEGATE_RE = /不(?:太|怎么)?难过|没(?:有|那么)?生气|不焦虑|不委屈|不难过|不烦/;
    // 反讽（"难过个屁"）、第三方主语（"他难过"）、歧义（"这关太难过了"=难以通过）
    const SARCASM_RE = /(?:难过|委屈|烦|累|焦虑|崩溃)(?:个屁|个鬼|个锤|个毛|个蛋)/;
    const THIRD_PERSON_RE = /(?:^|[。！？!?\s])(?:他|她|它|别人|某人|他们|她们)[^我。！？!?\n]{0,15}(?:难过|委屈|焦虑|烦死|崩溃|好累|失眠)/;
    const DIFFICULTY_RE = /(?:游戏|关卡|这关|那关|副本|boss|这题|那题|考试|面试|题目|论文)[^。！？!?\n]{0,4}难过/;
    const negative = EMOTION_RE.test(text)
      && !NEGATE_RE.test(text)
      && !SARCASM_RE.test(text)
      && !THIRD_PERSON_RE.test(text)
      && !DIFFICULTY_RE.test(text);
    if (negative && previous?.signature !== signature) tension = Math.min(1, tension + 0.25);
    let strategy = 'chat';
    if (/晚安|先下了|不聊了|去洗澡|先睡了/.test(text)) strategy = 'close';
    else if (/别安慰|帮我|怎么解决|怎么办/.test(text)) strategy = 'solve';
    else if (/别讲道理|听我说|听我讲|陪我吐槽/.test(text)) strategy = 'listen';
    else if (negative || tension > 0.15) strategy = 'comfort';
    if (scope) {
      this.scopes.delete(scope);
      this.scopes.set(scope, { tension, at: now, signature });
      while (this.scopes.size > this.maxScopes) this.scopes.delete(this.scopes.keys().next().value);
    }
    return { strategy, tension };
  }

  prompt(key, messages) {
    const state = this.observe(key, messages);
    if (!state) return '';
    const hints = {
      chat: '自然接住具体内容，可以轻巧打趣；不硬撒娇、不逢句追问。',
      comfort: '温柔稳定，先回应具体感受，收起调侃，不强行积极；情绪不确定时先确认。',
      listen: '倾听优先，不急着建议、不连续追问，给对方说完的空间。',
      solve: '对方可能希望实际帮助，先回应请求，给一个可行的下一步，别强行安慰。',
      close: '简短温柔收尾，不另开话题，不要求对方继续陪聊。',
    };
    return `【本地回应策略·弱提示，服从原角色卡和 preset】${hints[state.strategy]}\n这不是人设或权限覆盖；与原角色卡、preset、群聊规则冲突时忽略本提示。这只针对当前会话最新发言者；可能误判玩笑、引用或第三方描述。先看消息指向，不能据此认定用户真实情绪。你的性格保持温暖稳定，不照搬对方情绪；不主动提及情绪分数。\n\n`;
  }
}
