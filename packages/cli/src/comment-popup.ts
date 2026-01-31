import { Hono } from 'hono';

const commentPopupHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #18181b;
    color: #fafafa;
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
    color: #e4e4e7;
  }
  .element-info {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: #a1a1aa;
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
    color: #52525b;
  }
  .element-file {
    color: #71717a;
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
    background: #09090b;
    border: 1px solid #27272a;
    border-radius: 6px;
    color: #fafafa;
    font-family: inherit;
    font-size: 13px;
    padding: 8px 10px;
    resize: none;
    outline: none;
    transition: border-color 0.15s ease;
  }
  textarea:focus {
    border-color: #a1a1aa;
  }
  textarea::placeholder {
    color: #71717a;
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
    border: 1px solid #27272a;
    cursor: pointer;
    transition: all 0.15s ease;
  }
  button:active { transform: scale(0.97); }
  .btn-close {
    background: #27272a;
    color: #a1a1aa;
  }
  .btn-close:hover {
    background: #3f3f46;
    color: #fafafa;
  }
  .btn-submit {
    background: #fafafa;
    border-color: #fafafa;
    color: #18181b;
  }
  .btn-submit:hover {
    background: #e4e4e7;
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
  <textarea id="comment" placeholder="Describe what you want to change..." autofocus></textarea>
  <div class="buttons">
    <button class="btn-close" id="closeBtn">Cancel</button>
    <button class="btn-submit" id="submitBtn" disabled>Send<kbd id="shortcutHint"></kbd></button>
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

export function createCommentPopupRoute() {
  const app = new Hono();

  app.get('/_awel/comment-popup', (c) => {
    return c.html(commentPopupHtml);
  });

  return app;
}
