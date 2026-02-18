
// config.js - Environment configuration
(function () {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    window.GameConfig = {
        // If local, use localhost:3000. If production, use the Railway backend URL.
        BACKEND_URL: isLocal ? 'http://localhost:3000' : 'https://ouroboros-production-f499.up.railway.app'
    };
})();
