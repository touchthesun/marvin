module.exports = {
    presets: [
      ['@babel/preset-env', {
        targets: {
          node: 'current'
        },
        modules: 'commonjs'  // Transform ES modules to CommonJS for testing
      }],
      '@babel/preset-typescript',
      ['@babel/preset-react', {
        runtime: 'automatic'
      }]
    ],
    plugins: [
      '@babel/plugin-transform-optional-chaining',
      '@babel/plugin-transform-nullish-coalescing-operator'
    ]
  };