import {chromium} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const src='data:image/png;base64,'+(await readFile('scripts/assets/los-didis-logo-original.png')).toString('base64');
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:3492,height:844},deviceScaleFactor:1});
 await page.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:3492px;height:844px;filter:brightness(0) invert(1)}</style><img src="${src}">`);
 await page.locator('img').evaluate(i=>i.decode());
 await page.screenshot({path:'public/brand/los-didis-logo-white.png',omitBackground:true});
}finally{await browser.close();}
