
// config.js - Environment configuration
(function () {
    window.GameConfig = {
        // dynamic backend URL: uses current origin in production, or localhost:3000 in dev
        BACKEND_URL: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
            ? 'http://localhost:3000'
            : window.location.origin
    };
})();
