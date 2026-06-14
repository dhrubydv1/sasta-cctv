// Shared Authentication Manager for SASTA CCTV

async function checkSession() {
  try {
    const res = await fetch('/api/auth/session');
    const data = await res.json();
    return data;
  } catch (err) {
    console.error('Failed to verify session status:', err);
    return { loggedIn: false };
  }
}

async function updateNavbar() {
  const session = await checkSession();
  const navActions = document.getElementById('nav-actions');
  const navLinksContainer = document.getElementById('nav-links-container');
  
  if (!navActions || !navLinksContainer) return session;

  if (session.loggedIn) {
    // Logged In navbar
    navLinksContainer.innerHTML = `
      <a class="nav-link" id="link-home" href="/">Home</a>
      <a class="nav-link" id="link-monitor" href="/monitor.html">Web Monitor</a>
      <a class="nav-link" id="link-camera" href="/camera.html">Camera Console</a>
    `;
    
    navActions.innerHTML = `
      <div class="user-badge">
        <div class="user-avatar">${session.user.username.charAt(0).toUpperCase()}</div>
        <span style="font-size: 0.9rem; font-weight: 500;">${session.user.username}</span>
      </div>
      <button class="btn btn-secondary" onclick="handleLogout()" style="padding: 0.5rem 1rem; font-size: 0.85rem;">Logout</button>
    `;
  } else {
    // Logged Out navbar
    navLinksContainer.innerHTML = `
      <a class="nav-link" id="link-home" href="/">Home</a>
    `;
    
    navActions.innerHTML = `
      <a class="btn btn-secondary" href="/login.html" style="padding: 0.5rem 1.25rem; font-size: 0.85rem;">Login</a>
      <a class="btn btn-primary" href="/register.html" style="padding: 0.5rem 1.25rem; font-size: 0.85rem;">Sign Up</a>
    `;
  }

  // Highlight active link
  const path = window.location.pathname;
  if (path === '/' || path === '/index.html') {
    const link = document.getElementById('link-home');
    if (link) link.classList.add('active');
  } else if (path.includes('/monitor.html')) {
    const link = document.getElementById('link-monitor');
    if (link) link.classList.add('active');
  } else if (path.includes('/camera.html')) {
    const link = document.getElementById('link-camera');
    if (link) link.classList.add('active');
  }

  return session;
}

async function handleLogout() {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      window.location.href = '/';
    }
  } catch (err) {
    console.error('Logout request failed:', err);
  }
}

// Redirect helpers for protected pages
async function protectPage() {
  const session = await updateNavbar();
  if (!session.loggedIn) {
    window.location.href = `/login.html?redirect=${encodeURIComponent(window.location.pathname)}`;
  }
  return session;
}

async function redirectIfLoggedIn() {
  const session = await checkSession();
  if (session.loggedIn) {
    try {
      const res = await fetch('/api/devices/active-cameras');
      const data = await res.json();
      if (data.count === 0) {
        window.location.href = '/camera.html?autostart=true';
      } else {
        window.location.href = '/monitor.html';
      }
    } catch (err) {
      window.location.href = '/monitor.html';
    }
  }
}

// Run navbar update automatically on load if element is present
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('nav-actions')) {
    updateNavbar();
  }
});
