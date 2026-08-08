// Requires the Supabase CDN script tag to be loaded before this file:
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
//
// Each page gets its own session storage key. Without this, admin.html,
// super-admin.html, teacher.html, etc. would all share ONE login session
// in the browser (since they're on the same origin) — logging into one
// would silently log you out of the others, even with multiple tabs open.
const _pageKey = (window.location.pathname.split('/').pop() || 'index').replace('.html', '');
const sb = window.supabase.createClient(
  window.APP_CONFIG.SUPABASE_URL,
  window.APP_CONFIG.SUPABASE_ANON_KEY,
  {
    auth: {
      storageKey: `sb-${_pageKey}-auth-token`,
    },
  }
);
