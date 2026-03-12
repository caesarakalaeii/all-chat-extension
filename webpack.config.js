const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const API_URL = process.env.API_URL || (isProduction ? 'https://allch.at' : 'http://localhost:8080');

  return {
  mode: argv.mode || 'production',
  entry: {
    'background': './src/background/service-worker.ts',
    'content-scripts/twitch': './src/content-scripts/twitch.ts',
    'content-scripts/youtube': './src/content-scripts/youtube.ts',
    'content-scripts/kick': './src/content-scripts/kick.ts',
    'ui/chat-bundle': './src/ui/index.tsx',
    'popup/popup': './src/popup/popup.tsx'
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader', 'postcss-loader']
      },
      {
        test: /\.(woff|woff2|eot|ttf|otf)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'ui/fonts/[name][ext]'
        }
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.API_URL': JSON.stringify(API_URL)
    }),
    new MiniCssExtractPlugin({
      filename: 'ui/chat-styles.css'
    }),
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'assets', to: 'assets', noErrorOnMissing: true },
        { from: 'src/content-scripts/styles.css', to: 'content-scripts/styles.css', noErrorOnMissing: true }
      ]
    }),
    new HtmlWebpackPlugin({
      template: './src/ui/chat-container.html',
      filename: 'ui/chat-container.html',
      chunks: ['ui/chat-bundle'],
      inject: false  // Don't inject scripts - template already has them
    }),
    new HtmlWebpackPlugin({
      template: './src/popup/popup.html',
      filename: 'popup/popup.html',
      chunks: ['popup/popup']
    })
  ]
};
};
