const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcrypt');

const dbPath = path.join(__dirname, 'dress.db');
const db = new sqlite3.Database(dbPath);

function initialize() {
    db.serialize(() => {
        // Dresses table
        db.run(`
            CREATE TABLE IF NOT EXISTS dresses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                affiliate_link TEXT NOT NULL,
                location TEXT,
                bought_date TEXT NOT NULL,
                bought_online INTEGER DEFAULT 0,  -- 0 = offline, 1 = online
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Dress images table (one-to-many)
        db.run(`
            CREATE TABLE IF NOT EXISTS dress_images (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                dress_id INTEGER NOT NULL,
                image_path TEXT NOT NULL,
                FOREIGN KEY (dress_id) REFERENCES dresses(id) ON DELETE CASCADE
            )
        `);

        // Admin table
        db.run(`
            CREATE TABLE IF NOT EXISTS admin (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
            )
        `);

        // Create default admin if not exists
        db.get('SELECT * FROM admin WHERE username = ?', ['admin'], (err, row) => {
            if (!row) {
                const hash = bcrypt.hashSync('admin123', 10);
                db.run('INSERT INTO admin (username, password) VALUES (?, ?)', ['admin', hash], (err) => {
                    if (err) console.error('Error creating admin:', err);
                    else console.log('Default admin created: admin / admin123');
                });
            }
        });
    });
}

// Helper to get a dress with its images
function getDressWithImages(id) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM dresses WHERE id = ?', [id], (err, dress) => {
            if (err) return reject(err);
            if (!dress) return resolve(null);
            db.all('SELECT image_path FROM dress_images WHERE dress_id = ?', [id], (err, images) => {
                if (err) reject(err);
                else {
                    dress.images = images.map(img => img.image_path);
                    resolve(dress);
                }
            });
        });
    });
}

// Get all dresses with their images
function getAllDresses() {
    return new Promise((resolve, reject) => {
        db.all('SELECT * FROM dresses ORDER BY created_at DESC', [], (err, dresses) => {
            if (err) return reject(err);
            const promises = dresses.map(dress => {
                return new Promise((res, rej) => {
                    db.all('SELECT image_path FROM dress_images WHERE dress_id = ?', [dress.id], (err, images) => {
                        if (err) rej(err);
                        else {
                            dress.images = images.map(img => img.image_path);
                            res(dress);
                        }
                    });
                });
            });
            Promise.all(promises).then(resolve).catch(reject);
        });
    });
}

// Add a new dress with multiple images
function addDress(affiliate_link, location, bought_date, bought_online, imagePaths) {
    return new Promise((resolve, reject) => {
        db.run(
            'INSERT INTO dresses (affiliate_link, location, bought_date, bought_online) VALUES (?, ?, ?, ?)',
            [affiliate_link, location || null, bought_date, bought_online ? 1 : 0],
            function(err) {
                if (err) return reject(err);
                const dressId = this.lastID;
                const stmt = db.prepare('INSERT INTO dress_images (dress_id, image_path) VALUES (?, ?)');
                imagePaths.forEach(path => {
                    stmt.run(dressId, path);
                });
                stmt.finalize(err => {
                    if (err) reject(err);
                    else resolve(dressId);
                });
            }
        );
    });
}

// Delete a dress and its images (cascade via foreign key)
function deleteDress(id) {
    return new Promise((resolve, reject) => {
        db.run('DELETE FROM dresses WHERE id = ?', [id], function(err) {
            if (err) reject(err);
            else resolve({ changes: this.changes });
        });
    });
}

// Admin function (unchanged)
function getAdminByUsername(username) {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM admin WHERE username = ?', [username], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function updateAdmin(id, username, passwordHash) {
    return new Promise((resolve, reject) => {
        db.run(
            'UPDATE admin SET username = ?, password = ? WHERE id = ?',
            [username, passwordHash, id],
            function(err) {
                if (err) reject(err);
                else resolve({ changes: this.changes });
            }
        );
    });
}

function usernameExists(username, excludeId) {
    return new Promise((resolve, reject) => {
        db.get('SELECT id FROM admin WHERE username = ? AND id != ?', [username, excludeId || 0], (err, row) => {
            if (err) reject(err);
            else resolve(!!row);
        });
    });
}

module.exports = {
    initialize,
    getAllDresses,
    getDressWithImages,
    addDress,
    deleteDress,
    getAdminByUsername,
    updateAdmin,          // new
    usernameExists        // new
};