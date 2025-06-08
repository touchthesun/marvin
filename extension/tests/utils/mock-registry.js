// extension/tests/utils/mock-registry.js
import { createMockSystem } from './mock-system';

export const setupMocks = () => {
const mockSystem = createMockSystem();

// Mock base component
jest.mock('../../src/core/base-component', () => ({
    BaseComponent: class {
        constructor() {
        this.logger = mockSystem.logger;
        this._memoryMonitor = mockSystem.memoryMonitor;
        this._resourceTracker = mockSystem.resourceTracker;
        this._initialized = false;
        this._eventListeners = new Map();
        this._timeouts = new WeakMap();
        this._intervals = new WeakMap();
        this._domRefs = new WeakSet();
        }
    
        async initialize() {
        if (this._initialized) return;
        this._initialized = true;
        }
    
        async cleanup() {
        await this._resourceTracker.cleanup();
        this._initialized = false;
        }
    }
    }));

return mockSystem;
};