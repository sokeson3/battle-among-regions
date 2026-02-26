/**
 * optimize-images.cjs
 * Converts full-res PNG card images to compressed WebP for web deployment.
 * 
 * Usage:  node scripts/optimize-images.cjs
 * 
 * - Reads PNGs from  public/output/
 * - Outputs WebP to   public/output-web/
 * - Compresses Background.png → public/Background.webp
 * - Skips files that are already up-to-date (based on mtime)
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const INPUT_DIR = path.join(__dirname, '..', 'public', 'output');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'output-web');
const BG_INPUT = path.join(__dirname, '..', 'public', 'Background.png');
const BG_OUTPUT = path.join(__dirname, '..', 'public', 'Background.webp');

const CARD_WIDTH = 512;       // px — plenty crisp for on-screen cards
const CARD_QUALITY = 80;      // WebP quality (0-100)
const BG_WIDTH = 1920;
const BG_QUALITY = 85;

async function optimizeCards() {
    // Ensure output dir exists
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const files = fs.readdirSync(INPUT_DIR).filter(f => f.toLowerCase().endsWith('.png'));
    let converted = 0;
    let skipped = 0;

    for (const file of files) {
        const inputPath = path.join(INPUT_DIR, file);
        const outputFile = file.replace(/\.png$/i, '.webp');
        const outputPath = path.join(OUTPUT_DIR, outputFile);

        // Skip if output exists and is newer than input
        if (fs.existsSync(outputPath)) {
            const inStat = fs.statSync(inputPath);
            const outStat = fs.statSync(outputPath);
            if (outStat.mtimeMs >= inStat.mtimeMs) {
                skipped++;
                continue;
            }
        }

        await sharp(inputPath)
            .resize(CARD_WIDTH, null, { withoutEnlargement: true })
            .webp({ quality: CARD_QUALITY })
            .toFile(outputPath);

        converted++;
        if (converted % 20 === 0) {
            console.log(`  ✅ ${converted}/${files.length} cards converted...`);
        }
    }

    console.log(`🃏 Cards: ${converted} converted, ${skipped} skipped (up-to-date)`);
}

async function optimizeBackground() {
    if (!fs.existsSync(BG_INPUT)) {
        console.log('⚠️  Background.png not found, skipping');
        return;
    }

    // Skip if output exists and is newer
    if (fs.existsSync(BG_OUTPUT)) {
        const inStat = fs.statSync(BG_INPUT);
        const outStat = fs.statSync(BG_OUTPUT);
        if (outStat.mtimeMs >= inStat.mtimeMs) {
            console.log('🖼️  Background: skipped (up-to-date)');
            return;
        }
    }

    await sharp(BG_INPUT)
        .resize(BG_WIDTH, null, { withoutEnlargement: true })
        .webp({ quality: BG_QUALITY })
        .toFile(BG_OUTPUT);

    console.log('🖼️  Background: converted');
}

async function main() {
    console.log('🔧 Optimizing images for web...\n');
    const start = Date.now();

    await optimizeCards();
    await optimizeBackground();

    // Report sizes
    const webFiles = fs.readdirSync(OUTPUT_DIR);
    const totalMB = webFiles.reduce((sum, f) => {
        return sum + fs.statSync(path.join(OUTPUT_DIR, f)).size;
    }, 0) / (1024 * 1024);

    const bgSize = fs.existsSync(BG_OUTPUT)
        ? (fs.statSync(BG_OUTPUT).size / (1024 * 1024)).toFixed(1)
        : '0';

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n📊 Total: ${totalMB.toFixed(1)} MB cards + ${bgSize} MB background`);
    console.log(`⏱️  Done in ${elapsed}s`);
}

main().catch(err => {
    console.error('❌ Image optimization failed:', err);
    process.exit(1);
});
