require("dotenv").config();

module.exports = {
    apps: [
        {
            name: process.env.NAME,
            script: 'main.js',
            cwd: './',
            env: { ...process.env }
        }
    ]
}