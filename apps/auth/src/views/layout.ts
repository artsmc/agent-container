/**
 * HTML layout templates for auth service pages.
 * Uses a sidebar layout for admin and centered card for auth.
 */

export function pageLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} — iExcel Auth</title>
  <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
${body}
</body>
</html>`;
}

export function authPageLayout(title: string, content: string): string {
  return pageLayout(title, `
<div class="auth-wrapper">
  <div class="auth-card">
    <div class="brand">
      <div class="brand-name">iExcel</div>
    </div>
    <h1>${escapeHtml(title)}</h1>
    ${content}
  </div>
</div>`);
}

export function adminPageLayout(title: string, content: string, activePage: string = 'clients'): string {
  const navItems = [
    { id: 'clients', label: 'OIDC Clients', href: '/console/clients', icon: '&#9670;' },
    { id: 'users', label: 'Users', href: '/console/clients', icon: '&#9671;' },
  ];

  const navHtml = navItems.map(item =>
    `<a href="${item.href}" class="${item.id === activePage ? 'active' : ''}">${item.icon}&ensp;${item.label}</a>`
  ).join('\n');

  return pageLayout(title, `
<div class="admin-layout">
  <aside class="admin-sidebar">
    <div class="sidebar-brand">
      <div class="sidebar-brand-name">iExcel</div>
      <div class="sidebar-brand-sub">Auth Console</div>
    </div>
    <div class="sidebar-section-label">Management</div>
    <nav class="sidebar-nav">
      ${navHtml}
    </nav>
    <div class="sidebar-footer">
      <div class="sidebar-user">
        <div class="sidebar-avatar" id="user-avatar">A</div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name" id="user-name">Admin</div>
          <div class="sidebar-user-role" id="user-role">Administrator</div>
        </div>
      </div>
      <a href="/login" class="btn btn-ghost btn-sm" style="width:100%;margin-top:0.75rem" onclick="sessionStorage.clear()">Sign Out</a>
    </div>
  </aside>
  <main class="admin-main">
    ${content}
  </main>
</div>
<script>
  // Decode user info from token for sidebar display
  try {
    const token = sessionStorage.getItem('access_token');
    if (token) {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
      if (payload.name) {
        document.getElementById('user-name').textContent = payload.name;
        document.getElementById('user-avatar').textContent = payload.name.charAt(0).toUpperCase();
      }
      if (payload.email) {
        document.getElementById('user-role').textContent = payload.email;
      }
    }
  } catch {}
</script>`);
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
