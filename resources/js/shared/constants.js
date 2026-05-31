// 应用常量配置
const CONFIG = Object.freeze({
    // 工作时间设置（用于计算）
    WORK_HOURS: {
        START: 8,               // 工作开始时间（24小时制）
        END: 18,                // 工作结束时间（24小时制）
        HOURS_PER_DAY: 10       // 每天工作小时数
    },

    // 目标设置
    TARGETS: {
        PER_DAY: 8,           // 每日目标次数（≥8次达标）
        PER_WEEK: 40,          // 每周目标次数（5天 × 8次 = 40）
        WORK_DAYS_PER_WEEK: 5  // 每周工作天数
    }),
    // 文件配置
    FILES: Object.freeze({
        CONFIG: 'user_clock_config.json',
        STATS: 'user_clock_stats.json',
        USER_DATA_DIR: 'User_Data',
        LOG_DIR: 'Logs'
    }),
    // 时间设置
    TIME: Object.freeze({
        DEFAULT_INTERVAL: 40,   // 默认提醒间隔（分钟）
        DEFAULT_LOCK: 5,        // 默认锁屏时长（分钟）
        MIN_INTERVAL: 10,       // 最小提醒间隔（分钟）
        MAX_INTERVAL: 300,      // 最大提醒间隔（分钟）
        MIN_LOCK: 1,            // 最小锁屏时长（分钟）
        MAX_LOCK: 120            // 最大锁屏时长（分钟）
    },

    // 免打扰设置
    DO_NOT_DISTURB: Object.freeze({
        DEFAULT_LUNCH_START: '12:00',
        DEFAULT_LUNCH_END: '14:00',
        MAX_CUSTOM_BREAKS: 5,        // 最大自定义时段数
        MIN_LUNCH_DURATION: 10,      // 午休时间最小间隔（分钟）
        MAX_LUNCH_DURATION: 300,     // 午休时间最大间隔（分钟，5小时）
        DEFAULT_CUSTOM_START: '14:00', // 新时段默认开始时间
        DEFAULT_CUSTOM_END: '15:00',   // 新时段默认结束时间
        DEFAULT_CUSTOM_NAME: '新时段'     // 新时段默认名称
    },

    // 通知类型
    NOTIFICATION_TYPE: Object.freeze({
        DESKTOP: 'desktop',     // 桌面通知（不锁屏）
        LOCK: 'lock'            // 锁屏通知
    },

    // 功能开关默认值
    DEFAULTS: {
        DO_NOT_DISTURB_ENABLED: true,    // 免打扰默认开启
        SOUND_ENABLED: true,              // 声音提示默认开启
        FORCE_LOCK: true,                // 强制锁屏默认开启
        SYSTEM_LOCK: false,               // 系统锁屏默认关闭
        AUTO_LAUNCH: false                // 开机自启动默认关闭
    },

    // 版本信息
    VERSION: '0.5'
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}