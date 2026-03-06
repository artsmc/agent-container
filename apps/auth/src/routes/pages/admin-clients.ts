/**
 * Admin UI pages for OIDC client management.
 * Served as HTML with vanilla JS that calls the existing admin JSON API.
 *
 * Uses /console/ prefix to avoid route conflicts with JSON admin endpoints at /admin/.
 */
import type { FastifyInstance } from 'fastify';
import { adminPageLayout, escapeHtml } from '../../views/layout.js';

export function registerAdminPageRoutes(app: FastifyInstance): void {
  // Helper: returns auth headers from sessionStorage token via JS
  const authScript = `
    function getToken() { return sessionStorage.getItem('access_token'); }
    function authHeaders() { return { 'Authorization': 'Bearer ' + getToken(), 'Content-Type': 'application/json' }; }
    function checkAuth() { if (!getToken()) { window.location.href = '/login'; return false; } return true; }
  `;

  // GET /console/clients — List all OIDC clients
  app.get('/console/clients', async (_request, reply) => {
    const html = adminPageLayout('OIDC Clients', `
    <div class="card">
      <div class="toolbar">
        <h1>OIDC Clients</h1>
        <a href="/console/clients/new" class="btn btn-primary btn-sm">Create Client</a>
      </div>
      <div id="error-msg" class="error-msg" style="display:none"></div>
      <table>
        <thead>
          <tr><th>Name</th><th>Client ID</th><th>Type</th><th>Grants</th><th>Status</th><th></th></tr>
        </thead>
        <tbody id="clients-body">
          <tr><td colspan="6" class="empty-row">Loading...</td></tr>
        </tbody>
      </table>
    </div>
    <script>
      ${authScript}
      if (!checkAuth()) throw new Error('redirect');

      async function loadClients() {
        const errorEl = document.getElementById('error-msg');
        try {
          const res = await fetch('/admin/clients', { headers: authHeaders() });
          if (res.status === 401 || res.status === 403) { window.location.href = '/login'; return; }
          if (!res.ok) throw new Error('Failed to load clients');
          const data = await res.json();
          const tbody = document.getElementById('clients-body');
          if (!data.clients || data.clients.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No clients found.</td></tr>';
            return;
          }
          tbody.innerHTML = data.clients.map(c => \`
            <tr>
              <td>\${esc(c.client_name)}</td>
              <td><code>\${esc(c.client_id)}</code></td>
              <td>\${esc(c.client_type)}</td>
              <td>\${(c.grant_types||[]).join(', ')}</td>
              <td><span class="\${c.is_active ? 'status-active' : 'status-inactive'}">\${c.is_active ? 'Active' : 'Inactive'}</span></td>
              <td><a href="/console/clients/\${c.id}">View</a></td>
            </tr>
          \`).join('');
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
        }
      }

      function esc(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
      }

      loadClients();
    </script>`);
    return reply.type('text/html').send(html);
  });

  // GET /console/clients/new — Create client form
  app.get('/console/clients/new', async (_request, reply) => {
    const html = adminPageLayout('Create Client', `
    <div class="card" style="max-width:560px">
      <h1 style="font-size:1.25rem;font-weight:700;margin-bottom:1rem">Create OIDC Client</h1>
      <div id="error-msg" class="error-msg" style="display:none"></div>
      <div id="success-panel" style="display:none">
        <div class="success-msg">Client created successfully!</div>
        <p style="font-size:0.875rem;color:var(--color-text-secondary);margin:0.5rem 0">Save this client secret now. It will not be shown again.</p>
        <div class="secret-box">
          <code id="secret-value"></code>
          <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('secret-value').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy'},2000)})">Copy</button>
        </div>
        <a href="/console/clients" class="btn btn-primary btn-sm">Done</a>
      </div>
      <form id="create-form">
        <div class="form-group">
          <label for="client_id">Client ID</label>
          <input type="text" id="client_id" name="client_id" required placeholder="my-app">
        </div>
        <div class="form-group">
          <label for="client_name">Client Name</label>
          <input type="text" id="client_name" name="client_name" required placeholder="My Application">
        </div>
        <div class="form-group">
          <label for="client_type">Client Type</label>
          <select id="client_type" name="client_type">
            <option value="public">Public</option>
            <option value="confidential">Confidential</option>
          </select>
        </div>
        <fieldset>
          <legend>Grant Types</legend>
          <div class="checkbox-group">
            <label class="checkbox-label"><input type="checkbox" name="grant" value="authorization_code"> authorization_code</label>
            <label class="checkbox-label"><input type="checkbox" name="grant" value="refresh_token"> refresh_token</label>
            <label class="checkbox-label"><input type="checkbox" name="grant" value="device_code"> device_code</label>
            <label class="checkbox-label"><input type="checkbox" name="grant" value="client_credentials"> client_credentials</label>
          </div>
        </fieldset>
        <div class="form-group">
          <label for="redirect_uris">Redirect URIs (one per line)</label>
          <textarea id="redirect_uris" name="redirect_uris" rows="3" placeholder="https://example.com/callback"></textarea>
        </div>
        <div class="form-group">
          <label for="scopes">Scopes (comma-separated)</label>
          <input type="text" id="scopes" name="scopes" placeholder="openid, profile, email">
        </div>
        <button type="submit" class="btn btn-primary" id="submit-btn">Create Client</button>
      </form>
    </div>
    <script>
      ${authScript}
      if (!checkAuth()) throw new Error('redirect');

      const form = document.getElementById('create-form');
      const errorEl = document.getElementById('error-msg');
      const submitBtn = document.getElementById('submit-btn');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        const grants = Array.from(document.querySelectorAll('input[name="grant"]:checked')).map(el => el.value);
        const uris = document.getElementById('redirect_uris').value.split('\\n').map(s => s.trim()).filter(Boolean);
        const scopes = document.getElementById('scopes').value.split(',').map(s => s.trim()).filter(Boolean);

        const body = {
          client_id: document.getElementById('client_id').value,
          client_name: document.getElementById('client_name').value,
          client_type: document.getElementById('client_type').value,
          grant_types: grants,
          redirect_uris: uris,
          scopes: scopes,
        };

        try {
          const res = await fetch('/admin/clients', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify(body),
          });
          const data = await res.json();

          if (!res.ok) {
            errorEl.textContent = data.error_description || 'Failed to create client.';
            errorEl.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Client';
            return;
          }

          if (data.client_secret) {
            document.getElementById('secret-value').textContent = data.client_secret;
            document.getElementById('success-panel').style.display = 'block';
            form.style.display = 'none';
          } else {
            window.location.href = '/console/clients';
          }
        } catch {
          errorEl.textContent = 'Unable to connect to server.';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Client';
        }
      });
    </script>`);
    return reply.type('text/html').send(html);
  });

  // GET /console/clients/:id — Client detail
  app.get<{ Params: { id: string } }>('/console/clients/:id', async (request, reply) => {
    const clientId = request.params.id;
    const html = adminPageLayout('Client Detail', `
    <div class="card" style="max-width:640px">
      <div id="loading">Loading client...</div>
      <div id="detail" style="display:none">
        <h1 id="client-name" style="font-size:1.25rem;font-weight:700;margin-bottom:1rem"></h1>
        <div id="error-msg" class="error-msg" style="display:none"></div>
        <div id="rotated-secret" style="display:none">
          <p style="font-size:0.875rem;color:var(--color-text-secondary)">New secret — save it now. It will not be shown again.</p>
          <div class="secret-box">
            <code id="secret-value"></code>
            <button class="btn btn-secondary btn-sm" onclick="navigator.clipboard.writeText(document.getElementById('secret-value').textContent).then(()=>{this.textContent='Copied!';setTimeout(()=>{this.textContent='Copy'},2000)})">Copy</button>
          </div>
        </div>
        <dl class="detail-grid" id="detail-grid"></dl>
        <div class="actions" id="actions"></div>
      </div>
    </div>
    <script>
      ${authScript}
      if (!checkAuth()) throw new Error('redirect');

      const clientId = '${escapeHtml(clientId)}';

      function esc(s) {
        const d = document.createElement('div');
        d.textContent = s || '';
        return d.innerHTML;
      }

      async function loadClient() {
        try {
          const res = await fetch('/admin/clients/' + clientId, {
            headers: authHeaders()
          });
          if (res.status === 401 || res.status === 403) { window.location.href = '/login'; return; }
          if (!res.ok) throw new Error('Client not found');
          const c = await res.json();

          document.getElementById('loading').style.display = 'none';
          document.getElementById('detail').style.display = 'block';
          document.getElementById('client-name').textContent = c.client_name;

          const grid = document.getElementById('detail-grid');
          grid.innerHTML = \`
            <dt>Client ID</dt><dd><code>\${esc(c.client_id)}</code></dd>
            <dt>Type</dt><dd>\${esc(c.client_type)}</dd>
            <dt>Status</dt><dd><span class="\${c.is_active ? 'status-active' : 'status-inactive'}">\${c.is_active ? 'Active' : 'Inactive'}</span></dd>
            <dt>Grant Types</dt><dd>\${(c.grant_types||[]).join(', ') || 'None'}</dd>
            <dt>Redirect URIs</dt><dd>\${(c.redirect_uris||[]).join(', ') || 'None'}</dd>
            <dt>Scopes</dt><dd>\${(c.scopes||[]).join(', ') || 'None'}</dd>
            <dt>Token Lifetime</dt><dd>\${c.token_lifetime}s</dd>
            <dt>Refresh Lifetime</dt><dd>\${c.refresh_token_lifetime}s</dd>
            <dt>Created</dt><dd>\${new Date(c.created_at).toLocaleString()}</dd>
            <dt>Updated</dt><dd>\${new Date(c.updated_at).toLocaleString()}</dd>
          \`;

          const actions = document.getElementById('actions');
          let btns = '<a href="/console/clients" class="btn btn-secondary btn-sm">Back to Clients</a>';
          if (c.client_type === 'confidential') {
            btns += ' <button class="btn btn-secondary btn-sm" onclick="rotateSecret()">Rotate Secret</button>';
          }
          if (c.is_active) {
            btns += ' <button class="btn btn-danger btn-sm" onclick="deactivateClient()">Deactivate</button>';
          }
          actions.innerHTML = btns;
        } catch (err) {
          document.getElementById('loading').textContent = err.message;
        }
      }

      async function rotateSecret() {
        if (!confirm('Rotate client secret? The old secret will stop working immediately.')) return;
        const errorEl = document.getElementById('error-msg');
        try {
          const res = await fetch('/admin/clients/' + clientId + '/rotate-secret', {
            method: 'POST',
            headers: authHeaders(),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error_description || 'Failed to rotate secret');
          document.getElementById('secret-value').textContent = data.client_secret;
          document.getElementById('rotated-secret').style.display = 'block';
        } catch (err) {
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
        }
      }

      async function deactivateClient() {
        if (!confirm('Deactivate this client? It will no longer be able to authenticate.')) return;
        try {
          const res = await fetch('/admin/clients/' + clientId, {
            method: 'DELETE',
            headers: authHeaders(),
          });
          if (!res.ok) { const d = await res.json(); throw new Error(d.error_description || 'Failed'); }
          window.location.href = '/console/clients';
        } catch (err) {
          const errorEl = document.getElementById('error-msg');
          errorEl.textContent = err.message;
          errorEl.style.display = 'block';
        }
      }

      loadClient();
    </script>`);
    return reply.type('text/html').send(html);
  });
}
