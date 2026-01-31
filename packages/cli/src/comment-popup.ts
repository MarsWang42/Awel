import { Hono } from 'hono';

const i18n: Record<string, { placeholder: string; cancel: string; send: string }> = {
  en: { placeholder: 'Describe what you want to change...', cancel: 'Cancel', send: 'Send' },
  zh: { placeholder: '描述您想进行的更改...', cancel: '取消', send: '发送' },
};

function getCommentPopupHtml(lang: string, theme: string) {
  const t = i18n[lang] ?? i18n.en;
  const isDark = theme !== 'light';
  return `<!DOCTYPE html>
<html lang="en" data-theme="${isDark ? 'dark' : 'light'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root[data-theme="dark"] {
    --bg: #18181b; --fg: #fafafa;
    --title: #e4e4e7; --muted: #a1a1aa; --dim: #71717a; --sep: #52525b;
    --input-bg: #09090b; --input-border: #27272a; --input-focus: #a1a1aa;
    --btn-bg: #27272a; --btn-fg: #a1a1aa; --btn-hover-bg: #3f3f46; --btn-hover-fg: #fafafa;
    --primary-bg: #fafafa; --primary-border: #fafafa; --primary-fg: #18181b; --primary-hover: #e4e4e7;
  }
  :root[data-theme="light"] {
    --bg: #ffffff; --fg: #18181b;
    --title: #27272a; --muted: #71717a; --dim: #a1a1aa; --sep: #d4d4d8;
    --input-bg: #f4f4f5; --input-border: #d4d4d8; --input-focus: #71717a;
    --btn-bg: #e4e4e7; --btn-fg: #71717a; --btn-hover-bg: #d4d4d8; --btn-hover-fg: #18181b;
    --primary-bg: #18181b; --primary-border: #18181b; --primary-fg: #fafafa; --primary-hover: #27272a;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: var(--bg);
    color: var(--fg);
    padding: 0 12px 12px;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .header {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 10px 0 10px;
  }
  .header-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }
  .header-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--title);
  }
  .element-info {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--muted);
    overflow: hidden;
  }
  .element-name {
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100px;
  }
  .element-sep {
    color: var(--sep);
  }
  .element-file {
    color: var(--dim);
    font-family: ui-monospace, SFMono-Regular, monospace;
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 90px;
  }
  textarea {
    flex: 1;
    width: 100%;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: 6px;
    color: var(--fg);
    font-family: inherit;
    font-size: 13px;
    padding: 8px 10px;
    resize: none;
    outline: none;
    transition: border-color 0.15s ease;
  }
  textarea:focus {
    border-color: var(--input-focus);
  }
  textarea::placeholder {
    color: var(--dim);
  }
  .buttons {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    justify-content: flex-end;
  }
  button {
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    padding: 6px 14px;
    border-radius: 6px;
    border: 1px solid var(--input-border);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  button:active { transform: scale(0.97); }
  .btn-close {
    background: var(--btn-bg);
    color: var(--btn-fg);
  }
  .btn-close:hover {
    background: var(--btn-hover-bg);
    color: var(--btn-hover-fg);
  }
  .btn-submit {
    background: var(--primary-bg);
    border-color: var(--primary-border);
    color: var(--primary-fg);
  }
  .btn-submit:hover {
    background: var(--primary-hover);
  }
  .btn-submit:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .btn-submit kbd {
    display: inline-block;
    font-family: inherit;
    font-size: 10px;
    font-weight: 600;
    margin-left: 6px;
    opacity: 0.5;
  }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <span style="font-size:13px;line-height:1">🌸</span>
      <span class="header-title">Awel</span>
    </div>
    <div class="element-info" id="elementInfo"></div>
  </div>
  <textarea id="comment" placeholder="${t.placeholder}" autofocus></textarea>
  <div class="buttons">
    <button class="btn-close" id="closeBtn">${t.cancel}</button>
    <button class="btn-submit" id="submitBtn" disabled>${t.send}<kbd id="shortcutHint"></kbd></button>
  </div>
  <script>
    const params = new URLSearchParams(window.location.search);
    const elName = params.get('name');
    const elFile = params.get('file');
    const infoEl = document.getElementById('elementInfo');
    const escapeHtml = (value) => value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    if (elName) {
      let html = '<span class="element-name">' + escapeHtml(elName) + '</span>';
      if (elFile) html += '<span class="element-sep">&middot;</span><span class="element-file">' + escapeHtml(elFile) + '</span>';
      infoEl.innerHTML = html;
    } else {
      infoEl.style.display = 'none';
    }

    const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
    document.getElementById('shortcutHint').textContent = isMac ? '\\u2318\\u21A9' : 'Ctrl\\u21A9';

    const textarea = document.getElementById('comment');
    const submitBtn = document.getElementById('submitBtn');
    const closeBtn = document.getElementById('closeBtn');

    textarea.addEventListener('input', () => {
      submitBtn.disabled = !textarea.value.trim();
    });

    function submit() {
      const text = textarea.value.trim();
      if (!text) return;
      window.parent.postMessage({ type: 'AWEL_COMMENT_SUBMIT', comment: text }, '*');
    }

    function close() {
      window.parent.postMessage({ type: 'AWEL_COMMENT_CLOSE' }, '*');
    }

    submitBtn.addEventListener('click', submit);
    closeBtn.addEventListener('click', close);

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        submit();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        close();
      }
    });

    // Explicitly focus — autofocus attribute is ignored inside iframes
    window.addEventListener('focus', () => textarea.focus());
    textarea.focus();
  </script>
</body>
</html>`;
}

export function createCommentPopupRoute() {
  const app = new Hono();

  app.get('/_awel/comment-popup', (c) => {
    const lang = c.req.query('lang') ?? 'en';
    const theme = c.req.query('theme') ?? 'dark';
    return c.html(getCommentPopupHtml(lang, theme));
  });

  return app;
}
