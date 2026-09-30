import type { Design } from "./types.js";

export function buildPrompt(design: Design, purpose = '') {
  return `请为${purpose.trim() || '我的网站'}设计并实现一个「${design.name} / ${design.english}」风格的响应式界面。\n\n设计方向：${design.description}\n适合场景：${design.use}。\n\n视觉规范\n- 配色：${design.colors.join('、')}（按背景、主要文字或强调色的视觉角色使用，优先保证对比度）。\n- 布局：${design.layout}。\n- 字体：${design.typography}。\n- 表面与细节：${design.surface}。\n- 交互：${design.interaction}。\n\n实现要求\n- 将风格一致应用于导航、标题、卡片、按钮和表单；内容以实际业务需求为准。\n- 桌面和移动端均可用，窄屏合理折行且无水平溢出。\n- 使用语义化 HTML，支持键盘导航、可见焦点、可读的文字对比度；尊重 prefers-reduced-motion。\n- 为真实交互提供必要的空状态、错误提示与成功反馈。\n- 避免用不可读的装饰文字或图片代替界面；交付可运行代码。`;
}
