const fs = require('fs');
const path = require('path');
const os = require('os');

// Store metadata in user's home dir (persists across app updates)
const STORAGE_DIR = path.join(os.homedir(), '.claude-cost-monitor');
const METADATA_FILE = path.join(STORAGE_DIR, 'metadata.json');

// Ensure storage directory exists
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

/**
 * Load metadata (tracking start date, etc.)
 */
function loadMetadata() {
  if (!fs.existsSync(METADATA_FILE)) {
    // First run - initialize metadata
    const metadata = {
      trackingStarted: Date.now(),
      trackingStartedDate: new Date().toISOString(),
      lastUpdate: Date.now(),
      version: '0.6.0'
    };
    saveMetadata(metadata);
    return metadata;
  }

  try {
    const data = fs.readFileSync(METADATA_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error loading metadata:', error);
    return {
      trackingStarted: Date.now(),
      trackingStartedDate: new Date().toISOString(),
      lastUpdate: Date.now(),
      version: '0.6.0'
    };
  }
}

/**
 * Save metadata
 */
function saveMetadata(metadata) {
  try {
    fs.writeFileSync(METADATA_FILE, JSON.stringify(metadata, null, 2));
  } catch (error) {
    console.error('Error saving metadata:', error);
  }
}

/**
 * Get tracking metadata
 */
function getMetadata() {
  return loadMetadata();
}

/**
 * Update last seen timestamp
 */
function updateLastSeen() {
  const metadata = loadMetadata();
  metadata.lastUpdate = Date.now();
  saveMetadata(metadata);
}

/**
 * Get the storage directory path
 */
function getStorageDir() {
  return STORAGE_DIR;
}

module.exports = {
  getMetadata,
  updateLastSeen,
  getStorageDir,
  loadMetadata,
  saveMetadata
};
