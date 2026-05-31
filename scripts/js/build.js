const fs = require('fs');
const path = require('path');

console.log(' Building application...\n');

const distDir = path.join(__dirname, '../../dist');

// 1. 清理 dist 目录
if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true, force: true });
    console.log('  🗑️  Cleared dist/');
}
fs.mkdirSync(distDir, { recursive: true });

// 2. 复制主进程
console.log('\n Copying main process...');
copyDir(
    path.join(__dirname, '../../src/main'),
    path.join(distDir, 'main')
);

// 3. 复制预加载
console.log('\n Copying preload...');
copyDir(
    path.join(__dirname, '../../src/preload'),
    path.join(distDir, 'preload')
);

// 4. 复制渲染进程（完整复制）
console.log('\n Copying renderer...');
copyDir(
    path.join(__dirname, '../../src/renderer'),
    path.join(distDir, 'renderer')
);

console.log('\n Build complete!');
console.log(' dist/main - 主进程');
console.log(' dist/preload - 预加载脚本');
console.log(' dist/renderer - 渲染进程');

function copyDir(src, dest) {
    if (!fs.existsSync(src)) {
        console.log(`    Source not found: ${src}`);
        return;
    }

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
    console.log(`   ${path.basename(src)}`);
}