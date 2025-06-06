#!/usr/bin/env node

const fs = require('fs').promises;
const path = require('path');

async function listBackups() {
    const backupDir = path.join(__dirname, '..', 'backup');
    try {
        const files = await fs.readdir(backupDir);
        const backupFiles = files
            .filter(file => file.startsWith('subscribers-') && file.endsWith('.json'))
            .sort()
            .reverse(); // Most recent first
        
        console.log('\n📧 Available subscriber backups:');
        console.log('=====================================');
        
        if (backupFiles.length === 0) {
            console.log('No backup files found');
            return [];
        }
        
        for (let i = 0; i < backupFiles.length; i++) {
            const file = backupFiles[i];
            const timestamp = file.replace('subscribers-', '').replace('.json', '');
            const date = new Date(timestamp.replace(/-/g, ':'));
            const fullPath = path.join(backupDir, file);
            
            try {
                const data = await fs.readFile(fullPath, 'utf8');
                const subscribers = JSON.parse(data);
                const activeCount = subscribers.filter(s => s.active).length;
                
                console.log(`${i + 1}. ${file}`);
                console.log(`   Date: ${date.toLocaleString()}`);
                console.log(`   Subscribers: ${subscribers.length} total, ${activeCount} active`);
                console.log('');
            } catch (error) {
                console.log(`${i + 1}. ${file} (Error reading file: ${error.message})`);
            }
        }
        
        return backupFiles;
    } catch (error) {
        console.error('Error reading backup directory:', error.message);
        return [];
    }
}

async function restoreFromBackup(backupFile) {
    const backupDir = path.join(__dirname, '..', 'backup');
    const backupPath = path.join(backupDir, backupFile);
    const subscribersFile = path.join(__dirname, '..', 'subscribers.json');
    
    try {
        // Check if backup file exists
        await fs.access(backupPath);
        
        // Create a backup of current file if it exists
        try {
            await fs.access(subscribersFile);
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const currentBackup = path.join(backupDir, `subscribers-current-${timestamp}.json`);
            await fs.copyFile(subscribersFile, currentBackup);
            console.log(`📧 Current subscribers.json backed up to ${currentBackup}`);
        } catch {
            // Current file doesn't exist, no backup needed
        }
        
        // Restore from backup
        await fs.copyFile(backupPath, subscribersFile);
        
        // Verify the restore
        const data = await fs.readFile(subscribersFile, 'utf8');
        const subscribers = JSON.parse(data);
        const activeCount = subscribers.filter(s => s.active).length;
        
        console.log(`✅ Successfully restored from ${backupFile}`);
        console.log(`📊 Restored ${subscribers.length} total subscribers (${activeCount} active)`);
        
    } catch (error) {
        console.error('❌ Error restoring from backup:', error.message);
        process.exit(1);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log('📧 YSBA Subscriber Data Recovery Tool');
        console.log('====================================');
        console.log('');
        console.log('Usage:');
        console.log('  node scripts/restore-subscribers.js list              # List available backups');
        console.log('  node scripts/restore-subscribers.js restore <file>    # Restore from specific backup');
        console.log('');
        console.log('Examples:');
        console.log('  node scripts/restore-subscribers.js list');
        console.log('  node scripts/restore-subscribers.js restore subscribers-2024-12-15T10-30-00-000Z.json');
        process.exit(0);
    }
    
    const command = args[0];
    
    if (command === 'list') {
        await listBackups();
    } else if (command === 'restore') {
        if (args.length < 2) {
            console.error('❌ Please specify a backup file to restore from');
            console.log('Use "node scripts/restore-subscribers.js list" to see available backups');
            process.exit(1);
        }
        
        const backupFile = args[1];
        await restoreFromBackup(backupFile);
    } else {
        console.error('❌ Unknown command:', command);
        console.log('Use "node scripts/restore-subscribers.js" for usage information');
        process.exit(1);
    }
}

main().catch(console.error); 