/**
 * 锁屏控制器 - 处理锁屏相关交互
 */
const LockController = (function() {
    const logger = typeof Logger !== 'undefined' ? Logger.createLogger('LockController') : console;
    
    /**
     * 解锁处理
     */
    async function unlock() {
        logger.info('Unlock requested');
        
        if (!ReminderModule.isCurrentlyLocked()) {
            logger.info('Not locked');
            return;
        }
        
        const forceLock = Config.get('forceLock');
        logger.info('forceLock:', forceLock);
        
        const unlocked = ReminderModule.unlock(forceLock);
        logger.info('unlocked result:', unlocked);
        
        if (!unlocked && !forceLock) {
            // 非强制锁定且时间未到，显示确认对话框
            logger.info('Showing confirm dialog');
            
            const lockOverlayEl = document.getElementById('lockOverlay');
            
            if (lockOverlayEl && !lockOverlayEl.classList.contains('hidden')) {
                const confirmed = await LockConfirmDialog.show({
                    title: '提前结束提醒',
                    message: '活动时间还没到。<br>提前结束会影响健康习惯的！<br>确定要提前结束吗？',
                    confirmText: '提前结束',
                    cancelText: '继续活动',
                    confirmColor: '#f59e0b'
                });
                
                if (confirmed) {
                    ReminderModule.closeLockScreen();
                    AudioModule.stopContinuous();
                }
            } else {
                const confirmed = await ConfirmDialog.show({
                    title: '提前结束提醒',
                    message: '活动时间还没到。<br>提前结束会影响健康习惯的！<br>确定要提前结束吗？',
                    confirmText: '提前结束',
                    cancelText: '继续活动',
                    confirmColor: '#f59e0b'
                });
                
                if (confirmed) {
                    ReminderModule.closeLockScreen();
                    AudioModule.stopContinuous();
                }
            }
        } else if (unlocked) {
            logger.info('Time is up, closing lock screen');
            ReminderModule.closeLockScreen();
            AudioModule.stopContinuous();
        } else {
            logger.info('Force lock enabled, cannot unlock early');
        }
    }
    
    return { unlock };
})();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LockController;
}
if (typeof window !== 'undefined') {
    window.LockController = LockController;
}