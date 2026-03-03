const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const multer = require('multer');
const path = require('path');
const db = require('../db/database');
const { isAuthenticated } = require('../middleware/auth');
const fs = require('fs');

// Multer setup for multiple files
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/'),
    filename: (req, file, cb) => {
        const unique = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, unique + path.extname(file.originalname));
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const types = /jpeg|jpg|png|gif|webp/;
        const ext = types.test(path.extname(file.originalname).toLowerCase());
        const mime = types.test(file.mimetype);
        ext && mime ? cb(null, true) : cb(new Error('Only images allowed'));
    }
});

// Login page
router.get('/login', (req, res) => {
    if (req.session.adminId) return res.redirect('/admin/dashboard');
    res.render('admin/login', { error: null });
});

// Login POST
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const admin = await db.getAdminByUsername(username);
        if (!admin || !bcrypt.compareSync(password, admin.password)) {
            return res.render('admin/login', { error: 'Invalid credentials' });
        }
        req.session.adminId = admin.id;
        req.session.adminUsername = admin.username;
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Database error');
    }
});

// Dashboard (protected)
router.get('/dashboard', isAuthenticated, async (req, res) => {
    try {
        const dresses = await db.getAllDresses();
        res.render('admin/dashboard', { dresses });
    } catch (err) {
        console.error(err);
        res.status(500).send('Database error');
    }
});

// Upload new dress (protected) - now accepts multiple images
router.post('/upload', isAuthenticated, upload.array('dressImages', 5), async (req, res) => {
    const { affiliateLink, location, boughtDate, boughtOnline } = req.body;
    if (!req.files || req.files.length === 0) {
        return res.status(400).send('At least one image required');
    }
    // If bought online, location can be empty; otherwise required.
    if (!boughtOnline && !location) {
        return res.status(400).send('Location required for offline purchase');
    }
    const imagePaths = req.files.map(file => '/uploads/' + file.filename);
    try {
        await db.addDress(affiliateLink, location, boughtDate, boughtOnline === 'on', imagePaths);
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Database error');
    }
});

// Delete dress (protected)
router.post('/delete/:id', isAuthenticated, async (req, res) => {
    const id = req.params.id;
    try {
        const dress = await db.getDressWithImages(id);
        if (dress) {
            // Delete image files
            dress.images.forEach(imgPath => {
                const filePath = path.join(__dirname, '../public', imgPath);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            });
            await db.deleteDress(id);
        }
        res.redirect('/admin/dashboard');
    } catch (err) {
        console.error(err);
        res.status(500).send('Database error');
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

module.exports = router;

// Profile page (protected)
router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        const admin = await db.getAdminByUsername(req.session.adminUsername);
        res.render('admin/profile', { admin, error: null, success: null });
    } catch (err) {
        console.error(err);
        res.status(500).send('Database error');
    }
});

// Profile update (protected)
router.post('/profile', isAuthenticated, async (req, res) => {
    const { currentPassword, newUsername, newPassword, confirmPassword } = req.body;
    try {
        const admin = await db.getAdminByUsername(req.session.adminUsername);
        if (!admin || !bcrypt.compareSync(currentPassword, admin.password)) {
            return res.render('admin/profile', { 
                admin, 
                error: 'Current password is incorrect', 
                success: null 
            });
        }

        let username = admin.username;
        let passwordHash = admin.password;
        let changed = false;

        // Username change
        if (newUsername && newUsername.trim() !== admin.username) {
            const exists = await db.usernameExists(newUsername.trim(), admin.id);
            if (exists) {
                return res.render('admin/profile', { 
                    admin, 
                    error: 'Username already taken', 
                    success: null 
                });
            }
            username = newUsername.trim();
            changed = true;
        }

        // Password change
        if (newPassword) {
            if (newPassword !== confirmPassword) {
                return res.render('admin/profile', { 
                    admin, 
                    error: 'New passwords do not match', 
                    success: null 
                });
            }
            passwordHash = bcrypt.hashSync(newPassword, 10);
            changed = true;
        }

        if (changed) {
            await db.updateAdmin(admin.id, username, passwordHash);
            req.session.adminUsername = username; // update session
        }

        const updatedAdmin = await db.getAdminByUsername(username);
        res.render('admin/profile', { 
            admin: updatedAdmin, 
            error: null, 
            success: 'Profile updated successfully!' 
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Database error');
    }
});