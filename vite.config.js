import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

// Plugin to remove original full-res PNGs from dist (we only need the WebP versions)
function removeOriginalAssets() {
    return {
        name: 'remove-original-assets',
        closeBundle() {
            const distDir = path.resolve(__dirname, 'dist');

            // Remove original output/ folder (full-res PNGs)
            const outputDir = path.join(distDir, 'output');
            if (fs.existsSync(outputDir)) {
                fs.rmSync(outputDir, { recursive: true, force: true });
                console.log('🗑️  Removed original output/ PNGs from dist');
            }

            // Remove original Background.png
            const bgPng = path.join(distDir, 'Background.png');
            if (fs.existsSync(bgPng)) {
                fs.unlinkSync(bgPng);
                console.log('🗑️  Removed original Background.png from dist');
            }
        }
    };
}

// Plugin to copy website files into dist after build
function copyWebsite() {
    return {
        name: 'copy-website',
        closeBundle() {
            const distDir = path.resolve(__dirname, 'dist');
            const websiteDir = path.resolve(__dirname, 'website');

            // Copy website files to dist root
            const filesToCopy = ['index.html', 'styles.css', 'script.js'];
            for (const file of filesToCopy) {
                const src = path.join(websiteDir, file);
                const dest = path.join(distDir, file);
                if (fs.existsSync(src)) {
                    fs.copyFileSync(src, dest);
                    console.log(`📄 Copied website/${file} → dist/${file}`);
                }
            }
        }
    };
}

export default defineConfig({
    base: './',
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                game: path.resolve(__dirname, 'game.html'),
            },
        },
    },
    plugins: [removeOriginalAssets(), copyWebsite()],
    server: {
        port: 3000,
        open: true,
    },
    assetsInclude: ['**/*.csv'],
});

