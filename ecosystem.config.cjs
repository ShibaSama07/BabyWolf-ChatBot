require("dotenv").config();

const config = require("./config.json");

module.exports = {
    apps: [
        {
            name: config.NAME,
            script: 'dist/index.js',
            cwd: './',
            env: { ...process.env }
        }
    ]
}