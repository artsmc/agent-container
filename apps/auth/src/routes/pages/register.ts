/**
 * GET /register — Serves the HTML registration page.
 */
import type { FastifyInstance } from 'fastify';
import { authPageLayout } from '../../views/layout.js';

export function registerRegisterPageRoute(app: FastifyInstance): void {
  app.get('/register', async (_request, reply) => {
    const html = authPageLayout('Create Account', `
    <p class="subtitle">Register a new account.</p>
    <div id="error-msg" class="error-msg" style="display:none"></div>
    <div id="success-msg" class="success-msg" style="display:none"></div>
    <form id="register-form">
      <div class="form-group">
        <label for="name">Name</label>
        <input type="text" id="name" name="name" required placeholder="Your name" autocomplete="name">
      </div>
      <div class="form-group">
        <label for="email">Email</label>
        <input type="email" id="email" name="email" required placeholder="you@example.com" autocomplete="email">
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" required minlength="8" placeholder="At least 8 characters" autocomplete="new-password">
      </div>
      <button type="submit" class="btn btn-primary" id="submit-btn">Create Account</button>
    </form>
    <p style="text-align:center;font-size:0.875rem;margin-top:1rem">
      Already have an account? <a href="/login">Sign in</a>
    </p>
    <script>
      const form = document.getElementById('register-form');
      const errorEl = document.getElementById('error-msg');
      const successEl = document.getElementById('success-msg');
      const submitBtn = document.getElementById('submit-btn');

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorEl.style.display = 'none';
        successEl.style.display = 'none';
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating...';

        try {
          const res = await fetch('/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: document.getElementById('name').value,
              email: document.getElementById('email').value,
              password: document.getElementById('password').value,
            }),
          });

          const data = await res.json();

          if (!res.ok) {
            errorEl.textContent = data.error_description || 'Registration failed.';
            errorEl.style.display = 'block';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Create Account';
            return;
          }

          successEl.textContent = 'Account created! Redirecting to login...';
          successEl.style.display = 'block';
          setTimeout(() => { window.location.href = '/login'; }, 1500);
        } catch {
          errorEl.textContent = 'Unable to connect to server.';
          errorEl.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create Account';
        }
      });
    </script>`);

    return reply.type('text/html').send(html);
  });
}
