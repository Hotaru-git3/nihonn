// src/main.ts
import './style.css';
import { router, setAuthState } from './router';
import { Sidebar } from './components/Sidebar';
import { BottomNav } from './components/BottomNav';
import { ToastContainer } from './components/Toast';
import { ModalContainer } from './components/Modal';
import { ProfileModal, initProfileListeners, updateAllAvatars } from './components/ProfileDrawer';
import { initFirebase, auth } from './firebase';
import { onAuthStateChanged } from 'firebase/auth';

function initTheme() {
  const theme = localStorage.getItem('theme') || 'light';
  if (theme === 'dark') {
    document.documentElement.classList.remove('light');
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }
}

async function initApp() {
  initTheme();
  
  const app = document.getElementById('app');
  if (!app) return;

  // 🔥 Init Firebase
  const initialized = await initFirebase();
  if (!initialized) {
    app.innerHTML = `
      <div class="flex items-center justify-center min-h-screen p-4">
        <div class="bg-error/10 text-error p-6 rounded-xl max-w-md text-center">
          <h2 class="text-xl font-bold mb-2">Failed to Initialize Firebase</h2>
          <p class="text-sm">Please check your configuration.</p>
        </div>
      </div>
    `;
    return;
  }

  // 🔥 Setup auth listener
  if (auth) {
    onAuthStateChanged(auth, (user) => {
      setAuthState(user);
      const email = user?.email || localStorage.getItem('email') || null;
      updateAllAvatars(email);
    });
  }

  // 🔥 Render app
  app.innerHTML = `
    ${Sidebar()}
    <button id="sidebar-toggle-floating" aria-label="Open sidebar" class="hidden lg:inline-flex items-center justify-center w-9 h-9 rounded-lg fixed left-4 top-4 z-50 bg-surface hover:bg-surface-container-high transition-all duration-200">
      <span id="sidebar-toggle-floating-icon" class="material-symbols-outlined text-on-surface-variant text-lg">chevron_right</span>
    </button>
    ${BottomNav()}
    <main id="main-content" class="flex-1 lg:ml-[260px] p-4 md:p-main_padding pb-24 lg:pb-main_padding min-h-screen bg-background min-w-0 overflow-x-hidden"></main>
    ${ToastContainer()}
    ${ModalContainer()}
    ${ProfileModal()}
  `;

  // Listen to history changes
  window.addEventListener('popstate', router);
  
  // Intercept link clicks
  document.body.addEventListener('click', e => {
    if (e.target instanceof HTMLElement) {
      const link = e.target.closest('a');
      if (link && link.getAttribute('href')?.startsWith('/')) {
        e.preventDefault();
        import('./router').then(({ navigateTo }) => {
          navigateTo(link.getAttribute('href')!);
        });
      }
    }
  });

  // Initial load
  router();
  initProfileListeners();

  // Sidebar collapse/expand (desktop only)
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const sidebarToggleIcon = document.getElementById('sidebar-toggle-icon');

  function setSidebarCollapsed(collapsed: boolean) {
    if (collapsed) {
      document.body.classList.add('sidebar-collapsed');
      localStorage.setItem('sidebarCollapsed', '1');
      if (sidebarToggleIcon) sidebarToggleIcon.textContent = 'fullscreen_exit';
    } else {
      document.body.classList.remove('sidebar-collapsed');
      localStorage.removeItem('sidebarCollapsed');
      if (sidebarToggleIcon) sidebarToggleIcon.textContent = 'fullscreen';
    }
  }

  // initialize from localStorage
  const stored = localStorage.getItem('sidebarCollapsed');
  if (stored === '1') setSidebarCollapsed(true);

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', (e) => {
      e.preventDefault();
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      setSidebarCollapsed(collapsed);
    });
  }

  // Floating toggle (visible when sidebar is collapsed)
  const floatingToggle = document.getElementById('sidebar-toggle-floating');
  if (floatingToggle) {
    floatingToggle.addEventListener('click', (e) => {
      e.preventDefault();
      setSidebarCollapsed(false);
    });
  }
}

document.addEventListener('DOMContentLoaded', initApp);