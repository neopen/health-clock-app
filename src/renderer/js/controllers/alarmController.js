/**
 * 闹铃控制器 - 处理启动/停止闹铃逻辑
 */
const AlarmController = (function() {
    const logger = typeof Logger !== 'undefined' ? Logger.createLogger('AlarmController') : console;
    
    /**
     * 启动闹铃
     */
    async function start() {
        logger.info('Starting alarm');
        
        if (!UIController.validateAndShowErrors()) {
            await ConfirmDialog.show({
                title: '配置无效',
                message: '请先修正上面的错误设置后再启动闹铃。',
                confirmText: '知道了',
                cancelText: '',
                confirmColor: '#667eea'
            });
            return;
        }
        
        if (ReminderModule.isReminderRunning()) {
            logger.info('Already running');
            return;
        }
        
        const notificationType = Config.get('notificationType');
        logger.info('Notification type:', notificationType);
        
        // 桌面通知模式：初始化通知模块
        if (notificationType === 'desktop') {
            NotificationModule.initWithoutWait();
            logger.info('Notification module initialized');
        }
        
        // 初始化音频
        await AudioModule.resume();
        
        Config.save();
        
        const now = new Date();
        const config = Config.load();
        logger.info('Config loaded:', config);
        
        const next = ReminderModule.calculateNextReminder(now, config);
        ReminderModule.setNextReminderTime(next.getTime());
        
        ReminderModule.start(config);
        ReminderModule.startCheckLoop();
        
        UIModule.updateUI(true);
        UIModule.updateNextReminderDisplay(next.getTime());
        
        const modeText = notificationType === 'desktop' ? '桌面通知' : '锁屏通知';
        AutoCloseDialog.show({
            title: '启动成功',
            message: `闹铃已启动（${modeText}模式）<br>将在 ${next.toLocaleTimeString()} 开始提醒`,
            autoClose: 3000,
            confirmColor: '#22c55e'
        });
        
        logger.info('Alarm started, next reminder at:', new Date(next.getTime()));
    }
    
    /**
     * 停止闹铃
     */
    function stop() {
        logger.info('Stopping alarm');
        ReminderModule.stop(AudioModule);
        UIModule.updateUI(false);
        UIModule.updateNextReminderDisplay(null);
        
        AutoCloseDialog.show({
            title: '闹铃已停止',
            message: '闹铃已关闭，记得定时起来活动哦！',
            autoClose: 2000,
            confirmColor: '#64748b'
        });
    }
    
    return { start, stop };
})();

// 导出
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AlarmController;
}
if (typeof window !== 'undefined') {
    window.AlarmController = AlarmController;
}