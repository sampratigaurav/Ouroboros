
// config.js - Environment configuration
(function () {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    window.GameConfig = {
        // If local, use localhost:3000. If production (same domain), use relative path (empty string)
        // This allows io() to auto-detect and fetch() to use relative paths
        BACKEND_URL: isLocal ? 'http://localhost:3000' : ''
    };
})();
