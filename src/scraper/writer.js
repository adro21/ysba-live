const fs = require('fs').promises;
const path = require('path');

class DataWriter {
  constructor() {
    this.outputDir = path.join(__dirname, '../../data');
    this.publicDir = path.join(__dirname, '../../public');
  }

  // Ensure output directories exist
  async ensureDirectories() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true });
      await fs.mkdir(this.publicDir, { recursive: true });
      console.log('✓ Output directories ready');
    } catch (error) {
      console.error('Error creating directories:', error.message);
      throw error;
    }
  }

  // Write main YSBA JSON file
  async writeYSBAData(formattedData) {
    await this.ensureDirectories();
    
    const outputPath = path.join(this.outputDir, 'ysba.json');
    const publicPath = path.join(this.publicDir, 'ysba.json');
    
    try {
      const jsonData = JSON.stringify(formattedData, null, 2);
      
      // Write to data directory (for worker access)
      await fs.writeFile(outputPath, jsonData, 'utf8');
      console.log(`✓ YSBA data written to: ${outputPath}`);
      
      // Write to public directory (for web access)
      await fs.writeFile(publicPath, jsonData, 'utf8');
      console.log(`✓ YSBA data written to: ${publicPath}`);
      
      // Write file size info
      const stats = await fs.stat(outputPath);
      const fileSizeKB = (stats.size / 1024).toFixed(2);
      console.log(`✓ File size: ${fileSizeKB} KB`);
      
      return {
        success: true,
        outputPath,
        publicPath,
        size: stats.size,
        sizeKB: fileSizeKB,
        lastUpdated: formattedData.metadata.lastUpdated
      };
      
    } catch (error) {
      console.error('Error writing YSBA data:', error.message);
      throw error;
    }
  }

  // Write API-optimized version (smaller file)
  async writeAPIData(apiData) {
    await this.ensureDirectories();
    
    const outputPath = path.join(this.outputDir, 'ysba-api.json');
    const publicPath = path.join(this.publicDir, 'ysba-api.json');
    
    try {
      const jsonData = JSON.stringify(apiData, null, 0); // No formatting for smaller size
      
      await fs.writeFile(outputPath, jsonData, 'utf8');
      await fs.writeFile(publicPath, jsonData, 'utf8');
      
      const stats = await fs.stat(outputPath);
      const fileSizeKB = (stats.size / 1024).toFixed(2);
      
      console.log(`✓ API data written: ${fileSizeKB} KB`);
      
      return {
        success: true,
        outputPath,
        publicPath,
        size: stats.size,
        sizeKB: fileSizeKB
      };
      
    } catch (error) {
      console.error('Error writing API data:', error.message);
      throw error;
    }
  }

  // Write dashboard summary
  async writeDashboardData(dashboardData) {
    await this.ensureDirectories();
    
    const outputPath = path.join(this.outputDir, 'dashboard.json');
    const publicPath = path.join(this.publicDir, 'dashboard.json');
    
    try {
      const jsonData = JSON.stringify(dashboardData, null, 2);
      
      await fs.writeFile(outputPath, jsonData, 'utf8');
      await fs.writeFile(publicPath, jsonData, 'utf8');
      
      console.log(`✓ Dashboard data written`);
      
      return {
        success: true,
        outputPath,
        publicPath
      };
      
    } catch (error) {
      console.error('Error writing dashboard data:', error.message);
      throw error;
    }
  }

  // Write individual division data (for faster loading)
  async writeDivisionData(division, tier, data) {
    await this.ensureDirectories();
    
    const filename = `${division}-${tier}.json`;
    const outputPath = path.join(this.outputDir, 'divisions', filename);
    const publicPath = path.join(this.publicDir, 'divisions', filename);
    
    // Ensure division directories exist
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.mkdir(path.dirname(publicPath), { recursive: true });
    
    try {
      const jsonData = JSON.stringify(data, null, 2);
      
      await fs.writeFile(outputPath, jsonData, 'utf8');
      await fs.writeFile(publicPath, jsonData, 'utf8');
      
      console.log(`✓ Division data written: ${filename}`);
      
      return {
        success: true,
        division,
        tier,
        outputPath,
        publicPath
      };
      
    } catch (error) {
      console.error(`Error writing division data for ${division}/${tier}:`, error.message);
      throw error;
    }
  }

  // Write metadata about the scraping run
  async writeMetadata(metadata) {
    await this.ensureDirectories();
    
    const outputPath = path.join(this.outputDir, 'metadata.json');
    const publicPath = path.join(this.publicDir, 'metadata.json');
    
    const fullMetadata = {
      ...metadata,
      generatedAt: new Date().toISOString(),
      worker: {
        version: '1.0.0',
        nodeVersion: process.version,
        platform: process.platform
      }
    };
    
    try {
      const jsonData = JSON.stringify(fullMetadata, null, 2);
      
      await fs.writeFile(outputPath, jsonData, 'utf8');
      await fs.writeFile(publicPath, jsonData, 'utf8');
      
      console.log(`✓ Metadata written`);
      
      return {
        success: true,
        outputPath,
        publicPath,
        metadata: fullMetadata
      };
      
    } catch (error) {
      console.error('Error writing metadata:', error.message);
      throw error;
    }
  }

  // Write error log if scraping fails
  async writeErrorLog(error, context = {}) {
    await this.ensureDirectories();
    
    const errorData = {
      timestamp: new Date().toISOString(),
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name
      },
      context,
      worker: {
        nodeVersion: process.version,
        platform: process.platform,
        memory: process.memoryUsage()
      }
    };
    
    const filename = `error-${Date.now()}.json`;
    const outputPath = path.join(this.outputDir, 'errors', filename);
    
    // Ensure error directory exists
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    
    try {
      const jsonData = JSON.stringify(errorData, null, 2);
      await fs.writeFile(outputPath, jsonData, 'utf8');
      
      console.log(`✓ Error log written: ${filename}`);
      
      return {
        success: true,
        outputPath,
        filename,
        errorData
      };
      
    } catch (writeError) {
      console.error('Error writing error log:', writeError.message);
      // Don't throw here to avoid infinite loop
      return {
        success: false,
        error: writeError.message
      };
    }
  }

  // Read existing data (for comparison/caching)
  async readExistingData(filename = 'ysba.json') {
    const filePath = path.join(this.outputDir, filename);
    
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is invalid
      return null;
    }
  }

  // Check if data has changed (to avoid unnecessary writes)
  async hasDataChanged(newData, filename = 'ysba.json') {
    const existingData = await this.readExistingData(filename);
    
    if (!existingData) {
      return true; // No existing data, consider it changed
    }
    
    // Compare without lastUpdated timestamp
    const normalizeData = (data) => {
      const normalized = JSON.parse(JSON.stringify(data));
      if (normalized.metadata) {
        delete normalized.metadata.lastUpdated;
      }
      delete normalized.lastUpdated;
      return normalized;
    };
    
    const normalizedNew = normalizeData(newData);
    const normalizedExisting = normalizeData(existingData);
    
    return JSON.stringify(normalizedNew) !== JSON.stringify(normalizedExisting);
  }

  // Get file stats
  async getFileStats(filename = 'ysba.json') {
    const filePath = path.join(this.outputDir, filename);
    
    try {
      const stats = await fs.stat(filePath);
      return {
        exists: true,
        size: stats.size,
        sizeKB: (stats.size / 1024).toFixed(2),
        lastModified: stats.mtime,
        created: stats.birthtime
      };
    } catch (error) {
      return {
        exists: false,
        error: error.message
      };
    }
  }

  // Clean up old error logs (keep last 10)
  async cleanupErrorLogs() {
    const errorDir = path.join(this.outputDir, 'errors');
    
    try {
      const files = await fs.readdir(errorDir);
      const errorFiles = files
        .filter(file => file.startsWith('error-') && file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(errorDir, file),
          timestamp: parseInt(file.replace('error-', '').replace('.json', ''))
        }))
        .sort((a, b) => b.timestamp - a.timestamp);
      
      // Keep only the 10 most recent error logs
      const filesToDelete = errorFiles.slice(10);
      
      for (const file of filesToDelete) {
        await fs.unlink(file.path);
        console.log(`✓ Cleaned up old error log: ${file.name}`);
      }
      
      return {
        success: true,
        totalFiles: errorFiles.length,
        deletedFiles: filesToDelete.length,
        keptFiles: Math.min(errorFiles.length, 10)
      };
      
    } catch (error) {
      console.error('Error cleaning up error logs:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = DataWriter;