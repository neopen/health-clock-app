// scripts/deploy-web.js

const { execSync } = require('child_process');

console.log('🚀 Deploying to GitHub Pages...');

try {
    // 确保在 main 分支
    execSync('git checkout main', { stdio: 'inherit' });
    
    // 添加 docs 目录
    execSync('git add docs/', { stdio: 'inherit' });
    
    // 提交
    const timestamp = new Date().toISOString().slice(0, 19).replace('T', ' ');
    execSync(`git commit -m "Deploy web version: ${timestamp}"`, { stdio: 'inherit' });
    
    // 推送
    execSync('git push origin main', { stdio: 'inherit' });
    
    console.log('✅ Deployed successfully!');
    console.log('🌐 Visit: https://YOUR_USERNAME.github.io/HealthClock/');
} catch (error) {
    console.error('❌ Deploy failed:', error.message);
}