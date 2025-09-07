/**
 * Capture Service
 * Provides capture utilities as a service for the dependency container
 */

import * as CaptureUtils from '../components/shared/capture.js';

export class CaptureService {
  constructor(options = {}) {
    this.container = options.container;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }
    
    // Initialize the service
    this.initialized = true;
  }

  // Expose the capture utilities as methods
  async captureUrl(url, options = {}) {
    return CaptureUtils.captureUrl(url, options);
  }

  async captureCurrentTab(options = {}) {
    return CaptureUtils.captureCurrentTab(options);
  }

  async captureBatch(urls, options = {}) {
    return CaptureUtils.captureBatch(urls, options);
  }

  async captureAllTabs(options = {}) {
    return CaptureUtils.captureAllTabs(options);
  }

  isValidCaptureUrl(url) {
    return CaptureUtils.isValidCaptureUrl(url);
  }

  getDomainFromUrl(url) {
    return CaptureUtils.getDomainFromUrl(url);
  }

  async isUrlExcluded(url) {
    return CaptureUtils.isUrlExcluded(url);
  }

  async isUrlIncluded(url) {
    return CaptureUtils.isUrlIncluded(url);
  }

  async isAutoCaptureEnabled() {
    return CaptureUtils.isAutoCaptureEnabled();
  }

  async getMinTimeOnPage() {
    return CaptureUtils.getMinTimeOnPage();
  }

  async getCaptureHistory(limit = 0) {
    return CaptureUtils.getCaptureHistory(limit);
  }

  async clearCaptureHistory() {
    return CaptureUtils.clearCaptureHistory();
  }

  async updateCaptureHistory(captureData) {
    return CaptureUtils.updateCaptureHistory(captureData);
  }

  setupCaptureButton(button, captureFunction, onComplete = null) {
    return CaptureUtils.setupCaptureButton(button, captureFunction, onComplete);
  }

  setupBatchCaptureButton(button, batchCaptureFunction, progressCallback = null, onComplete = null) {
    return CaptureUtils.setupBatchCaptureButton(button, batchCaptureFunction, progressCallback, onComplete);
  }

  async monitorBatchProgress(batchId, progressCallback, completionCallback) {
    return CaptureUtils.monitorBatchProgress(batchId, progressCallback, completionCallback);
  }

  async cleanup() {
    this.initialized = false;
  }
} 