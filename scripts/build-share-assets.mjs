import { chromium } from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
const logo=`data:image/png;base64,${(await readFile('public/brand/los-didis-logo.png')).toString('base64')}`;
const bg=`data:image/jpeg;base64,${(await readFile('public/brand/los-didis-background.jpg')).toString('base64')}`;
// Compose the existing identity in HTML, preserving the official logo artwork.
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1});
 await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:#f4770b url('${bg}') center/100% 100%;width:1200px;height:630px;display:flex;align-items:center;justify-content:center}img{width:850px;height:auto}</style><img src="${logo}" alt="Los DiDis 2026">`);
 await page.locator('img').evaluate(img=>img.decode());
 await page.screenshot({path:'public/brand/los-didis-share-v1.jpg',type:'jpeg',quality:90});
 for(const [size,name] of [[64,'favicon-orange.png'],[180,'apple-touch-icon.png']]){
  await page.setViewportSize({width:size,height:size});
  await page.setContent(`<style>body{margin:0;width:${size}px;height:${size}px;background:#f4770b;display:flex;align-items:center;justify-content:center}img{width:94%;height:auto}</style><img src="${logo}">`);
  await page.locator('img').evaluate(img=>img.decode());
  await page.screenshot({path:`public/brand/${name}`});
 }
 await writeFile('public/brand/favicon.png',await readFile('public/brand/favicon-orange.png'));
}finally{await browser.close();}
