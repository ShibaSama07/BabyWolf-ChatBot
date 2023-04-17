require("dotenv").config();

module.exports = {
    apps: [
        {
            name: process.env.NAME,
            script: 'index.js',
            cwd: './dist/',
            env: { ...process.env }
        }
    ]
}