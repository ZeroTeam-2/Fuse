import { test, expect } from '@playwright/test'

test.describe('Smoke tests', () => {
  test('homepage loads', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/.+/)
  })

  test('/login redirects to the marketplace and opens the login modal', async ({ page }) => {
    await page.goto('/login')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByRole('dialog')).toContainText('Войти с Яндекс ID')
  })

  test('no console errors on homepage', async ({ page }) => {
    const errors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() !== 'error') return
      // Аноним на главной штатно получает 401 на проверке сессии — это не
      // ошибка приложения, а его нормальный ответ незалогиненному гостю.
      if (msg.text().includes('401')) return
      errors.push(msg.text())
    })
    await page.goto('/')
    expect(errors).toEqual([])
  })
})
