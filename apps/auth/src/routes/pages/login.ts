/**
 * GET /login — Serves the HTML login page.
 * Shows local email/password form and Google SSO button.
 * Handles both OIDC authorize flow (redirects back to client) and direct admin login.
 */
import type { FastifyInstance } from 'fastify';
import { authPageLayout } from '../../views/layout.js';

export function registerLoginPageRoute(app: FastifyInstance): void {
  app.get('/login', async (_request, reply) => {
    const html = authPageLayout('Sign In', `
    <p class="subtitle">Sign in to your account to continue.</p>
    <div id="error-msg" class="error-msg" style="display:none"></div>
    <form id="login-form">
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required placeholder="admin@iexcel.com" autocomplete="email">
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required placeholder="Enter your password" autocomplete="current-password">
      </div>
      <button type="submit" class="btn btn-primary" id="submit-btn">Sign in</button>
    </form>
    <div class="divider"><span>or</span></div>
    <a href="/login/google" class="btn btn-secondary" style="width:100%;text-align:center;text-decoration:none">
      Sign in with Google
    </a>
    <script>
      const form = document.getElementById('login-form');
      const errorEl = document.getElementById('error-msg');
      const submitBtn = document.getElementById('submit-btn');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in...';

        try {
          const res = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: document.getElementById('email').value,
              password: document.getElementById('password').value,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            errorEl.textContent = data.error_description || 'Invalid email or password.';
            errorEl.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Sign in';
            return;
          }

          // OIDC flow — redirect back to the client application
          if (data.redirect_to) {
            window.location.href = data.redirect_to;
            return;
          }

          // Direct login — store tokens for admin console
          sessionStorage.setItem('access_token', data.access_token);
          sessionStorage.setItem('refresh_token', data.refresh_token || '');
          sessionStorage.setItem('expires_at', String(Math.floor(Date.now()/1000) + (data.expires_in || 3600)));
          window.location.href = '/console/clients';
        } catch {
          errorEl.textContent = 'Unable to connect to server.';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign in';
        }
      });
    </script>`);

    return reply.type('text/html').send(html);
  });
}
