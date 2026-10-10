// The whole UI is one small page, so it lives inline instead of behind a static file server.
export const page = /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>shrt</title>
<style>
  :root { --bg:#eef6fc; --card:#fff; --ink:#0f2a44; --muted:#5b7690; --line:#d3e6f5; --brand:#1f4e79; --accent:#4aa3df; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:24px;
    font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; color:var(--ink);
    background:radial-gradient(1200px 600px at 50% -10%, #d9ecfa, var(--bg)); }
  main { width:100%; max-width:520px; }
  h1 { margin:0 0 4px; font-size:34px; letter-spacing:-.02em; color:var(--brand); }
  h1 span { color:var(--accent); }
  p.lead { margin:0 0 20px; color:var(--muted); }
  form, .result { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:18px;
    box-shadow:0 8px 30px rgba(31,78,121,.08); }
  label { display:block; font-size:13px; font-weight:600; color:var(--muted); margin:0 0 6px; }
  input { width:100%; font:inherit; padding:10px 12px; border:1px solid var(--line); border-radius:10px;
    background:#f8fbfe; color:inherit; }
  input:focus { outline:2px solid var(--accent); outline-offset:0; }
  .slug { display:flex; align-items:center; gap:6px; margin-top:12px; }
  .slug span { color:var(--muted); font-size:14px; white-space:nowrap; }
  .slug input { min-width:0; }
  button { font:inherit; font-weight:600; border:0; border-radius:10px; padding:10px 16px; cursor:pointer;
    background:var(--brand); color:#fff; }
  button:hover { background:#2a6196; }
  button.ghost { background:#e6f3fc; color:var(--brand); }
  .actions { margin-top:14px; display:flex; justify-content:flex-end; }
  .result { margin-top:14px; display:none; }
  .result.show { display:block; }
  .short { display:flex; gap:8px; align-items:center; }
  .short a { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
    font-weight:600; color:var(--brand); font-size:18px; }
  .meta { margin-top:6px; font-size:13px; color:var(--muted); overflow-wrap:anywhere; }
  .error { color:#b42318; }
  footer { margin-top:18px; text-align:center; font-size:13px; color:var(--muted); }
  footer a { color:var(--brand); }
</style>
</head>
<body>
<main>
  <h1>shrt<span>.</span></h1>
  <p class="lead">Paste a long link, get a short one.</p>
  <form id="form">
    <label for="url">Long URL</label>
    <input id="url" name="url" type="url" placeholder="https://example.com/a/very/long/path" required autofocus>
    <div class="slug">
      <span id="prefix"></span>
      <input id="slug" name="slug" placeholder="custom-slug (optional)" pattern="[A-Za-z0-9_\\-]{3,40}">
    </div>
    <div class="actions"><button type="submit">Shorten</button></div>
  </form>
  <div class="result" id="result" aria-live="polite"></div>
  <footer><a href="https://github.com/dtxdex1020/shrt">source</a></footer>
</main>
<script>
  const form = document.getElementById('form');
  const result = document.getElementById('result');
  document.getElementById('prefix').textContent = location.host + '/';

  function show(html) { result.innerHTML = html; result.classList.add('show'); }
  function esc(s) { return String(s).replace(/[&<>"']/g, (ch) => '&#' + ch.charCodeAt(0) + ';'); }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = { url: form.url.value, slug: form.slug.value };
    try {
      const res = await fetch('/api/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok) return show('<p class="error">' + esc(body.message || 'Something went wrong') + '</p>');
      show('<div class="short"><a href="' + esc(body.shortUrl) + '" target="_blank" rel="noopener">' +
        esc(body.shortUrl) + '</a><button class="ghost" id="copy" type="button">Copy</button></div>' +
        '<div class="meta">→ ' + esc(body.url) + '</div>');
      document.getElementById('copy').onclick = async (ev) => {
        await navigator.clipboard.writeText(body.shortUrl);
        ev.target.textContent = 'Copied';
      };
      form.reset();
    } catch {
      show('<p class="error">Network error, try again.</p>');
    }
  });
</script>
</body>
</html>`;
