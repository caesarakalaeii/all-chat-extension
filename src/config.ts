/**
 * Runtime configuration
 * Uses environment variables injected by webpack DefinePlugin
 */

// API URL is injected at build time
// Production: https://allch.at
// Development: http://localhost:8080
declare const process: {
  env: {
    API_URL?: string;
  };
};

export const API_BASE_URL = process.env.API_URL || 'http://localhost:8080';
