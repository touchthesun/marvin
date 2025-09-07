// tests/integration/extension-integration.test.js

describe('Phase 3: Extension Integration', () => {
  describe('3.1 Container Integration Verification', () => {
    test('popup.js imports containerInitializer', async () => {
      const { readFileSync } = await import('fs');
      const popupContent = readFileSync('src/popup/popup.js', 'utf8');
      
      // Verify container initializer is imported
      expect(popupContent).toContain('import { containerInitializer }');
      
      // Verify container initialization is called
      expect(popupContent).toContain('await containerInitializer.initialize');
    });

    test('dashboard.js imports containerInitializer', async () => {
      const { readFileSync } = await import('fs');
      const dashboardContent = readFileSync('src/dashboard/dashboard.js', 'utf8');
      
      // Verify container initializer is imported
      expect(dashboardContent).toContain('import { containerInitializer }');
      
      // Verify container initialization is called
      expect(dashboardContent).toContain('await containerInitializer.initialize');
    });

    test('background.js imports containerInitializer', async () => {
      const { readFileSync } = await import('fs');
      const backgroundContent = readFileSync('src/background/background.js', 'utf8');
      
      // Verify container initializer is imported
      expect(backgroundContent).toContain('import { containerInitializer }');
      
      // Verify container initialization is called
      expect(backgroundContent).toContain('await containerInitializer.initialize');
    });
  });

  describe('3.2 Integration Points Verification', () => {
    test('popup initialization includes container setup', async () => {
      const { readFileSync } = await import('fs');
      const popupContent = readFileSync('src/popup/popup.js', 'utf8');
      
      // Verify container initialization happens in initPopup
      expect(popupContent).toContain('Step 1: Initializing container system');
      expect(popupContent).toContain('Step 2: Container system initialized');
    });

    test('dashboard initialization includes container setup', async () => {
      const { readFileSync } = await import('fs');
      const dashboardContent = readFileSync('src/dashboard/dashboard.js', 'utf8');
      
      // Verify container initialization happens in initDashboard
      expect(dashboardContent).toContain('Step 1: Initializing container system');
      expect(dashboardContent).toContain('Step 2: Container system initialized');
    });

    test('background script includes container initialization', async () => {
      const { readFileSync } = await import('fs');
      const backgroundContent = readFileSync('src/background/background.js', 'utf8');
      
      // Verify background container initialization
      expect(backgroundContent).toContain('initializeBackgroundContainer');
      expect(backgroundContent).toContain('Background: Initializing container system');
    });
  });
});
