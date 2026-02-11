// index.js
const { route, MODELS } = require('./router');
const { spawn } = require('child_process');
const path = require('path');

/**
 * Start the proxy server in a detached process.
 * @param {number} port - Port to listen on (default 8403)
 * @returns {number} PID of the server process
 */
function startProxy(port = 8403) {
    const serverScript = path.join(__dirname, 'proxy-server.js');
    console.log(`Starting Proxy Server on port ${port}...`);
    
    const server = spawn('node', [serverScript], {
        env: { ...process.env, PORT: port },
        stdio: 'inherit',
        detached: true
    });
    
    server.unref();
    return server.pid;
}

module.exports = {
    route,
    MODELS,
    startProxy
};
