import { createApp } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import { router } from './router/index.js';

// DSFR (gouvernement français) bundlé localement, fini le CDN jsdelivr —
// permet une CSP `script-src 'self'` stricte (cf. Phase 8 hardening).
import '@gouvfr/dsfr/dist/dsfr.min.css';
import '@gouvfr/dsfr/dist/utility/utility.css';
import './styles/main.css';

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
