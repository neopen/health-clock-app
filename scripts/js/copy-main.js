const fs = require('fs');
const path = require('path');

const SRC_MAIN = path.join(__dirname, '../src/main');
const DIST_MAIN = path.join(__dirname, '../dist/main');

console.log(' Copying main process files...');

// 清空并创建目标目录
if (fs.existsSync(DIST_MAIN)) {
    fs.rmSync(DIST_MAIN, { recursive: true, force: true });
}
fs.mkdirSync(DIST_MAIN, { recursive: true });

// 递归复制目录
function copyDir(src, dest) {
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            fs.mkdirSync(destPath, { recursive: true });
            copyDir(srcPath, destPath);
        } else if (entry.name.endsWith('.js')) {
            fs.copyFileSync(srcPath, destPath);
            console.log(`   ${entry.name}`);
        }
    }
}

copyDir(SRC_MAIN, DIST_MAIN);

console.log(' Main process files copied!');