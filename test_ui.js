const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    page.on('console', msg => console.log('BROWSER LOG:', msg.text()));

    await page.goto('http://localhost:3003/');

    // Click "Regional Match (2P)"
    await page.click('text="Regional Match (2P)"');

    // Click regions
    await page.click('.region-card.north');
    await page.click('.region-card.east');

    // Accept landmarks
    await page.click('.landmark-slot'); // P1
    await page.click('button:has-text("Accept")');
    await page.click('.landmark-slot'); // P2
    await page.click('button:has-text("Accept")');

    await page.waitForTimeout(500);

    // Keep hands
    await page.click('button:has-text("Keep Hand")');
    await page.waitForTimeout(500);
    await page.click('button:has-text("KEEP HAND")');

    await page.waitForTimeout(1000);

    // Click a unit card in hand (has class hand-card and data-type="Unit")
    const unitCard = await page.$('.hand-card[data-type="Unit"]');
    if (unitCard) {
        console.log("Found unit card!");
        await unitCard.click();

        // Wait for context menu
        await page.waitForTimeout(500);

        // Click "Set in DEF"
        await page.click('text="Set in DEF"');
        await page.waitForTimeout(500);

        // Click a card-slot in the unit zone
        const slots = await page.$$('.unit-zone .card-slot');
        if (slots.length > 0) {
            console.log("Found unit zone slot!");
            await slots[0].click({ force: true });
            await page.waitForTimeout(1000);
        } else {
            console.log("No unit slots found?!");
        }
    } else {
        console.log("No unit card found in hand!");
    }

    await browser.close();
})();
