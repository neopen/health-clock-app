import { defineConfig } from 'electron-vite'
import { resolve } from 'path'

export default defineConfig({
    main: {
        build: {
            outDir: 'dist/main',
            minify: false,
            rollupOptions: {
                external: ['electron'],
                output: {
                    preserveModules: true,
                    preserveModulesRoot: 'src/main',
                    format: 'cjs',
                    entryFileNames: '[name].js',
                    chunkFileNames: '[name].js'
                }
            }
        }
    },
    preload: {
        build: {
            outDir: 'dist/preload',
            rollupOptions: {
                output: {
                    preserveModules: true,
                    preserveModulesRoot: 'src/preload',
                    format: 'cjs',
                    entryFileNames: '[name].js'
                }
            }
        }
    },
    renderer: {
        // 关键：指定入口文件
        entry: {
            index: resolve(__dirname, 'src/renderer/index.html'),
            lock: resolve(__dirname, 'src/renderer/lock.html')
        },
        build: {
            outDir: 'dist/renderer',
            minify: true,  // false 关闭压缩方便调试
            rollupOptions: {
                input: {
                    index: resolve(__dirname, 'src/renderer/index.html'),
                    lock: resolve(__dirname, 'src/renderer/lock.html')
                },
                output: {
                    // 保留目录结构
                    assetFileNames: 'assets/[name]-[hash][extname]',
                    chunkFileNames: 'js/[name]-[hash].js',
                    entryFileNames: 'js/[name]-[hash].js'
                }
            }
        }
    }
})