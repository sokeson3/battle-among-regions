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

export default defineConfig({
    base: './',
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
    },
    plugins: [removeOriginalAssets()],
    server: {
        port: 3000,
        open: true,
    },
    assetsInclude: ['**/*.csv'],
});
