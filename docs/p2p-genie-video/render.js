const { chromium } = require('playwright');
const [,, mode, outDir, ...ts] = process.argv;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  await p.goto('file://' + __dirname + '/p2p.html');
  await p.evaluate(() => document.fonts.ready);
  const seek = t => p.evaluate(ms => { document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }); }, t * 1000);
  const times = mode === 'still' ? ts.map(Number) : Array.from({ length: Math.round(56 * 30) }, (_, i) => i / 30);
  let i = 0;
  for (const t of times) {
    await seek(t);
    const name = mode === 'still' ? `s_${t}.png` : `f_${String(i).padStart(5, '0')}.png`;
    await p.screenshot({ path: `${outDir}/${name}`, type: 'png' });
    i++;
  }
  await b.close();
})();
