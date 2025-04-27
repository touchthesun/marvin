module.exports = {
  presets: [
    [
      '@babel/preset-env', 
      {
        targets: {
          chrome: "80",
          firefox: "72"
        },
        modules: false,
        useBuiltIns: 'usage',
        corejs: 3
      }
    ]
  ],
  plugins: [
    '@babel/plugin-proposal-optional-chaining',
    '@babel/plugin-proposal-nullish-coalescing-operator'
  ]
};