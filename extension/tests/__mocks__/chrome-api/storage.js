export function mockStorage() {
  const storage = {
    local: {},
    sync: {},
    managed: {},
    session: {}
  };

  const listeners = {
    onChanged: []
  };

  const createStorageArea = (areaName) => {
    return {
      get: jest.fn((keys, callback) => {
        const result = {};
        
        if (keys === null) {
          // Get all items
          Object.assign(result, storage[areaName]);
        } else if (Array.isArray(keys)) {
          // Get specific keys
          keys.forEach(key => {
            if (storage[areaName].hasOwnProperty(key)) {
              result[key] = storage[areaName][key];
            }
          });
        } else if (typeof keys === 'string') {
          // Get single key
          if (storage[areaName].hasOwnProperty(keys)) {
            result[keys] = storage[areaName][keys];
          }
        } else if (typeof keys === 'object') {
          // Get with default values
          Object.keys(keys).forEach(key => {
            result[key] = storage[areaName].hasOwnProperty(key) 
              ? storage[areaName][key] 
              : keys[key];
          });
        }

        if (callback) {
          setTimeout(() => callback(result), 0);
        }
        return Promise.resolve(result);
      }),

      set: jest.fn((items, callback) => {
        const oldValues = {};
        const newValues = {};

        Object.keys(items).forEach(key => {
          oldValues[key] = storage[areaName][key];
          storage[areaName][key] = items[key];
          newValues[key] = items[key];
        });

        // Trigger onChanged listeners
        if (Object.keys(items).length > 0) {
          listeners.onChanged.forEach(listener => {
            const changes = {};
            Object.keys(items).forEach(key => {
              changes[key] = {
                oldValue: oldValues[key],
                newValue: newValues[key]
              };
            });
            
            setTimeout(() => {
              listener(changes, areaName);
            }, 0);
          });
        }

        if (callback) {
          setTimeout(() => callback(), 0);
        }
        return Promise.resolve();
      }),

      remove: jest.fn((keys, callback) => {
        const keyArray = Array.isArray(keys) ? keys : [keys];
        const oldValues = {};

        keyArray.forEach(key => {
          oldValues[key] = storage[areaName][key];
          delete storage[areaName][key];
        });

        // Trigger onChanged listeners
        if (keyArray.length > 0) {
          listeners.onChanged.forEach(listener => {
            const changes = {};
            keyArray.forEach(key => {
              changes[key] = {
                oldValue: oldValues[key],
                newValue: undefined
              };
            });
            
            setTimeout(() => {
              listener(changes, areaName);
            }, 0);
          });
        }

        if (callback) {
          setTimeout(() => callback(), 0);
        }
        return Promise.resolve();
      }),

      clear: jest.fn((callback) => {
        const oldValues = { ...storage[areaName] };
        storage[areaName] = {};

        // Trigger onChanged listeners
        if (Object.keys(oldValues).length > 0) {
          listeners.onChanged.forEach(listener => {
            const changes = {};
            Object.keys(oldValues).forEach(key => {
              changes[key] = {
                oldValue: oldValues[key],
                newValue: undefined
              };
            });
            
            setTimeout(() => {
              listener(changes, areaName);
            }, 0);
          });
        }

        if (callback) {
          setTimeout(() => callback(), 0);
        }
        return Promise.resolve();
      }),

      getBytesInUse: jest.fn((keys, callback) => {
        // Mock implementation - return approximate size
        const keyArray = keys ? (Array.isArray(keys) ? keys : [keys]) : Object.keys(storage[areaName]);
        let size = 0;
        
        keyArray.forEach(key => {
          if (storage[areaName].hasOwnProperty(key)) {
            size += JSON.stringify(storage[areaName][key]).length;
          }
        });

        if (callback) {
          setTimeout(() => callback(size), 0);
        }
        return Promise.resolve(size);
      })
    };
  };

  return {
    local: createStorageArea('local'),
    sync: createStorageArea('sync'),
    managed: createStorageArea('managed'),
    session: createStorageArea('session'),
    
    onChanged: {
      addListener: jest.fn((callback) => {
        listeners.onChanged.push(callback);
      }),
      removeListener: jest.fn((callback) => {
        const index = listeners.onChanged.indexOf(callback);
        if (index > -1) {
          listeners.onChanged.splice(index, 1);
        }
      }),
      hasListener: jest.fn((callback) => {
        return listeners.onChanged.includes(callback);
      }),
      _listeners: listeners.onChanged,
      _trigger: (changes, areaName) => {
        listeners.onChanged.forEach((listener) => {
          listener(changes, areaName);
        });
      }
    },

    // Helper methods for testing
    _getStorage: () => storage,
    _setStorage: (newStorage) => {
      Object.assign(storage, newStorage);
    },
    _clearStorage: () => {
      Object.keys(storage).forEach(key => {
        storage[key] = {};
      });
    }
  };
} 