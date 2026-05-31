/**
 * 免打扰控制器 - 处理免打扰设置
 */
const DNDController = (function () {
    const logger = typeof Logger !== 'undefined' ? Logger.createLogger('DNDController') : console;

    let elements = {};

    // 辅助函数：转义HTML
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/[&<>]/g, function (m) {
            if (m === '&') return '&amp;';
            if (m === '<') return '&lt;';
            if (m === '>') return '&gt;';
            return m;
        });
    }

    // 显示/隐藏免打扰设置内容
    function toggleDndSettings(show) {
        // 午休时间区域
        const lunchBreakSettings = document.getElementById('lunchBreakSettings');
        if (lunchBreakSettings) {
            lunchBreakSettings.style.display = show ? 'flex' : 'none';
        }

        // 自定义时段区域 - 找到包含"自定义时段"标题和列表的整个区块
        // 方式1：通过 ID 查找父容器
        const customBreaksContainer = document.getElementById('customBreaksList');
        if (customBreaksContainer) {
            // 找到包含这个列表的父级 div（它的父元素是包含标题和按钮的那个 div）
            const customBreaksSection = customBreaksContainer.closest('div[style*="margin-top"]') || customBreaksContainer.parentElement;
            if (customBreaksSection) {
                customBreaksSection.style.display = show ? 'block' : 'none';
            }
        }

        // 方式2：更可靠的方式，通过标题文本查找
        if (!show) {
            // 如果是要隐藏，确保所有相关区域都隐藏
            const allRelatedDivs = document.querySelectorAll('#lunchBreakSettings, .breaks-list');
            allRelatedDivs.forEach(el => {
                if (el.id !== 'customBreaksList') {
                    const parent = el.closest('div[style*="margin-top"]') || el.parentElement;
                    if (parent && parent !== document.body) {
                        parent.style.display = 'none';
                    }
                }
            });
        }
    }

    // 渲染自定义时段列表
    function renderCustomBreaks(breaks) {
        const container = elements.customBreaksList;
        if (!container) {
            logger.warn('customBreaksList element not found');
            return;
        }

        if (!breaks || breaks.length === 0) {
            container.innerHTML = '<div class="break-empty" style="color:#94a3b8; font-size:12px; text-align:center; padding:8px;">暂无自定义时段，点击 + 添加</div>';
            return;
        }

        container.innerHTML = breaks.map((breakItem, index) => `
            <div class="break-item" data-index="${index}">
                <input type="text" class="break-name" value="${escapeHtml(breakItem.name || '时段')}" placeholder="名称" data-field="name">
                <input type="time" class="break-start" value="${breakItem.start}" data-field="start">
                <span>—</span>
                <input type="time" class="break-end" value="${breakItem.end}" data-field="end">
                <button class="remove-break" data-index="${index}">✕</button>
            </div>
        `).join('');

        // 绑定输入变化事件
        container.querySelectorAll('.break-name, .break-start, .break-end').forEach(input => {
            input.addEventListener('change', function () {
                const breakItemDiv = this.closest('.break-item');
                const index = parseInt(breakItemDiv.dataset.index);
                const config = Config.load();
                if (!config.doNotDisturb) {
                    config.doNotDisturb = { enabled: false, lunchBreak: { start: '12:00', end: '14:00' }, customBreaks: [] };
                }
                if (!config.doNotDisturb.customBreaks) {
                    config.doNotDisturb.customBreaks = [];
                }
                if (config.doNotDisturb.customBreaks[index]) {
                    const field = this.dataset.field;
                    config.doNotDisturb.customBreaks[index][field] = this.value;
                    Config.save();
                    logger.info('Updated custom break:', config.doNotDisturb.customBreaks[index]);
                }
            });
        });

        // 绑定删除按钮事件
        container.querySelectorAll('.remove-break').forEach(btn => {
            btn.addEventListener('click', function () {
                const index = parseInt(this.dataset.index);
                const config = Config.load();
                if (!config.doNotDisturb) {
                    config.doNotDisturb = { enabled: false, lunchBreak: { start: '12:00', end: '14:00' }, customBreaks: [] };
                }
                if (config.doNotDisturb.customBreaks) {
                    config.doNotDisturb.customBreaks.splice(index, 1);
                    Config.save();
                    logger.info('Removed custom break at index:', index);
                    renderCustomBreaks(config.doNotDisturb.customBreaks);
                }
            });
        });
    }

    // 初始化免打扰设置
    function init() {
        logger.info('Initializing DNDController');

        // 获取元素
        elements.dndToggle = document.getElementById('dndToggle');
        elements.lunchStart = document.getElementById('lunchStart');
        elements.lunchEnd = document.getElementById('lunchEnd');
        elements.addBreakBtn = document.getElementById('addBreakBtn');
        elements.customBreaksList = document.getElementById('customBreaksList');

        // 获取自定义时段区域的外层容器
        let customSection = null;
        const customBreaksList = document.getElementById('customBreaksList');
        if (customBreaksList) {
            // 找到包含添加按钮和列表的整个区块
            let parent = customBreaksList.parentElement;
            while (parent && parent !== document.body) {
                // 检查是否包含添加按钮
                if (parent.querySelector('#addBreakBtn')) {
                    customSection = parent;
                    break;
                }
                parent = parent.parentElement;
            }
            // 如果没找到，就用直接父元素
            if (!customSection) {
                customSection = customBreaksList.parentElement;
            }
        }
        
        if (customSection) {
            elements.customSection = customSection;
        }

        // 检查必要元素是否存在
        if (!elements.dndToggle) {
            logger.warn('dndToggle element not found, DND features disabled');
            return;
        }

        // 加载配置
        const config = Config.load();
        const dnd = config.doNotDisturb || {
            lunchBreak: { start: '12:00', end: '14:00' },
            customBreaks: []
        };

        // 设置开关状态
        elements.dndToggle.checked = dnd.enabled === true;

        // 根据开关状态显示/隐藏设置内容
        const isEnabled = dnd.enabled === true;

        // 午休时间区域
        const lunchBreakSettings = document.getElementById('lunchBreakSettings');
        if (lunchBreakSettings) {
            lunchBreakSettings.style.display = isEnabled ? 'flex' : 'none';
        }

        // 自定义时段区域
        if (elements.customSection) {
            elements.customSection.style.display = isEnabled ? 'block' : 'none';
        }

        // 设置午休时间
        if (elements.lunchStart) {
            elements.lunchStart.value = dnd.lunchBreak?.start || '12:00';
        }
        if (elements.lunchEnd) {
            elements.lunchEnd.value = dnd.lunchBreak?.end || '14:00';
        }

        // 渲染自定义时段列表
        renderCustomBreaks(dnd.customBreaks || []);

        // ========== 事件绑定 ==========

        // 免打扰总开关
        elements.dndToggle.addEventListener('change', () => {
            const isEnabledNow = elements.dndToggle.checked;
            logger.info('DND toggle changed to:', isEnabledNow);

            // 午休时间区域
            if (lunchBreakSettings) {
                lunchBreakSettings.style.display = isEnabledNow ? 'flex' : 'none';
            }

            // 自定义时段区域
            if (elements.customSection) {
                elements.customSection.style.display = isEnabledNow ? 'block' : 'none';
            }

            const newConfig = Config.load();
            if (!newConfig.doNotDisturb) {
                newConfig.doNotDisturb = { enabled: false, lunchBreak: { start: '12:00', end: '14:00' }, customBreaks: [] };
            }
            newConfig.doNotDisturb.enabled = isEnabledNow;
            Config.save();
        });

        // 校验午休时间
        function validateLunchTime(startTime, endTime) {
            // 解析时间为分钟数
            const parseTime = (timeStr) => {
                const [hours, minutes] = timeStr.split(':').map(Number);
                return hours * 60 + minutes;
            };
            
            const startMinutes = parseTime(startTime);
            const endMinutes = parseTime(endTime);
            
            // 检查结束时间是否大于开始时间
            if (endMinutes <= startMinutes) {
                return { valid: false, message: '结束时间必须大于开始时间' };
            }
            
            // 计算时间间隔（分钟）
            const duration = endMinutes - startMinutes;
            
            // 检查时间间隔
            const minDuration = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.MIN_LUNCH_DURATION : 10;
            const maxDuration = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.MAX_LUNCH_DURATION : 300;
            
            if (duration < minDuration) {
                return { valid: false, message: `午休时间至少需要${minDuration}分钟` };
            }
            
            if (duration > maxDuration) {
                return { valid: false, message: `午休时间不能超过${maxDuration / 60}小时` };
            }
            
            return { valid: true, message: '' };
        }

        // 显示错误提示
        function showError(message) {
            if (typeof AutoCloseDialog !== 'undefined') {
                AutoCloseDialog.show({
                    title: '提示',
                    message: message,
                    autoClose: 2000,
                    confirmColor: '#f59e0b'
                });
            } else {
                alert(message);
            }
        }

        // 午休开始时间
        if (elements.lunchStart) {
            elements.lunchStart.addEventListener('change', () => {
                logger.info('Lunch start changed to:', elements.lunchStart.value);
                const newConfig = Config.load();
                if (!newConfig.doNotDisturb) {
                    newConfig.doNotDisturb = { enabled: false, lunchBreak: { start: '12:00', end: '14:00' }, customBreaks: [] };
                }
                if (!newConfig.doNotDisturb.lunchBreak) {
                    newConfig.doNotDisturb.lunchBreak = { start: '12:00', end: '14:00' };
                }
                
                // 验证时间
                const startTime = elements.lunchStart.value;
                const endTime = elements.lunchEnd?.value || newConfig.doNotDisturb.lunchBreak.end || '14:00';
                
                const validation = validateLunchTime(startTime, endTime);
                if (!validation.valid) {
                    // 恢复之前的值
                    elements.lunchStart.value = newConfig.doNotDisturb.lunchBreak.start || '12:00';
                    showError(validation.message);
                    return;
                }
                
                newConfig.doNotDisturb.lunchBreak.start = startTime;
                Config.save();
            });
        }

        // 午休结束时间
        if (elements.lunchEnd) {
            elements.lunchEnd.addEventListener('change', () => {
                logger.info('Lunch end changed to:', elements.lunchEnd.value);
                const newConfig = Config.load();
                if (!newConfig.doNotDisturb) {
                    newConfig.doNotDisturb = { enabled: false, lunchBreak: { start: '12:00', end: '14:00' }, customBreaks: [] };
                }
                if (!newConfig.doNotDisturb.lunchBreak) {
                    newConfig.doNotDisturb.lunchBreak = { start: '12:00', end: '14:00' };
                }
                
                // 验证时间
                const endTime = elements.lunchEnd.value;
                const startTime = elements.lunchStart?.value || newConfig.doNotDisturb.lunchBreak.start || '12:00';
                
                const validation = validateLunchTime(startTime, endTime);
                if (!validation.valid) {
                    // 恢复之前的值
                    elements.lunchEnd.value = newConfig.doNotDisturb.lunchBreak.end || '14:00';
                    showError(validation.message);
                    return;
                }
                
                newConfig.doNotDisturb.lunchBreak.end = endTime;
                Config.save();
            });
        }

        // 添加自定义时段按钮
        if (elements.addBreakBtn) {
            elements.addBreakBtn.addEventListener('click', () => {
                logger.info('Add break button clicked');
                const newConfig = Config.load();
                if (!newConfig.doNotDisturb) {
                    newConfig.doNotDisturb = { enabled: false, lunchBreak: { start: '12:00', end: '14:00' }, customBreaks: [] };
                }
                if (!newConfig.doNotDisturb.customBreaks) {
                    newConfig.doNotDisturb.customBreaks = [];
                }
                
                // 限制最多5个自定义时段
                const maxCustomBreaks = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.MAX_CUSTOM_BREAKS : 5;
                
                if (newConfig.doNotDisturb.customBreaks.length >= maxCustomBreaks) {
                    if (typeof AutoCloseDialog !== 'undefined') {
                        AutoCloseDialog.show({
                            title: '提示',
                            message: `最多只能添加${maxCustomBreaks}个自定义时段`,
                            autoClose: 2000,
                            confirmColor: '#f59e0b'
                        });
                    } else {
                        alert(`最多只能添加${maxCustomBreaks}个自定义时段`);
                    }
                    return;
                }
                
                const defaultStart = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.DEFAULT_CUSTOM_START : '14:00';
                const defaultEnd = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.DEFAULT_CUSTOM_END : '15:00';
                const defaultName = CONFIG && CONFIG.DO_NOT_DISTURB ? CONFIG.DO_NOT_DISTURB.DEFAULT_CUSTOM_NAME : '新时段';
                
                newConfig.doNotDisturb.customBreaks.push({
                    start: defaultStart,
                    end: defaultEnd,
                    name: defaultName
                });
                Config.save();
                renderCustomBreaks(newConfig.doNotDisturb.customBreaks);
            });
        }

        logger.info('DNDController initialized successfully');
    }

    return {
        init,
        renderCustomBreaks,
        toggleDndSettings
    };
})();

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DNDController;
}

// 导出到全局
if (typeof window !== 'undefined') {
    window.DNDController = DNDController;
}