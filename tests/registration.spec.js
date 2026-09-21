import { test, expect } from '@playwright/test';

test('register, validate email, download a pass, log out and retrieve it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('2026');
  await page.getByRole('link', { name: 'Registrarme', exact: true }).click();
  await page.getByLabel('Nombre(s)', { exact: true }).fill('Mariana');
  await page.getByLabel('Apellido paterno', { exact: true }).fill('García');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('mariana@example.com');
  await page.getByLabel('Confirmar correo electrónico').fill('otro@example.com');
  await page.getByRole('button', { name: 'Registrarme', exact: true }).click();
  await expect(page.getByText('Los correos no coinciden.', { exact: false })).toBeVisible();
  await page.getByLabel('Confirmar correo electrónico').fill('MARIANA@example.com');
  await page.getByRole('button', { name: 'Registrarme', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mariana');
  await expect(page.getByRole('img', { name: 'Código QR de tu pase de demostración' })).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop-pass.png', fullPage: true, animations: 'disabled' });
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Descargar mi pase' }).click();
  expect((await downloadEvent).suggestedFilename()).toMatch(/pase-business-conference-.*\.png/);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mariana');
  await page.getByRole('button', { name: 'Cerrar sesión' }).click();
  await page.getByRole('link', { name: 'Ya estoy registrado' }).click();
  await page.getByLabel('Correo electrónico', { exact: true }).fill('missing@example.com');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('alert')).toContainText('No encontramos');
  await page.getByLabel('Correo electrónico', { exact: true }).fill('mariana@example.com');
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Mariana');
});

test('mobile routes fit the viewport and browser history works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/mobile-home.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: 'Registrarme', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Tu lugar');
  await page.screenshot({ path: 'test-results/mobile-register.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goBack();
  await expect(page.getByRole('link', { name: 'Ya estoy registrado' })).toBeVisible();
  await page.goto('/#confirmacion');
  await expect(page.getByRole('button', { name: 'Iniciar sesión' })).toBeVisible();
});

test('desktop layout has no runtime errors or horizontal overflow', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.screenshot({ path: 'test-results/desktop-home.png', fullPage: true, animations: 'disabled' });
  await page.getByRole('link', { name: 'Registrarme', exact: true }).click();
  await page.screenshot({ path: 'test-results/desktop-register.png', fullPage: true, animations: 'disabled' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
