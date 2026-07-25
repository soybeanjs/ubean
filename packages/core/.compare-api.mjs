Promise.all([import('ubean'), import('@ubean/core')])
  .then(([ubean, core]) => {
    const ubeanKeys = new Set(Object.keys(ubean));
    const coreKeys = new Set(Object.keys(core));
    const missingFromCore = [...ubeanKeys].filter(k => !coreKeys.has(k)).sort();
    const extraInCore = [...coreKeys].filter(k => !ubeanKeys.has(k)).sort();
    console.log('ubean exports:', ubeanKeys.size);
    console.log('@ubean/core exports:', coreKeys.size);
    console.log('Missing from @ubean/core (backward-compat gaps):', missingFromCore.length);
    if (missingFromCore.length > 0) {
      console.log('  Names:', missingFromCore.join(', '));
    }
    console.log('Extra in @ubean/core (new APIs, not in original ubean):', extraInCore.length);
    if (extraInCore.length > 0 && extraInCore.length <= 30) {
      console.log('  Names:', extraInCore.join(', '));
    } else if (extraInCore.length > 30) {
      console.log('  (first 30):', extraInCore.slice(0, 30).join(', '), '...');
    }
  })
  .catch(e => {
    console.error('ERROR:', e.message);
    process.exit(1);
  });
