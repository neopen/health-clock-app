const fs = require('fs');
const path = require('path');

const SRC_RENDERER = path.join(__dirname, '../src/renderer');
const DIST_RENDERER = path.join(__dirname, '../dist/renderer');

console.log('📦 Copying renderer files...');

// 清空并创建目标目录
if (fs.existsSync(DIST_RENDERER)) {
    fs.rmSync(DIST_RENDERER, { recursive: true, force: true });
}
fs.mkdirSync(DIST_RENDERER, { recursive: true });

// 需要复制的目录和文件
const itemsToCopy = [
    'css',
    'icons',
    'js',
    'index.html',
    'lock.html',
    'manifest.json'
];

itemsToCopy.forEach(item => {
    const src = path.join(SRC_RENDERER, item);
    const dest = path.join(DIST_RENDERER, item);

    if (fs.existsSync(src)) {
        const stat = fs.statSync(src);
        if (stat.isDirectory()) {
            copyDir(src, dest);
        } else {
            fs.copyFileSync(src, dest);
        }
        console.log(`  ✅ ${item}`);
    } else {
        console.log(`  ⚠️  Missing: ${item}`);
    }
});

function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

console.log('✨ Renderer files copied!');