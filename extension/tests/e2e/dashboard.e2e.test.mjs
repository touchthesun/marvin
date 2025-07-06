import { test, expect } from '@playwright/test';

test.describe('Marvin Dashboard E2E', () => {
  test('Check HTML content for script tag', async ({ page }) => {
    await page.goto('http://localhost:8080/dashboard/dashboard.html');
    
    // Check if script tag exists
    const scriptTags = await page.evaluate(() => {
      const scripts = document.querySelectorAll('script');
      return Array.from(scripts).map(script => ({
        src: script.src,
        type: script.type,
        content: script.innerHTML.substring(0, 100)
      }));
    });
    
    console.log('Script tags found:', scriptTags);
    
    const dashboardScript = scriptTags.find(script => script.src.includes('dashboard.js'));
    console.log('Dashboard script found:', dashboardScript);
    
    expect(dashboardScript).toBeDefined();
  });

  test('Dashboard loads and initializes', async ({ page }) => {
    const logs = [];
    page.on('console', msg => {
      console.log('BROWSER:', msg.text());
      logs.push(msg.text());
    });
  
    await page.goto('http://localhost:8080/dashboard/dashboard.html');
    await page.waitForTimeout(3000);
  
    const dashboardLoaded = await page.evaluate(() => {
      return {
        dashboardExists: typeof window.Dashboard !== 'undefined',
        dashboardInitialized: window.Dashboard?.initialized || false,
        containerExists: typeof window.container !== 'undefined',
        navigationExists: !!window.container?.components?.has('navigation')
      };
    });
  
    console.log('Dashboard loaded:', dashboardLoaded);
    console.log('All logs:', logs);
  
    expect(dashboardLoaded.dashboardExists).toBe(true);
  });

  test('Navigation component is registered', async ({ page }) => {
    const logs = [];
    page.on('console', msg => {
      console.log('BROWSER:', msg.text());
      logs.push(msg.text());
    });
  
    await page.goto('http://localhost:8080/dashboard/dashboard.html');
    await page.waitForTimeout(3000);
  
    const containerState = await page.evaluate(() => {
      if (!window.container) return { error: 'Container not found' };
      
      return {
        components: Array.from(window.container.components.keys()),
        componentInstances: Array.from(window.container.componentInstances.keys()),
        hasNavigation: window.container.components.has('navigation'),
        navigationInstance: window.container.componentInstances.has('navigation')
      };
    });
  
    console.log('Container state:', containerState);
    console.log('All logs:', logs);
  
    expect(containerState.hasNavigation).toBe(true);
  });

  test('Sidebar navigation switches panels', async ({ page }) => {
    const logs = [];
    page.on('console', msg => {
      console.log('BROWSER CONSOLE:', msg.text());
      logs.push(msg.text());
    });
  
    page.on('pageerror', error => {
      console.log('BROWSER ERROR:', error.message);
      logs.push(`ERROR: ${error.message}`);
    });
  
    console.log('Loading dashboard from HTTP server');
    
    await page.goto('http://localhost:8080/dashboard/dashboard.html');
    await page.waitForTimeout(3000);
    
    console.log('All browser logs:', logs);
    
    const dashboardState = await page.evaluate(() => {
      return {
        initialized: window.Dashboard?.initialized || false,
        hasNavigation: !!window.Dashboard?._componentSystem,
        navItems: document.querySelectorAll('.nav-item').length,
        activeNavItems: document.querySelectorAll('.nav-item.active').length,
        panels: document.querySelectorAll('.content-panel').length,
        activePanels: document.querySelectorAll('.content-panel.active').length
      };
    });
    
    console.log('Dashboard state:', dashboardState);

    await expect(page.locator('.sidebar')).toBeVisible();

    const panels = ['overview', 'capture', 'knowledge', 'assistant', 'tasks', 'settings'];

    for (const panel of panels) {
      const navItem = page.locator(`.nav-item[data-panel="${panel}"]`);
      const panelSection = page.locator(`#${panel}-panel`);

      await navItem.click();
      await expect(navItem).toHaveClass(/active/);
      await expect(panelSection).toHaveClass(/active/);

      for (const other of panels.filter(p => p !== panel)) {
        await expect(page.locator(`#${other}-panel`)).not.toHaveClass(/active/);
      }
    }
  });

  test('Check for script loading errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => {
      console.log('PAGE ERROR:', error.message);
      errors.push(error.message);
    });
  
    await page.goto('http://localhost:8080/dashboard/dashboard.html');
    await page.waitForTimeout(3000);
  
    console.log('Page errors:', errors);
    expect(errors.length).toBe(0);
  });

  test('Check if dashboard.js is accessible', async ({ page }) => {
    await page.goto('http://localhost:8080/dashboard/dashboard.html');
    
    const scriptResponse = await page.evaluate(async () => {
      try {
        const response = await fetch('./dashboard.js');
        return {
          ok: response.ok,
          status: response.status,
          statusText: response.statusText
        };
      } catch (error) {
        return {
          error: error.message
        };
      }
    });
    
    console.log('Script response:', scriptResponse);
    expect(scriptResponse.ok).toBe(true);
  });

  test('Navigation component initializes and attaches handlers', async ({ page }) => {
    await page.goto('http://localhost:8080/dashboard/dashboard.html');
  
    const logs = [];
    page.on('console', msg => {
      if (msg.type() === 'log') logs.push(msg.text());
    });
  
    await expect(page.locator('.sidebar')).toBeVisible();
    await page.waitForTimeout(1000);
  
    expect(logs.some(log => log.includes('Navigation _performInitialization called'))).toBe(true);
    expect(logs.some(log => log.includes('Navigation handlers attached'))).toBe(true);
  });
});