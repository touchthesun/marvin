// extension/tests/diagnostics/deprecation.test.js
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

// Helper function to recursively get all files matching patterns
function getAllFiles(dir, patterns) {
  const files = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath, patterns));
    } else if (entry.isFile() && patterns.some(pattern => entry.name.match(pattern))) {
      files.push(fullPath);
    }
  }
  
  return files;
}

describe('Deprecation Detection', () => {
  // Patterns to detect deprecated React patterns
  const reactDeprecationPatterns = {
    'React.createClass': 'Use ES6 classes or functional components',
    'componentWillMount': 'Use constructor or useEffect',
    'componentWillReceiveProps': 'Use getDerivedStateFromProps or useEffect',
    'componentWillUpdate': 'Use getSnapshotBeforeUpdate or useEffect',
    'UNSAFE_': 'Remove UNSAFE_ prefix and use modern lifecycle methods',
    'findDOMNode': 'Use refs instead',
    'string refs': 'Use callback refs or createRef',
    'ReactDOM.render': 'Use createRoot instead',
    'ReactDOM.hydrate': 'Use hydrateRoot instead'
  };

  // Patterns to detect deprecated TypeScript patterns
  const typescriptDeprecationPatterns = {
    'any': 'Consider using more specific types',
    'Function': 'Use specific function types',
    'Object': 'Use specific object types or interfaces',
    'as any': 'Avoid type assertions, use proper typing',
    '// @ts-ignore': 'Use // @ts-expect-error with explanation',
    '// @ts-nocheck': 'Fix type errors instead of ignoring them'
  };

  // Patterns to detect deprecated testing patterns
  const testingDeprecationPatterns = {
    'cleanup': 'cleanup is now automatic in @testing-library/react',
    'fireEvent': 'Consider using userEvent for more realistic interactions',
    'waitForElement': 'Use waitFor instead',
    'getByTestId': 'Prefer queries that reflect how users interact with your app',
    'act\\(.*\\)': 'act is now automatic in most cases'
  };

  test('should detect deprecated React patterns', () => {
    const files = getAllFiles('src', [/\.(js|jsx|ts|tsx)$/]);
    const issues = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      
      for (const [pattern, message] of Object.entries(reactDeprecationPatterns)) {
        if (content.includes(pattern)) {
          issues.push({
            file,
            pattern,
            message,
            line: content.split('\n').findIndex(line => line.includes(pattern)) + 1
          });
        }
      }
    }

    if (issues.length > 0) {
      console.log('\nDeprecated React patterns found:');
      issues.forEach(({ file, pattern, message, line }) => {
        console.log(`\n${file}:${line}`);
        console.log(`  Pattern: ${pattern}`);
        console.log(`  Message: ${message}`);
      });
    }

    expect(issues.length).toBe(0);
  });

  test('should detect deprecated TypeScript patterns', () => {
    const files = getAllFiles('src', [/\.(ts|tsx)$/]);
    const issues = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      
      for (const [pattern, message] of Object.entries(typescriptDeprecationPatterns)) {
        if (content.includes(pattern)) {
          issues.push({
            file,
            pattern,
            message,
            line: content.split('\n').findIndex(line => line.includes(pattern)) + 1
          });
        }
      }
    }

    if (issues.length > 0) {
      console.log('\nDeprecated TypeScript patterns found:');
      issues.forEach(({ file, pattern, message, line }) => {
        console.log(`\n${file}:${line}`);
        console.log(`  Pattern: ${pattern}`);
        console.log(`  Message: ${message}`);
      });
    }

    expect(issues.length).toBe(0);
  });

  test('should detect deprecated testing patterns', () => {
    const files = getAllFiles('tests', [/\.(js|jsx|ts|tsx)$/]);
    const issues = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      
      for (const [pattern, message] of Object.entries(testingDeprecationPatterns)) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          // Skip if this is a pattern definition line
          if (line.includes(`'${pattern}'`) && 
              line.includes('testingDeprecationPatterns')) {
            continue;
          }
          
          // Skip if this is part of a string literal (like in a comment or string)
          if (line.includes(`'${pattern}'`) || line.includes(`"${pattern}"`)) {
            continue;
          }
          
          // Only match if the pattern appears as a standalone word or method call
          const patternRegex = new RegExp(`\\b${pattern}\\b`);
          if (patternRegex.test(line)) {
            issues.push({
              file,
              pattern,
              message,
              line: i + 1
            });
          }
        }
      }
    }

    if (issues.length > 0) {
      console.log('\nDeprecated testing patterns found:');
      issues.forEach(({ file, pattern, message, line }) => {
        console.log(`\n${file}:${line}`);
        console.log(`  Pattern: ${pattern}`);
        console.log(`  Message: ${message}`);
      });
    }

    expect(issues.length).toBe(0);
  });

  test('should detect obsolete module imports', () => {
    const files = getAllFiles('src', [/\.(js|jsx|ts|tsx)$/]);
    const obsoleteModules = {
      'react-addons-': 'Use React 16+ features instead',
      'react-dom-factories': 'Use JSX instead',
      'create-react-class': 'Use ES6 classes or functional components',
      'prop-types': 'Consider using TypeScript instead',
      'enzyme': 'Use @testing-library/react instead'
    };

    const issues = [];

    for (const file of files) {
      const content = readFileSync(file, 'utf-8');
      
      for (const [module, message] of Object.entries(obsoleteModules)) {
        if (content.includes(module)) {
          issues.push({
            file,
            module,
            message,
            line: content.split('\n').findIndex(line => line.includes(module)) + 1
          });
        }
      }
    }

    if (issues.length > 0) {
      console.log('\nObsolete module imports found:');
      issues.forEach(({ file, module, message, line }) => {
        console.log(`\n${file}:${line}`);
        console.log(`  Module: ${module}`);
        console.log(`  Message: ${message}`);
      });
    }

    expect(issues.length).toBe(0);
  });
});